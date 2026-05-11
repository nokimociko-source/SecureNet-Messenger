package handler

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"

	"github.com/nokimociko-source/SecureNet-Messenger/core/api"
	"github.com/nokimociko-source/SecureNet-Messenger/core/auth"
	"github.com/nokimociko-source/SecureNet-Messenger/core/config"
	"github.com/nokimociko-source/SecureNet-Messenger/core/db"
	"github.com/nokimociko-source/SecureNet-Messenger/core/repository/postgres"
	"github.com/nokimociko-source/SecureNet-Messenger/core/services"
	"github.com/nokimociko-source/SecureNet-Messenger/core/websocket"
)

var (
	router      *gin.Engine
	database    *sql.DB
	hub         *websocket.Hub
	notifSvc    *services.NotificationService
	pusherSvc   *services.PusherService
	lastInitErr error
	initMu      sync.Mutex
)

func initApp() error {
	cfg := config.Load()
	if cfg.DatabaseURL == "" {
		return fmt.Errorf("DATABASE_URL is empty")
	}

	dbConn, err := db.Init(cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("DB connection failed: %w", err)
	}

	// 1. Run migrations
	if err := db.Migrate(dbConn); err != nil {
		return fmt.Errorf("migration failed: %w", err)
	}

	// 2. Load JWT keys from environment variables or system_configs
	var privKeyPEM, pubKeyPEM string
	
	// Try environment variables first
	privKeyPEM = os.Getenv("JWT_PRIVATE_KEY")
	pubKeyPEM = os.Getenv("JWT_PUBLIC_KEY")
	
	// Fallback to database if env vars not set
	if privKeyPEM == "" || pubKeyPEM == "" {
		_ = dbConn.QueryRow("SELECT value FROM system_configs WHERE key = 'jwt_private_key'").Scan(&privKeyPEM)
		_ = dbConn.QueryRow("SELECT value FROM system_configs WHERE key = 'jwt_public_key'").Scan(&pubKeyPEM)
	}

	if privKeyPEM == "" || pubKeyPEM == "" {
		return fmt.Errorf("JWT keys not found in environment or database. Please set JWT_PRIVATE_KEY and JWT_PUBLIC_KEY environment variables.")
	}

	log.Printf("🔑 Keys loaded from DB. Private length: %d, Public length: %d", len(privKeyPEM), len(pubKeyPEM))

	// 3. Parse with aggressive normalization
	privKey, err := auth.ParseRSAPrivateKey(privKeyPEM)
	if err != nil {
		// Log the actual string (masked) for debugging
		sample := ""
		if len(privKeyPEM) > 20 {
			sample = privKeyPEM[:10] + "..." + privKeyPEM[len(privKeyPEM)-10:]
		}
		return fmt.Errorf("failed to parse JWT_PRIVATE_KEY (len:%d, data:%s): %v", len(privKeyPEM), sample, err)
	}

	pubKey, err := auth.ParseRSAPublicKey(pubKeyPEM)
	if err != nil {
		return fmt.Errorf("failed to parse JWT_PUBLIC_KEY: %v", err)
	}

	// Setup services
	newNotifSvc := services.NewNotificationService(dbConn)
	newPusherSvc := services.NewPusherService()
	chatRepo := postgres.NewChatRepo(dbConn)
	newHub := websocket.NewHub(chatRepo, newNotifSvc, newPusherSvc)
	go newHub.Run()

	if os.Getenv("GIN_MODE") == "release" {
		gin.SetMode(gin.ReleaseMode)
	}
	newRouter := gin.Default()

	newRouter.Use(func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		if origin == "" || strings.HasSuffix(origin, ".vercel.app") || origin == "http://localhost:5173" {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		}
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Device-Fingerprint")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	api.SetupRoutes(newRouter, dbConn, newHub, newNotifSvc, newPusherSvc, privKey, pubKey)

	database = dbConn
	notifSvc = newNotifSvc
	pusherSvc = newPusherSvc
	hub = newHub
	router = newRouter
	return nil
}

func Handler(w http.ResponseWriter, r *http.Request) {
	if router == nil {
		initMu.Lock()
		if router == nil {
			lastInitErr = initApp()
		}
		initMu.Unlock()
	}

	if lastInitErr != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(500)
		// Explicit error for debugging
		fmt.Fprintf(w, `{"error":%q}`, lastInitErr.Error())
		return
	}
	router.ServeHTTP(w, r)
}
