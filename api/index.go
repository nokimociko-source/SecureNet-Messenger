package handler

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"net/url"
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
	lastInitErr error
	initMu      sync.Mutex
)

func initApp() error {
	// Load configuration
	cfg := config.Load()
	if cfg.DatabaseURL == "" {
		return fmt.Errorf("database url is not set; checked keys: DATABASE_URL, POSTGRES_URL, POSTGRES_PRISMA_URL, SUPABASE_DB_URL, DB_URL")
	}

	log.Printf("Database URL source: %s", cfg.DatabaseURLSource)
	log.Printf("Connecting to DB: %s", redactURL(cfg.DatabaseURL))

	// Initialize database
	dbConn, err := db.Init(cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}

	// Run migrations
	if err := db.Migrate(dbConn); err != nil {
		log.Printf("⚠️ Migration warning: %v", err)
	}

	// Initialize services
	newNotifSvc := services.NewNotificationService(dbConn)
	chatRepo := postgres.NewChatRepo(dbConn)

	// Setup WebSocket hub (Logic compatibility)
	newHub := websocket.NewHub(chatRepo, newNotifSvc)
	go newHub.Run()

	// Setup Gin
	if os.Getenv("GIN_MODE") == "release" {
		gin.SetMode(gin.ReleaseMode)
	}
	newRouter := gin.Default()

	// CORS Configuration — dynamic for Vercel preview deployments
	newRouter.Use(func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")

		// Allow: localhost dev, any *.vercel.app deployment, and custom origins from env
		allowed := origin == "http://localhost:5173" ||
			strings.HasSuffix(origin, ".vercel.app") ||
			strings.HasSuffix(origin, ".vercel.app/")

		if !allowed {
			if raw := os.Getenv("CORS_ALLOWED_ORIGINS"); raw != "" {
				for _, o := range strings.Split(raw, ",") {
					if strings.TrimSpace(o) == origin || strings.TrimSpace(o) == strings.TrimPrefix(origin, "https://") {
						allowed = true
						break
					}
				}
			}
		}

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
		ticket := newHub.IssueTicket(claims.UserID, claims.Username)
		c.JSON(200, gin.H{"ticket": ticket})
	}

	newRouter.POST("/api/ws-ticket", wsTicketHandler)

	// Main API routes
	api.SetupRoutes(newRouter, dbConn, newHub, newNotifSvc)

	// WebSocket fallback error
	newRouter.GET("/api/ws", func(c *gin.Context) {
		c.JSON(http.StatusNotImplemented, gin.H{
			"error": "WebSockets are not supported on Vercel Serverless.",
		})
	})

	database = dbConn
	notifSvc = newNotifSvc
	hub = newHub
	router = newRouter
	return nil
}

func redactURL(raw string) string {
	parsed, err := url.Parse(raw)
	if err != nil {
		return "[invalid DATABASE_URL]"
	}
	if parsed.User != nil {
		username := parsed.User.Username()
		if username != "" {
			parsed.User = url.UserPassword(username, "***")
		} else {
			parsed.User = url.UserPassword("***", "***")
		}
	}
	q := parsed.Query()
	if q.Get("password") != "" {
		q.Set("password", "***")
		parsed.RawQuery = q.Encode()
	}
	return parsed.String()
}

// Handler is the entry point for Vercel
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
		initErr := "Server initialization failed. Check database environment variables in Vercel settings."
		if lastInitErr != nil {
			initErr = fmt.Sprintf("Server initialization failed: %s", lastInitErr.Error())
		}
		w.Write([]byte(fmt.Sprintf(`{"error":%q}`, initErr)))
		return
	}
	router.ServeHTTP(w, r)
}
