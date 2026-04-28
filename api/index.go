package handler

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"securenet-backend/core/api"
	"securenet-backend/core/auth"
	"securenet-backend/core/config"
	"securenet-backend/core/db"
	"securenet-backend/core/repository/postgres"
	"securenet-backend/core/services"
	"securenet-backend/core/websocket"
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
	// Load configuration
	cfg := config.Load()
	if cfg.DatabaseURL == "" {
		return fmt.Errorf("database url is not set")
	}

	// Initialize database
	dbConn, err := db.Init(cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}

	// 1. Run migrations first (to ensure system_configs table exists)
	if err := db.Migrate(dbConn); err != nil {
		log.Printf("⚠️ Migration warning: %v", err)
	}

	// 2. Load JWT keys with Database-First approach
	var privKeyPEM, pubKeyPEM string
	
	// Try loading from Database
	_ = dbConn.QueryRow("SELECT value FROM system_configs WHERE key = 'jwt_private_key'").Scan(&privKeyPEM)
	if privKeyPEM != "" {
		_ = dbConn.QueryRow("SELECT value FROM system_configs WHERE key = 'jwt_public_key'").Scan(&pubKeyPEM)
		log.Println("🔑 JWT keys loaded from database")
	}

	// Fallback to Env Vars (Bootstrap phase)
	if privKeyPEM == "" || pubKeyPEM == "" {
		log.Println("⚠️ JWT keys not found in database, falling back to environment variables")
		privKeyPEM = os.Getenv("JWT_PRIVATE_KEY")
		pubKeyPEM = os.Getenv("JWT_PUBLIC_KEY")
		
		if privKeyPEM == "" || pubKeyPEM == "" {
			return fmt.Errorf("JWT_PRIVATE_KEY or JWT_PUBLIC_KEY is missing from both DB and Env")
		}

		// Save to DB for future runs (to avoid Vercel corruption)
		_, _ = dbConn.Exec("INSERT INTO system_configs (key, value) VALUES ('jwt_private_key', $1) ON CONFLICT (key) DO UPDATE SET value = $1", privKeyPEM)
		_, _ = dbConn.Exec("INSERT INTO system_configs (key, value) VALUES ('jwt_public_key', $1) ON CONFLICT (key) DO UPDATE SET value = $1", pubKeyPEM)
		log.Println("✅ JWT keys migrated from environment to database")
	}

	privKey, err := auth.ParseRSAPrivateKey(privKeyPEM)
	if err != nil {
		return fmt.Errorf("failed to parse JWT_PRIVATE_KEY: %v", err)
	}

	pubKey, err := auth.ParseRSAPublicKey(pubKeyPEM)
	if err != nil {
		return fmt.Errorf("failed to parse JWT_PUBLIC_KEY: %v", err)
	}

	// Initialize services
	newNotifSvc := services.NewNotificationService(dbConn)
	newPusherSvc := services.NewPusherService()
	chatRepo := postgres.NewChatRepo(dbConn)

	// Setup WebSocket hub
	newHub := websocket.NewHub(chatRepo, newNotifSvc, newPusherSvc)
	go newHub.Run()

	// Setup Gin
	if os.Getenv("GIN_MODE") == "release" {
		gin.SetMode(gin.ReleaseMode)
	}
	newRouter := gin.Default()

	// CORS
	newRouter.Use(func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		allowed := origin == "http://localhost:5173" || strings.HasSuffix(origin, ".vercel.app")
		if allowed {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		}
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With, X-Auth-Token, X-Device-Fingerprint")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE, PATCH")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// Routes
	newRouter.GET("/api/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "time": time.Now()})
	})

	// Main API routes
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
			if err := initApp(); err != nil {
				lastInitErr = err
				log.Printf("❌ Failed to initialize app: %v", err)
			} else {
				lastInitErr = nil
			}
		}
		initMu.Unlock()
	}

	if router == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(500)
		initErr := "Server initialization failed."
		if lastInitErr != nil {
			initErr = fmt.Sprintf("Server initialization failed: %s", lastInitErr.Error())
		}
		w.Write([]byte(fmt.Sprintf(`{"error":%q}`, initErr)))
		return
	}
	router.ServeHTTP(w, r)
}
