package main

import (
	"log"
	"os"

	"github.com/gin-gonic/gin"

	"securenet-backend/internal/api"
	"securenet-backend/internal/auth"
	"securenet-backend/internal/config"
	"securenet-backend/internal/db"
	"securenet-backend/internal/repository/postgres"
	"securenet-backend/internal/services"
	"securenet-backend/internal/websocket"
	"strings"

	"github.com/joho/godotenv"
)

func main() {
	// Load .env file
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using system environment variables")
	}

	// Load configuration
	cfg := config.Load()

	// Initialize database
	database, err := db.Init(cfg.DatabaseURL)
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	defer database.Close()

	// Run migrations
	if err := db.Migrate(database); err != nil {
		log.Printf("⚠️ Migration warning: %v", err)
	}

	// Initialize Notification Service
	notifSvc := services.NewNotificationService(database)

	// Initialize repositories for WS
	chatRepo := postgres.NewChatRepo(database)

	// Setup WebSocket hub
	hub := websocket.NewHub(chatRepo, notifSvc)
	go hub.Run()

	// Setup Gin router
	if os.Getenv("GIN_MODE") == "release" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.Default()

	// ✅ ROBUST CORS MIDDLEWARE
	router.Use(func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		if origin == "http://localhost:5173" {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		}
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With, X-Auth-Token")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE, PATCH")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	})

	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// ✅ WebSocket Ticket (Protected by CORS middleware)
	router.POST("/ws-ticket", func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if !strings.HasPrefix(authHeader, "Bearer ") {
			c.AbortWithStatus(401)
			return
		}
		token := strings.TrimPrefix(authHeader, "Bearer ")
		claims, err := auth.ValidateToken(token, cfg.JWTSecret)
		if err != nil {
			c.AbortWithStatus(401)
			return
		}
		ticket := hub.IssueTicket(claims.UserID, claims.Username)
		c.JSON(200, gin.H{"ticket": ticket})
	})

	// ✅ FALLBACK FOR 404 (Ensures CORS headers even on 404)
	router.NoRoute(func(c *gin.Context) {
		c.JSON(404, gin.H{"error": "Route not found", "path": c.Request.URL.Path})
	})

	// API routes (including WebSocket with Ticket auth)
	api.SetupRoutes(router, database, hub, notifSvc)

	// Start server
	port := cfg.Port
	if port == "" {
		port = "8080"
	}

	log.Printf("🚀 Server starting on http://127.0.0.1:%s", port)
	if err := router.Run("127.0.0.1:" + port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}
