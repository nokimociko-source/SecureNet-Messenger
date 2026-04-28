package handler

import (
	"database/sql"
	"encoding/base64"
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
	pusherSvc   *services.PusherService
	lastInitErr error
	initMu      sync.Mutex
)

func initApp() error {
	// Load configuration
	cfg := config.Load()
	if cfg.DatabaseURL == "" {
		return fmt.Errorf("database url is not set; checked keys: %s; available keys: %s", strings.Join(config.DatabaseURLCandidateKeys(), ", "), strings.Join(discoveredDatabaseEnvKeys(), ", "))
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
	newPusherSvc := services.NewPusherService()
	chatRepo := postgres.NewChatRepo(dbConn)

	// Setup WebSocket hub (Logic compatibility + Pusher fallback)
	newHub := websocket.NewHub(chatRepo, newNotifSvc, newPusherSvc)
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

	// Load and parse JWT keys (stored as base64 in env vars)
	privKeyB64 := os.Getenv("JWT_PRIVATE_KEY")
	pubKeyB64 := os.Getenv("JWT_PUBLIC_KEY")
	
	if privKeyB64 == "" || pubKeyB64 == "" {
		return fmt.Errorf("JWT_PRIVATE_KEY or JWT_PUBLIC_KEY is missing")
	}

	privKeyPEM, err := base64.StdEncoding.DecodeString(strings.TrimSpace(privKeyB64))
	if err != nil {
		return fmt.Errorf("failed to base64-decode JWT_PRIVATE_KEY: %v", err)
	}

	pubKeyPEM, err := base64.StdEncoding.DecodeString(strings.TrimSpace(pubKeyB64))
	if err != nil {
		return fmt.Errorf("failed to base64-decode JWT_PUBLIC_KEY: %v", err)
	}

	privKey, err := auth.ParseRSAPrivateKey(string(privKeyPEM))
	if err != nil {
		return fmt.Errorf("failed to parse JWT_PRIVATE_KEY: %v", err)
	}

	pubKey, err := auth.ParseRSAPublicKey(string(pubKeyPEM))
	if err != nil {
		return fmt.Errorf("failed to parse JWT_PUBLIC_KEY: %v", err)
	}

	// Main API routes
	api.SetupRoutes(newRouter, dbConn, newHub, newNotifSvc, newPusherSvc, privKey, pubKey)

	// WebSocket fallback error
	newRouter.GET("/api/ws", func(c *gin.Context) {
		c.JSON(http.StatusNotImplemented, gin.H{
			"error": "WebSockets are not supported on Vercel Serverless.",
		})
	})

	database = dbConn
	notifSvc = newNotifSvc
	pusherSvc = newPusherSvc
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

func discoveredDatabaseEnvKeys() []string {
	candidates := config.DatabaseURLCandidateKeys()
	discovered := make([]string, 0, len(candidates))
	for _, key := range candidates {
		if value, ok := os.LookupEnv(key); ok && strings.TrimSpace(value) != "" {
			discovered = append(discovered, key)
		}
	}
	if len(discovered) == 0 {
		for _, raw := range os.Environ() {
			envKey, envValue, found := strings.Cut(raw, "=")
			if !found || strings.TrimSpace(envValue) == "" {
				continue
			}
			trimmed := strings.TrimSpace(envKey)
			for _, key := range candidates {
				if strings.EqualFold(trimmed, key) {
					discovered = append(discovered, envKey)
					break
				}
			}
		}
	}
	if len(discovered) == 0 {
		return []string{"<none>"}
	}
	return discovered
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
		initErr := "Server initialization failed. Check DATABASE_URL and related DB variables in Vercel settings."
		if lastInitErr != nil {
			initErr = fmt.Sprintf("Server initialization failed: %s", lastInitErr.Error())
		}
		w.Write([]byte(fmt.Sprintf(`{"error":%q}`, initErr)))
		return
	}
	router.ServeHTTP(w, r)
}
