package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/nokimociko-source/SecureNet-Messenger/core/api"
	"github.com/nokimociko-source/SecureNet-Messenger/core/auth"
	"github.com/nokimociko-source/SecureNet-Messenger/core/config"
	"github.com/nokimociko-source/SecureNet-Messenger/core/db"
	"github.com/nokimociko-source/SecureNet-Messenger/core/repository/postgres"
	"github.com/nokimociko-source/SecureNet-Messenger/core/services"
	"github.com/nokimociko-source/SecureNet-Messenger/core/websocket"
)

func main() {
	cfg := config.Load()
	if cfg.DatabaseURL == "" {
		log.Fatal("DATABASE_URL is empty")
	}

	dbConn, err := db.Init(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("DB connection failed: %v", err)
	}

	// Run migrations
	if err := db.Migrate(dbConn); err != nil {
		log.Fatalf("Migration failed: %v", err)
	}

	// Load JWT keys from environment variables or system_configs
	var privKeyPEM, pubKeyPEM string

	privKeyPEM = os.Getenv("JWT_PRIVATE_KEY")
	pubKeyPEM = os.Getenv("JWT_PUBLIC_KEY")

	if privKeyPEM == "" || pubKeyPEM == "" {
		_ = dbConn.QueryRow("SELECT value FROM system_configs WHERE key = 'jwt_private_key'").Scan(&privKeyPEM)
		_ = dbConn.QueryRow("SELECT value FROM system_configs WHERE key = 'jwt_public_key'").Scan(&pubKeyPEM)
	}

	if privKeyPEM == "" || pubKeyPEM == "" {
		log.Fatal("JWT keys not found in environment or database. Please set JWT_PRIVATE_KEY and JWT_PUBLIC_KEY environment variables.")
	}

	log.Printf("🔑 Keys loaded. Private length: %d, Public length: %d", len(privKeyPEM), len(pubKeyPEM))

	privKey, err := auth.ParseRSAPrivateKey(privKeyPEM)
	if err != nil {
		sample := ""
		if len(privKeyPEM) > 20 {
			sample = privKeyPEM[:10] + "..." + privKeyPEM[len(privKeyPEM)-10:]
		}
		log.Fatalf("Failed to parse JWT_PRIVATE_KEY (len:%d, data:%s): %v", len(privKeyPEM), sample, err)
	}

	pubKey, err := auth.ParseRSAPublicKey(pubKeyPEM)
	if err != nil {
		log.Fatalf("Failed to parse JWT_PUBLIC_KEY: %v", err)
	}

	// Setup services
	notifSvc := services.NewNotificationService(dbConn)
	pusherSvc := services.NewPusherService()
	chatRepo := postgres.NewChatRepo(dbConn)
	hub := websocket.NewHub(chatRepo, notifSvc, pusherSvc)
	go hub.Run()

	if os.Getenv("GIN_MODE") == "release" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.Default()

	// CORS middleware
	router.Use(func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		allowedOrigins := []string{
			"http://localhost:5173",
			"http://localhost:4173",
		}

		allowed := false
		for _, o := range allowedOrigins {
			if origin == o || strings.HasSuffix(origin, ".vercel.app") || strings.HasSuffix(origin, ".catlover.app") {
				allowed = true
				break
			}
		}
		if allowed && origin != "" {
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

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		// Check DB connection
		if err := dbConn.Ping(); err != nil {
			c.JSON(503, gin.H{"status": "unhealthy", "db": "disconnected"})
			return
		}
		c.JSON(200, gin.H{"status": "healthy", "db": "connected"})
	})

	api.SetupRoutes(router, dbConn, hub, notifSvc, pusherSvc, privKey, pubKey)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("🚀 Catlover Backend starting on :%s", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Server failed: %v", err)
	}

	_ = fmt.Sprintf("%v%v%v%v", sql.ErrNoRows, cfg, pubKey, strings.Contains("", ""))
}
