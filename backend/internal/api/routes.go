package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/pquerna/otp/totp"

	"securenet-backend/internal/auth"
	"securenet-backend/internal/config"
	"securenet-backend/internal/models"
	"securenet-backend/internal/repository/postgres"
	"securenet-backend/internal/services"
	"securenet-backend/internal/websocket"
)

type updateInfo struct {
	Version string `json:"version"`
	URL     string `json:"url"`
	SHA256  string `json:"sha256"`
	Notes   string `json:"notes"`
}

func SetupRoutes(r *gin.Engine, db *sql.DB, hub *websocket.Hub, notifSvc *services.NotificationService) {
	cfg := config.Load()
	auditService := services.NewAuditService(db)

	// Initialize repositories
	userRepo := postgres.NewUserRepo(db)
	chatRepo := postgres.NewChatRepo(db)
	deviceRepo := postgres.NewDeviceRepo(db)
	mediaRepo := postgres.NewMediaRepo(db)

	// Initialize services
	authSvc := services.NewAuthService(userRepo, cfg.JWTSecret)
	chatSvc := services.NewChatService(chatRepo, auditService)
	deviceSvc := services.NewDeviceService(deviceRepo, auditService)
	mediaSvc := services.NewMediaService(mediaRepo, auditService)
	socialSvc := services.NewSocialService(db)
	cryptoSvc := services.NewCryptoService(db)

	testToken := "8373955670:AAHa3LGqmu_FesuOUMZCUpvqhxGwWYzRADk"
	tgImporter := services.NewTelegramImporter(testToken, "./uploads", mediaSvc)

	// --- Telegram Bot Webhook ---
	r.POST("/api/telegram/webhook", func(c *gin.Context) {
		var update services.TelegramUpdate
		if err := c.ShouldBindJSON(&update); err != nil {
			return
		}

		if update.Message == nil {
			return
		}

		tgID := update.Message.From.ID
		botToken := testToken

		// Handle Start command for linking: /start <SecureNet-UUID>
		if strings.HasPrefix(update.Message.Text, "/start") {
			parts := strings.Split(update.Message.Text, " ")
			if len(parts) > 1 {
				secureNetID := parts[1]
				err := userRepo.LinkTelegramID(c.Request.Context(), secureNetID, tgID)
				if err == nil {
					sendTelegramMessage(botToken, tgID, "✅ Аккаунт успешно привязан! Теперь просто пришли мне любой стикер.")
				} else {
					sendTelegramMessage(botToken, tgID, "❌ Ошибка при привязке аккаунта.")
				}
			} else {
				sendTelegramMessage(botToken, tgID, "Привет! Чтобы привязать аккаунт, используй команду из настроек приложения.")
			}
			c.Status(http.StatusOK)
			return
		}

		// Handle Sticker import
		if update.Message.Sticker != nil {
			user, err := userRepo.GetByTelegramID(c.Request.Context(), tgID)
			if err != nil || user == nil {
				sendTelegramMessage(botToken, tgID, "⚠️ Твой Telegram не привязан к SecureNet. Зайди в настройки приложения, чтобы получить код привязки.")
				c.Status(http.StatusOK)
				return
			}

			_, err = tgImporter.ImportSticker(c.Request.Context(), user.ID, update.Message.Sticker.FileID)
			if err != nil {
				sendTelegramMessage(botToken, tgID, "❌ Не удалось импортировать стикер: "+err.Error())
			} else {
				sendTelegramMessage(botToken, tgID, "✅ Стикер добавлен в твою коллекцию!")
			}
		}
		c.Status(http.StatusOK)
	})

	// --- Auth & Security Group (Public + Semi-Protected) ---
	authGroup := r.Group("/api/auth")
	{
		authGroup.POST("/register", func(c *gin.Context) {
			var req struct {
				PhoneNumber string `json:"phoneNumber" binding:"required"`
				Email       string `json:"email"`
				Username    string `json:"username" binding:"required"`
				Password    string `json:"password" binding:"required,min=8"`
				PublicKey   string `json:"publicKey" binding:"required"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			user, token, err := authSvc.Register(c.Request.Context(), req.PhoneNumber, req.Email, req.Username, req.Password, req.PublicKey)
			if err != nil {
				c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusCreated, gin.H{"user": user, "token": token})
		})

		authGroup.POST("/login", func(c *gin.Context) {
			var req struct {
				PhoneNumber string `json:"phoneNumber" binding:"required"`
				Password    string `json:"password" binding:"required"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			user, token, err := authSvc.Login(c.Request.Context(), req.PhoneNumber, req.Password)
			if err != nil {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
				return
			}

			// Check if 2FA is enabled
			if user.TotpEnabled {
				// Return a temporary token and 2FA requirement
				c.JSON(http.StatusOK, gin.H{
					"status":    "pending_2fa",
					"tempToken": token,
					"userId":    user.ID,
				})
				return
			}

			c.JSON(http.StatusOK, gin.H{"user": user, "token": token})
		})

		authGroup.POST("/login/2fa", func(c *gin.Context) {
			var req struct {
				Token string `json:"token" binding:"required"`
				Code  string `json:"code" binding:"required"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			// Validate the temp token
			claims, err := auth.ValidateToken(req.Token, cfg.JWTSecret)
			if err != nil {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid session"})
				return
			}

			// Get user secret from DB
			secret, enabled, err := userRepo.GetTOTPSecret(c.Request.Context(), claims.UserID.String())
			if err != nil || !enabled {
				c.JSON(http.StatusBadRequest, gin.H{"error": "2FA not enabled for this user"})
				return
			}

			if !totp.Validate(req.Code, secret) {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid 2FA code"})
				return
			}

			// 2FA Success: Return full user data (fetch again to be sure)
			user, _ := userRepo.GetByID(c.Request.Context(), claims.UserID.String())
			c.JSON(http.StatusOK, gin.H{"user": user, "token": req.Token})
		})

		// 2FA Setup
		authGroup.POST("/2fa/setup", authMiddleware(cfg.JWTSecret), func(c *gin.Context) {
			userID := c.GetString("userId")
			username := c.GetString("username")

			key, err := totp.Generate(totp.GenerateOpts{
				Issuer:      "Catlover Messenger",
				AccountName: username,
			})
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate TOTP secret"})
				return
			}

			// Save secret temporarily or permanently as 'disabled'
			userRepo.UpdateTOTP(c.Request.Context(), userID, key.Secret(), false)

			c.JSON(http.StatusOK, gin.H{
				"secret": key.Secret(),
				"qrCode": key.URL(),
			})
		})

		authGroup.POST("/2fa/enable", authMiddleware(cfg.JWTSecret), func(c *gin.Context) {
			var req struct {
				Code string `json:"code" binding:"required"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			userID := c.GetString("userId")
			secret, _, err := userRepo.GetTOTPSecret(c.Request.Context(), userID)
			if err != nil || secret == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "TOTP setup not initiated"})
				return
			}

			if totp.Validate(req.Code, secret) {
				userRepo.UpdateTOTP(c.Request.Context(), userID, secret, true)
				c.JSON(http.StatusOK, gin.H{"status": "enabled"})
			} else {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid code"})
			}
		})

		authGroup.POST("/2fa/disable", authMiddleware(cfg.JWTSecret), func(c *gin.Context) {
			userID := c.GetString("userId")
			userRepo.UpdateTOTP(c.Request.Context(), userID, "", false)
			c.JSON(http.StatusOK, gin.H{"status": "disabled"})
		})

		authGroup.GET("/vapid-key", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"publicKey": cfg.VAPIDPublicKey})
		})

		authGroup.POST("/push-subscription", authMiddleware(cfg.JWTSecret), func(c *gin.Context) {
			var sub models.PushSubscription
			if err := c.ShouldBindJSON(&sub); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			userID := c.GetString("userId")
			if err := userRepo.SavePushSubscription(c.Request.Context(), userID, sub); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"status": "saved"})
		})
	}

	// Updates (Public)
	r.GET("/api/updates/latest", func(c *gin.Context) {
		platform := c.Query("platform")
		if platform == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "platform required"})
			return
		}

		// Use environment variables with sensible defaults
		androidVersion := os.Getenv("ANDROID_LATEST_VERSION")
		if androidVersion == "" { androidVersion = "0.1.0" }
		
		androidUrl := os.Getenv("ANDROID_APK_URL")
		if androidUrl == "" { androidUrl = "https://github.com/nokimociko-source/SecureNet-Messenger/releases" }

		winVersion := os.Getenv("WINDOWS_LATEST_VERSION")
		if winVersion == "" { winVersion = "0.1.0" }

		winUrl := os.Getenv("WINDOWS_INSTALLER_URL")
		if winUrl == "" { winUrl = "https://github.com/nokimociko-source/SecureNet-Messenger/releases" }

		cfgMap := map[string]updateInfo{
			"android": {
				Version: androidVersion,
				URL:     androidUrl,
				SHA256:  os.Getenv("ANDROID_APK_SHA256"),
				Notes:   os.Getenv("ANDROID_RELEASE_NOTES"),
			},
			"windows": {
				Version: winVersion,
				URL:     winUrl,
				SHA256:  os.Getenv("WINDOWS_INSTALLER_SHA256"),
				Notes:   os.Getenv("WINDOWS_RELEASE_NOTES"),
			},
		}

		upd := cfgMap[platform]
		c.JSON(http.StatusOK, gin.H{
			"platform":          platform,
			"version":           upd.Version,
			"url":               upd.URL,
			"sha256":            upd.SHA256,
			"releaseNotes":      upd.Notes,
			"signatureRequired": true,
		})
	})

	authorized := r.Group("/api")
	authorized.Use(authMiddleware(cfg.JWTSecret))
	{
		// WebSocket Ticket
		authorized.POST("/ws-ticket", func(c *gin.Context) {
			userIDStr := c.GetString("userId")
			username := c.GetString("username")
			userID, err := uuid.Parse(userIDStr)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
				return
			}
			ticket := hub.IssueTicket(userID, username)
			c.JSON(http.StatusOK, gin.H{"ticket": ticket})
		})

		// Audit (Admin only)
		authorized.GET("/audit/stats", func(c *gin.Context) {
			role := c.GetString("role")
			if role != "admin" && role != "moderator" {
				c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
				return
			}

			// Get Real Stats
			var totalUsers, messagesToday int
			db.QueryRow("SELECT COUNT(*) FROM users").Scan(&totalUsers)
			
			// Get message count for last 24h
			db.QueryRow("SELECT COUNT(*) FROM messages WHERE timestamp > $1", time.Now().Add(-24*time.Hour).Unix()).Scan(&messagesToday)

			// Get active connections from hub
			activeConnections := 0
			if hub != nil {
				activeConnections = len(hub.UserMap)
			}

			c.JSON(http.StatusOK, gin.H{
				"totalUsers":        totalUsers,
				"activeConnections": activeConnections,
				"messagesToday":     messagesToday,
			})
		})

		authorized.GET("/audit/activity/weekly", func(c *gin.Context) {
			role := c.GetString("role")
			if role != "admin" && role != "moderator" {
				c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
				return
			}

			// Get daily message counts for the last 7 days
			rows, err := db.Query(`
				SELECT 
					to_char(to_timestamp(timestamp), 'DD.MM') as day,
					COUNT(*) as count
				FROM messages 
				WHERE timestamp > $1
				GROUP BY day
				ORDER BY day ASC`, time.Now().Add(-7*24*time.Hour).Unix())
			
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			defer rows.Close()

			var labels []string
			var values []int
			for rows.Next() {
				var day string
				var count int
				rows.Scan(&day, &count)
				labels = append(labels, day)
				values = append(values, count)
			}

			c.JSON(http.StatusOK, gin.H{
				"labels": labels,
				"values": values,
			})
		})

		authorized.GET("/audit/logs", func(c *gin.Context) {
			role := c.GetString("role")
			if role != "admin" && role != "moderator" {
				c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
				return
			}
			limit, _ := parseInt(c.DefaultQuery("limit", "50"))
			offset, _ := parseInt(c.DefaultQuery("offset", "0"))
			logs, err := auditService.GetAuditLog(models.AuditFilter{Limit: limit, Offset: offset})
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusOK, logs)
		})

		// Admin - Reports
		authorized.GET("/admin/reports", func(c *gin.Context) {
			role := c.GetString("role")
			if role != "admin" && role != "moderator" {
				c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
				return
			}
			rows, err := db.Query(`
				SELECT r.id, r.reporter_id, u1.username as reporter_name, r.target_id, u2.username as target_name, r.reason, r.status, r.created_at 
				FROM reports r
				LEFT JOIN users u1 ON r.reporter_id = u1.id
				LEFT JOIN users u2 ON r.target_id = u2.id
				ORDER BY r.created_at DESC`)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			defer rows.Close()

			var results []gin.H
			for rows.Next() {
				var id, reporterID, targetID uuid.UUID
				var reporterName, targetName, reason, status string
				var createdAt time.Time
				rows.Scan(&id, &reporterID, &reporterName, &targetID, &targetName, &reason, &status, &createdAt)
				results = append(results, gin.H{
					"id":           id,
					"reporterId":   reporterID,
					"reporterName": reporterName,
					"targetId":     targetID,
					"targetName":   targetName,
					"reason":       reason,
					"status":       status,
					"createdAt":    createdAt,
				})
			}
			c.JSON(http.StatusOK, results)
		})

		authorized.GET("/admin/posts", func(c *gin.Context) {
			role := c.GetString("role")
			if role != "admin" && role != "moderator" {
				c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
				return
			}
			posts, err := socialSvc.GetFeed(uuid.Nil, 100, 0) // Passing uuid.Nil to get global feed for admin
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusOK, posts)
		})

		// Users
		authorized.GET("/users/search", func(c *gin.Context) {
			query := c.Query("q")
			users, err := socialSvc.SearchUsers(query)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusOK, users)
		})

		// Contacts
		authorized.GET("/contacts", func(c *gin.Context) {
			userID := c.GetString("userId")
			rows, err := db.Query(`
				SELECT c.id, c.contact_id, u.phone_number, u.username, u.public_key, c.is_favorite, c.is_blocked 
				FROM contacts c 
				JOIN users u ON c.contact_id = u.id 
				WHERE c.user_id = $1`, userID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch contacts"})
				return
			}
			defer rows.Close()

			var results []gin.H
			for rows.Next() {
				var id, contactID uuid.UUID
				var phone, user, pub string
				var fav, blocked bool
				rows.Scan(&id, &contactID, &phone, &user, &pub, &fav, &blocked)
				results = append(results, gin.H{
					"id":         id,
					"contactId":  contactID,
					"phone":      phone,
					"username":   user,
					"publicKey":  pub,
					"isFavorite": fav,
					"isBlocked":  blocked,
				})
			}
			c.JSON(http.StatusOK, results)
		})

		authorized.POST("/contacts", func(c *gin.Context) {
			var req struct {
				ContactID string `json:"contactId" binding:"required"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			userID := c.GetString("userId")
			_, err := db.Exec("INSERT INTO contacts (user_id, contact_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", userID, req.ContactID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add contact"})
				return
			}
			c.JSON(http.StatusCreated, gin.H{"message": "Contact added"})
		})

		authorized.POST("/contacts/sync", func(c *gin.Context) {
			var req struct {
				PhoneNumbers []string `json:"phoneNumbers" binding:"required"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			userID, _ := uuid.Parse(c.GetString("userId"))
			matched, err := socialSvc.SyncContacts(userID, req.PhoneNumbers)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusOK, matched)
		})

		authorized.GET("/stickers/my", func(c *gin.Context) {
			userID := c.GetString("userId")
			stickers, err := mediaSvc.GetUserStickers(c.Request.Context(), userID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusOK, stickers)
		})

		authorized.POST("/stickers/import-set", func(c *gin.Context) {
			var req struct {
				PackName string `json:"packName" binding:"required"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			userID, _ := uuid.Parse(c.GetString("userId"))
			
			// 1. Get sticker set info from Telegram
			url := fmt.Sprintf("https://api.telegram.org/bot%s/getStickerSet?name=%s", testToken, req.PackName)
			log.Printf("📥 Importing sticker pack: %s (URL: %s)", req.PackName, url)
			
			// Increased timeout and force IPv4 for better reliability
			dialer := &net.Dialer{
				Timeout:   30 * time.Second,
				KeepAlive: 30 * time.Second,
			}
			transport := &http.Transport{
				DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
					return dialer.DialContext(ctx, "tcp4", addr) // Force IPv4
				},
			}
			client := &http.Client{
				Transport: transport,
				Timeout:   60 * time.Second,
			}
			resp, err := client.Get(url)
			if err != nil {
				log.Printf("❌ Telegram API request failed after 60s: %v", err)
				c.JSON(http.StatusGatewayTimeout, gin.H{"error": "Telegram API unreachable. Check your network or VPN."})
				return
			}
			defer resp.Body.Close()

			log.Printf("📡 Telegram response status: %s", resp.Status)

			var result struct {
				OK     bool `json:"ok"`
				Result struct {
					Stickers []struct {
						FileID string `json:"file_id"`
					} `json:"stickers"`
				} `json:"result"`
			}
			json.NewDecoder(resp.Body).Decode(&result)

			if !result.OK {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Sticker pack not found or invalid"})
				return
			}

			// 2. Import each sticker (in background)
			go func() {
				for _, s := range result.Result.Stickers {
					tgImporter.ImportSticker(context.Background(), userID, s.FileID)
				}
			}()

			c.JSON(http.StatusOK, gin.H{"message": "Импорт запущен!", "count": len(result.Result.Stickers)})
		})

		// --- Start Telegram Polling in Background ---
		go func() {
			log.Println("🤖 Telegram Polling started...")
			var lastUpdateID int64
			for {
				url := fmt.Sprintf("https://api.telegram.org/bot%s/getUpdates?offset=%d&timeout=30", testToken, lastUpdateID+1)
				resp, err := http.Get(url)
				if err != nil {
					time.Sleep(5 * time.Second)
					continue
				}

				var result struct {
					OK     bool                      `json:"ok"`
					Result []services.TelegramUpdate `json:"result"`
				}
				json.NewDecoder(resp.Body).Decode(&result)
				resp.Body.Close()

				if result.OK {
					for _, update := range result.Result {
						lastUpdateID = int64(update.UpdateID)
						if update.Message == nil {
							continue
						}

						tgID := update.Message.From.ID

						// Reuse the logic from the webhook (handling /start and stickers)
						if strings.HasPrefix(update.Message.Text, "/start") {
							parts := strings.Split(update.Message.Text, " ")
							if len(parts) > 1 {
								userRepo.LinkTelegramID(context.Background(), parts[1], tgID)
								sendTelegramMessage(testToken, tgID, "✅ Привязано! Шли стикер.")
							}
						} else if update.Message.Sticker != nil {
							user, _ := userRepo.GetByTelegramID(context.Background(), tgID)
							if user != nil {
								tgImporter.ImportSticker(context.Background(), user.ID, update.Message.Sticker.FileID)
								sendTelegramMessage(testToken, tgID, "✅ Стикер улетел в Catlover!")
							}
						}
					}
				}
				time.Sleep(500 * time.Millisecond)
			}
		}()

		authorized.DELETE("/contacts/:id/block", func(c *gin.Context) {
			userID := c.GetString("userId")
			contactID := c.Param("id")
			db.Exec("UPDATE contacts SET is_blocked = false WHERE user_id = $1 AND contact_id = $2", userID, contactID)
			db.Exec("DELETE FROM blocked_users WHERE user_id = $1 AND blocked_user_id = $2", userID, contactID)
			c.JSON(http.StatusOK, gin.H{"message": "Unblocked"})
		})

		// Chats
		authorized.GET("/chats", func(c *gin.Context) {
			userID := c.GetString("userId")
			uid, _ := uuid.Parse(userID)
			chatSvc.EnsureSavedChat(c.Request.Context(), uid)
			chats, err := chatSvc.GetUserChats(c.Request.Context(), userID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch chats"})
				return
			}
			c.JSON(http.StatusOK, chats)
		})

		authorized.POST("/chats", func(c *gin.Context) {
			var req struct {
				ContactID string `json:"contactId" binding:"required"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			userID, _ := uuid.Parse(c.GetString("userId"))
			contactID, err := uuid.Parse(req.ContactID)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid contactId"})
				return
			}

			chat, err := chatSvc.CreateDirectChat(c.Request.Context(), userID, contactID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusCreated, chat)
		})

		// Messages
		authorized.GET("/chats/:chatId/messages", func(c *gin.Context) {
			chatID, _ := uuid.Parse(c.Param("chatId"))
			rows, err := db.Query(`
				SELECT m.id, m.sender_id, m.content, m.msg_type, m.status, m.timestamp, u.username, m.media_id 
				FROM messages m 
				JOIN users u ON m.sender_id = u.id 
				WHERE m.session_id = $1 
				ORDER BY m.timestamp DESC LIMIT 100`, chatID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch messages"})
				return
			}
			defer rows.Close()

			var results []gin.H
			for rows.Next() {
				var id, senderID, mediaID uuid.UUID
				var content, msgType, status, username string
				var timestamp time.Time
				rows.Scan(&id, &senderID, &content, &msgType, &status, &timestamp, &username, &mediaID)
				results = append(results, gin.H{
					"id":        id,
					"senderId":  senderID,
					"content":   content,
					"type":      msgType,
					"status":    status,
					"timestamp": timestamp.Unix(),
					"username":  username,
					"mediaId":   mediaID,
				})
			}
			c.JSON(http.StatusOK, results)
		})

		// SOCIAL GROUP
		social := authorized.Group("/social")
		{
			social.GET("/feed", func(c *gin.Context) {
				userID, _ := uuid.Parse(c.GetString("userId"))
				posts, err := socialSvc.GetFeed(userID, 50, 0)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
					return
				}
				c.JSON(http.StatusOK, posts)
			})

			social.POST("/posts", func(c *gin.Context) {
				var req struct {
					Content   string   `json:"content"`
					MediaURLs []string `json:"mediaUrls"`
					Signature string   `json:"signature"`
				}
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
					return
				}
				userID, _ := uuid.Parse(c.GetString("userId"))
				post, err := socialSvc.CreatePost(userID, req.Content, req.MediaURLs, req.Signature)
				if err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
					return
				}
				c.JSON(http.StatusCreated, post)
			})

			social.POST("/contacts/sync", func(c *gin.Context) {
				var req struct {
					PhoneNumbers []string `json:"phoneNumbers" binding:"required"`
				}
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
					return
				}
				userID, _ := uuid.Parse(c.GetString("userId"))
				matched, err := socialSvc.SyncContacts(userID, req.PhoneNumbers)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
					return
				}
				c.JSON(http.StatusOK, matched)
			})

			social.POST("/subscribe", func(c *gin.Context) {
				var req struct {
					TargetID   uuid.UUID `json:"targetId" binding:"required"`
					TargetType string    `json:"targetType" binding:"required"`
				}
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
					return
				}
				userID, _ := uuid.Parse(c.GetString("userId"))
				socialSvc.Subscribe(userID, req.TargetID, req.TargetType)
				c.JSON(http.StatusOK, gin.H{"status": "subscribed"})
			})
		}

		// Security / Crypto
		crypto := authorized.Group("/crypto")
		{
			crypto.POST("/prekeys", func(c *gin.Context) {
				userID, _ := uuid.Parse(c.GetString("userId"))
				var req []models.PreKey
				c.ShouldBindJSON(&req)
				cryptoSvc.UploadPreKeys(c.Request.Context(), userID, req)
				c.JSON(http.StatusOK, gin.H{"message": "Uploaded"})
			})

			crypto.GET("/bundle/:userId", func(c *gin.Context) {
				targetID, err := uuid.Parse(c.Param("userId"))
				if err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid userId"})
					return
				}
				bundle, err := cryptoSvc.GetKeyBundle(c.Request.Context(), targetID)
				if err != nil {
					c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
					return
				}
				c.JSON(http.StatusOK, bundle)
			})
		}

		// Features
		RegisterGroupRoutes(authorized, chatSvc)
		RegisterDeviceRoutes(authorized, deviceSvc)
		RegisterMediaRoutes(authorized, mediaSvc, chatSvc)
	}
}

// Helpers...

func authMiddleware(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenString := ""
		authHeader := c.GetHeader("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			tokenString = strings.TrimPrefix(authHeader, "Bearer ")
		}

		// Fallback for media only
		if tokenString == "" && c.Request.Method == http.MethodGet && strings.HasPrefix(c.Request.URL.Path, "/api/media/") {
			tokenString = c.Query("token")
		}

		if tokenString == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Missing token"})
			return
		}

		claims, err := auth.ValidateToken(tokenString, secret)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			return
		}

		c.Set("userId", claims.UserID.String())
		c.Set("username", claims.Username)
		c.Set("role", claims.Role)
		c.Next()
	}
}

func parseInt(s string) (int, error) {
	var i int
	_, err := fmt.Sscanf(s, "%d", &i)
	return i, err
}

func sendTelegramMessage(token string, chatID int64, text string) {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", token)
	payload := map[string]interface{}{
		"chat_id": chatID,
		"text":    text,
	}
	data, _ := json.Marshal(payload)
	http.Post(url, "application/json", strings.NewReader(string(data)))
}
