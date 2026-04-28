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
	cfg := config.Load()
	if cfg.DatabaseURL == "" {
		return fmt.Errorf("DATABASE_URL is empty")
	}

	dbConn, err := db.Init(cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("DB connection failed: %w", err)
	}

	// 1. MUST run migrations first to ensure system_configs exists
	if err := db.Migrate(dbConn); err != nil {
		log.Printf("Migration warning: %v", err)
	}

	// 2. Load keys from DB with total silence on missing keys (we'll handle it below)
	var privKeyPEM, pubKeyPEM string
	_ = dbConn.QueryRow("SELECT value FROM system_configs WHERE key = 'jwt_private_key'").Scan(&privKeyPEM)
	_ = dbConn.QueryRow("SELECT value FROM system_configs WHERE key = 'jwt_public_key'").Scan(&pubKeyPEM)

	// 3. If DB is empty, bootstrap from Env
	if privKeyPEM == "" || pubKeyPEM == "" {
		log.Println("Initializing keys from environment...")
		privKeyPEM = os.Getenv("JWT_PRIVATE_KEY")
		pubKeyPEM = os.Getenv("JWT_PUBLIC_KEY")

		if privKeyPEM != "" && pubKeyPEM != "" {
			_, _ = dbConn.Exec("INSERT INTO system_configs (key, value) VALUES ('jwt_private_key', $1), ('jwt_public_key', $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", privKeyPEM, pubKeyPEM)
		}
	}

	// Final check
	if privKeyPEM == "" || pubKeyPEM == "" {
		return fmt.Errorf("JWT keys missing in both DB and Environment")
	}

	privKey, err := auth.ParseRSAPrivateKey(privKeyPEM)
	if err != nil {
		return fmt.Errorf("failed to parse JWT_PRIVATE_KEY: %v", err)
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
		fmt.Fprintf(w, `{"error":"Server initialization failed: %v"}`, lastInitErr)
		return
	}
	router.ServeHTTP(w, r)
}
