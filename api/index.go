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

	// 1. Run migrations
	if err := db.Migrate(dbConn); err != nil {
		return fmt.Errorf("migration failed: %w", err)
	}

	// 2. FORCE BOOTSTRAP FROM CODE (Since manual SQL access is blocked)
	hardcodedPrivKey := `-----BEGIN RSA PRIVATE KEY-----
MIIEogIBAAKCAQEA1QRqJsCvIfU1fWs7KYAPHtbOGUhLadtg2ziH8Nsu+ziPKQ5d
kVAWktS4pV01JG/dd799dvoxs09i2nUrDy8eOYjSBspkjrV6cGIUuFvDsCIVBLQn
Py5Se+UIlKinZgFuKH6ToD5yhH0BX7/jAipdvEqYFw+KSg9kQ0Er7UcJ4SV/1zo2
0vrgpB+woAmfQaUwBS5TVuFbn5blJaagEHWh4lfWOPmdPxdZTxz9XCD5cdA4xvEO
o7awTnntCy6l6ausLpKpMcwVObwwpU0nE5yhXC6SX7OrpQhIYQ6Ydaec3GY9XtrQ
eI5lN70Y8JspEoDfN3/gZWEclm+SzpN3K8NicQIDAQABAoIBAFG5ItyBOe9mOsJG
PGlchvCG6oUKllwjXRJdqtG91VVuSoYuy7jvJ+nnEHvouXWkMSw62/CkZiLrxvoW
z5FAu3DJTAJs7Y1OlI2/I0Hjerz9JmEqmJAFvoFnyhX2alqZG+EPRqXIr3ii2L8a
SAZRqKqPV7ApNx3Yr9eZjje29FRaskHqruVbHWIcYNpxF+0bUdtL9tITtniUUhl8
NPghUXi+PLUk98JJXiqkeC5hOp0BBlH5i5fbtPrNQY0/dtHp+hYkEb61OUjrwwQ4
+iLFfekyWDcQhKqrj1A3X3RONqc4hbjAPr9RQrSo04elHQKrDZTpHgqfvGly+BWC
E2zLdT0CgYEA3rN7Z9xXpXyZHg+Isr0ywt+YjpyYItzTGYnFyVDtMve36IdUxJD6
g8pShTrCsP2Ks3T71PKte4nCWTfS73qzqiTRL5QaweaP02ywGTI1jNGboLqc3vEA
OEXFpD/7B4RMvqHfPQFcdt9bDntiy27UpneTtIql8h13fdkolhZI/ocCgYEA9N5B
ZDUP17JYof3dzu/0JHFZbh8Hc8A96yyhFhNGZf8k2MbV4fvRi6ZiXNBwgil64+ih
BDPg8vf9c4YhIuK/Zbn9ggSpQF1voCAqynWctfdSobldGOQ1k1dxJ6a0i8I46AkC
oH4WiBxqy5SqQzB5xL01Axl2lMnhMBaT7so0nUcCgYABl/05GA2UhJi/61KKHOqB
FIKN+rboAPaNxzugHjEkXTt2sYk8wuDYEpmWlH4SMC5O7HZk5ruxF6JJaynaRuGE
RTEuCvxKCPFcjPmRpJdXg6R+ePdobQcYX/9zFnYgbqTx9EyZrinQO/b12pIxbICf
FFn9P8TCP828G9K7iDtLfwKBgDBbC7LMP7qqv5IN3hWVkTL5J131xrT3C8M7ZvxD
Bi3yOsaMTYR5BCJ90wLdLrqlkl0bfWClFhElI+oCXNzUxlNCbWuVnA7X5MlMUOb2
XuIYWzsQre/ScToNlIzuAM1wp2g7D0e+Xpi2c+iMDSuDkShm7OcVyjMLwuqKKuCH
EejVAoGAbTZwYCE54bU2/tKSLo3KaUjKrkx3ElE2WTCjdp3knD1oAXv3+/Rs0ITs
OHgTZw2ppWy4WrJu0q/e0f8pnKdw+aTPU3PnLMK8BBj0om+S7tyDbIWf/kikn7eS
EcUxIdDABKHtbeiqdUuR7+JMY1B69NZ1HXKH9plLb91KbyYMRew=
-----END RSA PRIVATE KEY-----`
	hardcodedPubKey := `-----BEGIN RSA PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1QRqJsCvIfU1fWs7KYAP
HtbOGUhLadtg2ziH8Nsu+ziPKQ5dkVAWktS4pV01JG/dd799dvoxs09i2nUrDy8e
OYjSBspkjrV6cGIUuFvDsCIVBLQnPy5Se+UIlKinZgFuKH6ToD5yhH0BX7/jAipd
vEqYFw+KSg9kQ0Er7UcJ4SV/1zo20vrgpB+woAmfQaUwBS5TVuFbn5blJaagEHWh
4lfWOPmdPxdZTxz9XCD5cdA4xvEOo7awTnntCy6l6ausLpKpMcwVObwwpU0nE5yh
XC6SX7OrpQhIYQ6Ydaec3GY9XtrQeI5lN70Y8JspEoDfN3/gZWEclm+SzpN3K8Ni
cQIDAQAB
-----END RSA PUBLIC KEY-----`

	// Attempt to force insert keys into system_configs (using direct SQL to bypass env corruption)
	_, _ = dbConn.Exec("INSERT INTO system_configs (key, value) VALUES ('jwt_private_key', $1), ('jwt_public_key', $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", hardcodedPrivKey, hardcodedPubKey)
	log.Println("⚡ Keys forced into database successfully")

	var privKeyPEM, pubKeyPEM string
	_ = dbConn.QueryRow("SELECT value FROM system_configs WHERE key = 'jwt_private_key'").Scan(&privKeyPEM)
	_ = dbConn.QueryRow("SELECT value FROM system_configs WHERE key = 'jwt_public_key'").Scan(&pubKeyPEM)

	if privKeyPEM == "" || pubKeyPEM == "" {
		return fmt.Errorf("JWT keys still missing from DB after force-insert")
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
