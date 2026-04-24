package handler

import (
	"database/sql"
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
	router   *gin.Engine
	database *sql.DB
	hub      *websocket.Hub
	notifSvc *services.NotificationService
	once     sync.Once
)

func initApp() {
	// Load configuration
	cfg := config.Load()

	// Initialize database
	var err error
	database, err = db.Init(cfg.DatabaseURL)
	if err != nil {
		log.Printf("❌ Failed to connect to database: %v", err)
		return
	}

	// Run migrations
	if err := db.Migrate(database); err != nil {
		log.Printf("⚠️ Migration warning: %v", err)
	}

	// Initialize services
	notifSvc = services.NewNotificationService(database)
	chatRepo := postgres.NewChatRepo(database)
	
	// Setup WebSocket hub (Logic compatibility)
	hub = websocket.NewHub(chatRepo, notifSvc)
	go hub.Run()

	// Setup Gin
	if os.Getenv("GIN_MODE") == "release" {
		gin.SetMode(gin.ReleaseMode)
	}
	router = gin.Default()

	// CORS Configuration
	allowedOrigins := map[string]bool{
		"http://localhost:5173": true,
		"project-p54pd.vercel.app": true,
	}
	if raw := os.Getenv("CORS_ALLOWED_ORIGINS"); raw != "" {
		for _, origin := range strings.Split(raw, ",") {
			allowedOrigins[strings.TrimSpace(origin)] = true
		}
	}

	router.Use(func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		if allowedOrigins[origin] || allowedOrigins[strings.TrimPrefix(origin, "https://")] {
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

	// Routes
	router.GET("/api/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "server": "Vercel Serverless", "time": time.Now()})
	})

	wsTicketHandler := func(c *gin.Context) {
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
	}

	router.POST("/api/ws-ticket", wsTicketHandler)
	
	// Main API routes
	api.SetupRoutes(router, database, hub, notifSvc)

	// WebSocket fallback error
	router.GET("/api/ws", func(c *gin.Context) {
		c.JSON(http.StatusNotImplemented, gin.H{
			"error": "WebSockets are not supported on Vercel Serverless.",
		})
	})
}

// Handler is the entry point for Vercel
func Handler(w http.ResponseWriter, r *http.Request) {
	once.Do(initApp)
	if router == nil {
		http.Error(w, "Internal Server Error: Router not initialized", 500)
		return
	}
	router.ServeHTTP(w, r)
}
