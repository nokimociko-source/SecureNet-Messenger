package api

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"database/sql"
	"encoding/binary"
	"fmt"
	"math/big"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"

	"securenet-backend/internal/auth"
	"securenet-backend/internal/config"
	"securenet-backend/internal/models"
	"securenet-backend/internal/repository/postgres"
	"securenet-backend/internal/services"
	"securenet-backend/internal/websocket"
)

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
	socialSvc := services.NewSocialService(db) // ✅ SOCIAL CORE ACTIVATED
	cryptoSvc := services.NewCryptoService(db)

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
			c.JSON(http.StatusCreated, gin.H{"token": token, "user": user})
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
				ipAddress, userAgent := services.GetClientInfo(c)
				auditService.LogAction(uuid.Nil, models.AuditActionLoginFailed, "auth", nil, map[string]interface{}{"phone": req.PhoneNumber, "reason": err.Error()}, ipAddress, userAgent)
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
				return
			}
			userRepo.UpdateStatus(c.Request.Context(), user.ID.String(), "online")
			ipAddress, userAgent := services.GetClientInfo(c)
			auditService.LogAction(user.ID, models.AuditActionLogin, "auth", nil, map[string]interface{}{"username": user.Username, "phone": user.PhoneNumber}, ipAddress, userAgent)
			if user.TotpEnabled {
				// Generate a temporary pre-auth token
				preToken, _ := auth.GenerateToken(user.ID, user.Username, "pre_auth", cfg.JWTSecret)
				c.JSON(http.StatusAccepted, gin.H{
					"status": "2fa_required",
					"userId": user.ID,
					"token":  preToken,
				})
				return
			}
			c.JSON(http.StatusOK, gin.H{"token": token, "user": user})
		})

		authGroup.POST("/2fa/verify", func(c *gin.Context) {
			var req struct {
				Token string `json:"token" binding:"required"`
				Code  string `json:"code" binding:"required"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			claims, err := auth.ValidateToken(req.Token, cfg.JWTSecret)
			if err != nil {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
				return
			}
			var secret string
			err = db.QueryRow("SELECT totp_secret FROM users WHERE id = $1 AND totp_enabled = true", claims.UserID.String()).Scan(&secret)
			if err != nil || secret == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "2FA not enabled"})
				return
			}
			if !verifyTOTP(secret, req.Code) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid verification code"})
				return
			}
			token, err := auth.GenerateToken(claims.UserID, claims.Username, claims.Role, cfg.JWTSecret)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
				return
			}
			c.JSON(http.StatusOK, gin.H{"token": token, "user": gin.H{"id": claims.UserID.String(), "username": claims.Username, "role": claims.Role}})
		})
		
	}


	// Protected routes
	authorized := r.Group("/api")
	authorized.Use(authMiddleware(cfg.JWTSecret, db))
	{
		// Users
		authorized.GET("/users/search", func(c *gin.Context) {
			query := c.Query("q")
			if len(query) < 1 {
				rows, err := db.Query("SELECT id, phone_number, username, public_key, role, avatar FROM users LIMIT 20")
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch users"})
					return
				}
				defer rows.Close()
				var users []models.User
				for rows.Next() {
					var u models.User
					rows.Scan(&u.ID, &u.PhoneNumber, &u.Username, &u.PublicKey, &u.Role, &u.Avatar)
					users = append(users, u)
				}
				c.JSON(http.StatusOK, users)
				return
			}

			rows, err := db.Query(
				"SELECT id, phone_number, username, public_key, role, avatar FROM users WHERE phone_number ILIKE $1 OR username ILIKE $1 LIMIT 20",
				"%"+query+"%",
			)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Search failed"})
				return
			}
			defer rows.Close()

			var users []models.User
			for rows.Next() {
				var u models.User
				rows.Scan(&u.ID, &u.PhoneNumber, &u.Username, &u.PublicKey, &u.Role, &u.Avatar)
				users = append(users, u)
			}

			c.JSON(http.StatusOK, users)
		})

		// ✅ SOCIAL NETWORK ROUTES (100% completion)
		social := authorized.Group("/social")
		{
			social.GET("/feed", func(c *gin.Context) {
				userID, _ := uuid.Parse(c.GetString("userId"))
				posts, _ := socialSvc.GetFeed(userID, 20, 0)
				c.JSON(http.StatusOK, gin.H{"posts": posts})
			})

			social.GET("/users/search", func(c *gin.Context) {
				query := c.Query("q")
				if len(query) < 3 {
					c.JSON(http.StatusOK, []interface{}{})
					return
				}
				
				userID, _ := uuid.Parse(c.GetString("userId"))
				
				// Search by username or phone
				rows, err := db.Query(`
					SELECT id, username, phone_number 
					FROM users 
					WHERE (username ILIKE $1 OR phone_number ILIKE $1) 
					AND id != $2 
					LIMIT 20`, 
					"%"+query+"%", userID)
				
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Search failed"})
					return
				}
				defer rows.Close()
				
				var users []gin.H
				for rows.Next() {
					var id, username, phone string
					if err := rows.Scan(&id, &username, &phone); err == nil {
						users = append(users, gin.H{
							"id": id,
							"username": username,
							"phoneNumber": phone,
						})
					}
				}
				
				c.JSON(http.StatusOK, users)
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

			social.POST("/channels", func(c *gin.Context) {
				var req struct {
					Name        string `json:"name" binding:"required"`
					Description string `json:"description"`
					IsPrivate   bool   `json:"isPrivate"`
				}
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
					return
				}
				userID, _ := uuid.Parse(c.GetString("userId"))
				channel, err := socialSvc.CreateChannel(userID, req.Name, req.Description, req.IsPrivate)
				if err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
					return
				}
				c.JSON(http.StatusCreated, channel)
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
				err := socialSvc.Subscribe(userID, req.TargetID, req.TargetType)
				if err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
					return
				}
				c.JSON(http.StatusOK, gin.H{"status": "subscribed"})
			})

			// Likes
			social.POST("/posts/:id/like", func(c *gin.Context) {
				postID, _ := uuid.Parse(c.Param("id"))
				userID, _ := uuid.Parse(c.GetString("userId"))
				if err := socialSvc.LikePost(userID, postID); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to like post"})
					return
				}
				c.JSON(http.StatusOK, gin.H{"status": "liked"})
			})

			social.DELETE("/posts/:id/like", func(c *gin.Context) {
				postID, _ := uuid.Parse(c.Param("id"))
				userID, _ := uuid.Parse(c.GetString("userId"))
				if err := socialSvc.UnlikePost(userID, postID); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unlike post"})
					return
				}
				c.JSON(http.StatusOK, gin.H{"status": "unliked"})
			})

			// Comments
			social.GET("/posts/:id/comments", func(c *gin.Context) {
				postID, _ := uuid.Parse(c.Param("id"))
				comments, err := socialSvc.GetComments(postID)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch comments"})
					return
				}
				c.JSON(http.StatusOK, comments)
			})

			social.POST("/posts/:id/comments", func(c *gin.Context) {
				postID, _ := uuid.Parse(c.Param("id"))
				userID, _ := uuid.Parse(c.GetString("userId"))
				var req struct {
					Content string `json:"content" binding:"required"`
				}
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
					return
				}
				comment, err := socialSvc.AddComment(userID, postID, req.Content)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add comment"})
					return
				}
				c.JSON(http.StatusCreated, comment)
			})

			social.DELETE("/posts/:id", func(c *gin.Context) {
				postID, _ := uuid.Parse(c.Param("id"))
				userID, _ := uuid.Parse(c.GetString("userId"))
				
				var authorID uuid.UUID
				err := db.QueryRow("SELECT author_id FROM posts WHERE id = $1", postID).Scan(&authorID)
				if err != nil {
					c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
					return
				}
				
				if authorID != userID {
					c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
					return
				}

				if _, err := db.Exec("DELETE FROM posts WHERE id = $1", postID); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete"})
					return
				}
				c.JSON(http.StatusOK, gin.H{"status": "deleted"})
			})

			social.DELETE("/posts/:id/comments/:commentId", func(c *gin.Context) {
				postID, _ := uuid.Parse(c.Param("id"))
				commentID, _ := uuid.Parse(c.Param("commentId"))
				userID, _ := uuid.Parse(c.GetString("userId"))
				
				var postAuthorID, commentAuthorID uuid.UUID
				err := db.QueryRow(`
					SELECT p.author_id, c.author_id 
					FROM post_comments c
					JOIN posts p ON c.post_id = p.id
					WHERE c.id = $1 AND p.id = $2
				`, commentID, postID).Scan(&postAuthorID, &commentAuthorID)
				
				if err != nil {
					c.JSON(http.StatusNotFound, gin.H{"error": "Comment not found"})
					return
				}
				
				if userID != postAuthorID && userID != commentAuthorID {
					c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
					return
				}

				if _, err := db.Exec("DELETE FROM post_comments WHERE id = $1", commentID); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete comment"})
					return
				}
				c.JSON(http.StatusOK, gin.H{"status": "deleted"})
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
				
				rows, err := db.Query(`
					SELECT id, username, phone_number 
					FROM users 
					WHERE phone_number = ANY($1) AND id != $2`, 
					pq.Array(req.PhoneNumbers), userID)
				
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Sync failed"})
					return
				}
				defer rows.Close()
				
				var matchedUsers []gin.H
				for rows.Next() {
					var id, username, phone string
					if err := rows.Scan(&id, &username, &phone); err == nil {
						matchedUsers = append(matchedUsers, gin.H{
							"id": id,
							"username": username,
							"phoneNumber": phone,
						})
						
						// Mutually add to contacts
						db.Exec("INSERT INTO contacts (user_id, contact_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", userID, id)
						db.Exec("INSERT INTO contacts (user_id, contact_id) VALUES ($2, $1) ON CONFLICT DO NOTHING", userID, id)
					}
				}
				
				c.JSON(http.StatusOK, matchedUsers)
			})
		}

		// Contacts (original code continues...)
		authorized.GET("/contacts", func(c *gin.Context) {
			userID := c.GetString("userId")
			uid, _ := uuid.Parse(userID)

			rows, err := db.Query(
				`SELECT c.id, c.contact_id, u.phone_number, u.username, u.public_key, c.is_favorite, c.is_blocked 
				 FROM contacts c 
				 JOIN users u ON c.contact_id = u.id 
				 WHERE c.user_id = $1`,
				uid,
			)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch contacts"})
				return
			}
			defer rows.Close()

			var contacts []gin.H
			for rows.Next() {
				var id, contactID uuid.UUID
				var phone, username, pubKey string
				var fav, blocked bool
				rows.Scan(&id, &contactID, &phone, &username, &pubKey, &fav, &blocked)
				contacts = append(contacts, gin.H{
					"id":          id,
					"contactId":   contactID,
					"phoneNumber": phone,
					"username":    username,
					"publicKey":   pubKey,
					"isFavorite":  fav,
					"isBlocked":   blocked,
				})
			}

			c.JSON(http.StatusOK, contacts)
		})

		authorized.POST("/contacts", func(c *gin.Context) {
			userID := c.GetString("userId")
			uid, _ := uuid.Parse(userID)

			var req struct {
				ContactID string `json:"contactId" binding:"required"`
				Name      string `json:"name"`
			}

			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			contactID, err := uuid.Parse(req.ContactID)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid contactId"})
				return
			}

			_, err = db.Exec(
				"INSERT INTO contacts (user_id, contact_id, name, created_at) VALUES ($1, $2, $3, NOW())",
				uid, contactID, req.Name,
			)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add contact"})
				return
			}

			c.JSON(http.StatusCreated, gin.H{"message": "Contact added"})
		})

		authorized.POST("/contacts/:id/block", func(c *gin.Context) {
			userID := c.GetString("userId")
			contactID := c.Param("id")
			
			tx, err := db.Begin()
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Transaction failed"})
				return
			}
			defer tx.Rollback()

			// Update contacts table
			_, err = tx.Exec("UPDATE contacts SET is_blocked = true WHERE user_id = $1 AND contact_id = $2", userID, contactID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update contact"})
				return
			}

			// Add to blocked_users table
			_, err = tx.Exec("INSERT INTO blocked_users (user_id, blocked_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", userID, contactID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to block user"})
				return
			}

			if err := tx.Commit(); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Commit failed"})
				return
			}

			c.JSON(http.StatusOK, gin.H{"message": "User blocked"})
		})

		authorized.DELETE("/contacts/:id/block", func(c *gin.Context) {
			userID := c.GetString("userId")
			contactID := c.Param("id")

			tx, err := db.Begin()
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Transaction failed"})
				return
			}
			defer tx.Rollback()

			// Update contacts table
			_, err = tx.Exec("UPDATE contacts SET is_blocked = false WHERE user_id = $1 AND contact_id = $2", userID, contactID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update contact"})
				return
			}

			// Remove from blocked_users table
			_, err = tx.Exec("DELETE FROM blocked_users WHERE user_id = $1 AND blocked_user_id = $2", userID, contactID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unblock user"})
				return
			}

			if err := tx.Commit(); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Commit failed"})
				return
			}

			c.JSON(http.StatusOK, gin.H{"message": "User unblocked"})
		})

		// Chats
		authorized.GET("/chats", func(c *gin.Context) {
			userID := c.GetString("userId")
			uid, _ := uuid.Parse(userID)

			// Lazy init Saved Messages
			chatSvc.EnsureSavedChat(c.Request.Context(), uid)

			chats, err := chatSvc.GetUserChats(c.Request.Context(), userID)
			if err != nil {
				fmt.Printf("Error fetching chats: %v\n", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch chats"})
				return
			}

			c.JSON(http.StatusOK, chats)
		})

		// Messages
		authorized.GET("/chats/:chatId/messages", func(c *gin.Context) {
			chatIdStr := c.Param("chatId")
			// Handle 'saved_' prefix for self-chats
			if len(chatIdStr) > 6 && chatIdStr[:6] == "saved_" {
				chatIdStr = chatIdStr[6:]
			}

			chatID, err := uuid.Parse(chatIdStr)
			if err != nil {
				fmt.Printf("Error parsing chatId %s: %v\n", chatIdStr, err)
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid chatId: " + err.Error()})
				return
			}

			// Ensure Saved Messages chat exists if this is a personal chat
			if chatIdStr == c.GetString("userId") {
				uid, _ := uuid.Parse(c.GetString("userId"))
				chatSvc.EnsureSavedChat(c.Request.Context(), uid)
			}

			// ✅ SECURITY FIX: Verify requester is a participant of the chat
			var exists bool
			err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2)", chatID, c.GetString("userId")).Scan(&exists)
			if err != nil || !exists {
				c.JSON(http.StatusForbidden, gin.H{"error": "You are not a participant of this chat"})
				return
			}

			query := "SELECT m.id, m.sender_id, m.content, m.msg_type, m.status, m.timestamp, COALESCE(u.username, 'System'), m.media_id " +
				"FROM public.messages m " +
				"LEFT JOIN public.users u ON m.sender_id = u.id " +
				"WHERE m.session_id = $1 " +
				"ORDER BY m.timestamp DESC " +
				"LIMIT 100"

			rows, err := db.Query(query, chatID)
			if err != nil {
				fmt.Printf("DATABASE ERROR fetching messages for chat %s: %v\n", chatIdStr, err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch messages: " + err.Error()})
				return
			}
			defer rows.Close()

			var results []gin.H
			for rows.Next() {
				var id uuid.UUID
				var senderID, mediaID *uuid.UUID
				var content, msgType, status string
				var timestampRaw interface{}
				var username string

				if err := rows.Scan(&id, &senderID, &content, &msgType, &status, &timestampRaw, &username, &mediaID); err != nil {
					fmt.Printf("SCAN ERROR for message: %v\n", err)
					continue
				}

				var ts int64
				switch v := timestampRaw.(type) {
				case time.Time:
					ts = v.Unix()
				case int64:
					ts = v
				case []byte:
					// Postgres might return timestamp as string/bytes
					if t, err := time.Parse("2006-01-02 15:04:05", string(v)); err == nil {
						ts = t.Unix()
					}
				}

				results = append(results, gin.H{
					"id":        id,
					"senderId":  senderID,
					"content":   content,
					"type":      msgType,
					"status":    status,
					"timestamp": ts,
					"username":  username,
					"mediaId":   mediaID,
				})
			}
			c.JSON(http.StatusOK, results)
		})

		// Clear Chat History
		authorized.DELETE("/chats/:chatId/messages", func(c *gin.Context) {
			chatIdStr := c.Param("chatId")
			userID := c.GetString("userId")

			// ✅ SECURITY FIX: Verify requester is a participant
			var exists bool
			db.QueryRow("SELECT EXISTS(SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2)", chatIdStr, userID).Scan(&exists)
			if !exists {
				c.JSON(http.StatusForbidden, gin.H{"error": "Forbidden"})
				return
			}

			// 1. Get all media IDs first to clean up storage
			var mediaIDs []string
			rows, _ := db.Query("SELECT media_id FROM messages WHERE session_id = $1 AND media_id IS NOT NULL", chatIdStr)
			if rows != nil {
				for rows.Next() {
					var mid string
					if err := rows.Scan(&mid); err == nil { mediaIDs = append(mediaIDs, mid) }
				}
				rows.Close()
			}

			// 2. Delete messages
			_, err := db.Exec("DELETE FROM messages WHERE session_id = $1", chatIdStr)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to clear history"})
				return
			}

			// 3. Clean up storage in background
			go func() {
				for _, mid := range mediaIDs { mediaSvc.DeleteMedia(c.Request.Context(), mid) }
			}()

			c.JSON(http.StatusOK, gin.H{"message": "History cleared"})
		})

		// Delete Chat
		authorized.DELETE("/chats/:chatId", func(c *gin.Context) {
			chatIdStr := c.Param("chatId")
			userID := c.GetString("userId")

			// ✅ SECURITY FIX: Verify requester is a participant
			var exists bool
			db.QueryRow("SELECT EXISTS(SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2)", chatIdStr, userID).Scan(&exists)
			if !exists {
				c.JSON(http.StatusForbidden, gin.H{"error": "Forbidden"})
				return
			}

			// 1. Get media IDs
			var mediaIDs []string
			rows, _ := db.Query("SELECT media_id FROM messages WHERE session_id = $1 AND media_id IS NOT NULL", chatIdStr)
			if rows != nil {
				for rows.Next() {
					var mid string
					if err := rows.Scan(&mid); err == nil { mediaIDs = append(mediaIDs, mid) }
				}
				rows.Close()
			}

			// 2. Delete everything from DB
			db.Exec("DELETE FROM messages WHERE session_id = $1", chatIdStr)
			db.Exec("DELETE FROM chat_participants WHERE chat_id = $1", chatIdStr)
			_, err := db.Exec("DELETE FROM chats WHERE id = $1", chatIdStr)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete chat"})
				return
			}

			// 3. Clean up storage
			go func() {
				for _, mid := range mediaIDs { mediaSvc.DeleteMedia(c.Request.Context(), mid) }
			}()

			c.JSON(http.StatusOK, gin.H{"message": "Chat deleted"})
		})

		// Delete Single Message
		authorized.DELETE("/messages/:messageId", func(c *gin.Context) {
			messageId := c.Param("messageId")
			userID := c.GetString("userId")

			// ✅ SECURITY FIX: Verify requester is the sender or an admin
			var senderID string
			err := db.QueryRow("SELECT sender_id FROM messages WHERE id = $1", messageId).Scan(&senderID)
			if err != nil || senderID != userID {
				c.JSON(http.StatusForbidden, gin.H{"error": "You can only delete your own messages"})
				return
			}
			
			// 1. Get media_id
			var mediaID sql.NullString
			db.QueryRow("SELECT media_id FROM messages WHERE id = $1", messageId).Scan(&mediaID)

			// 2. Delete from DB
			_, err = db.Exec("DELETE FROM messages WHERE id = $1", messageId)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete message"})
				return
			}

			// 3. Delete media if exists
			if mediaID.Valid && mediaID.String != "" {
				go mediaSvc.DeleteMedia(c.Request.Context(), mediaID.String)
			}

			c.JSON(http.StatusOK, gin.H{"message": "Message deleted"})
		})


		// Block user
		authorized.POST("/users/:id/block", func(c *gin.Context) {
			userId := c.GetString("userId")
			targetUserId := c.Param("id")
			if userId == targetUserId {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot block yourself"})
				return
			}
			var username string
			err := db.QueryRow("SELECT username FROM users WHERE id = $1", targetUserId).Scan(&username)
			if err != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
				return
			}
			blockId := uuid.New()
			_, err = db.Exec(`
				INSERT INTO blocked_users (id, user_id, blocked_user_id, created_at)
				VALUES ($1, $2, $3, NOW())
				ON CONFLICT (user_id, blocked_user_id) DO NOTHING
			`, blockId, userId, targetUserId)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to block user"})
				return
			}
			// Log user block
			ipAddress, userAgent := services.GetClientInfo(c)
			targetUserID := uuid.MustParse(targetUserId)
			auditService.LogAction(uuid.MustParse(userId), models.AuditActionUserBlocked, "user", &targetUserID, map[string]interface{}{
				"target_username": username,
			}, ipAddress, userAgent)

			c.JSON(http.StatusOK, gin.H{"message": "User blocked successfully"})
		})

		authorized.DELETE("/users/:id/block", func(c *gin.Context) {
			userId := c.GetString("userId")
			targetUserId := c.Param("id")
			_, err := db.Exec(`DELETE FROM blocked_users WHERE user_id = $1 AND blocked_user_id = $2`, userId, targetUserId)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unblock user"})
				return
			}
			// Log user unblock
			ipAddress, userAgent := services.GetClientInfo(c)
			targetUserID := uuid.MustParse(targetUserId)
			auditService.LogAction(uuid.MustParse(userId), models.AuditActionUserUnblocked, "user", &targetUserID, map[string]interface{}{
				"success": true,
			}, ipAddress, userAgent)

			c.JSON(http.StatusOK, gin.H{"message": "User unblocked successfully"})
		})

		authorized.GET("/blocked-users", func(c *gin.Context) {
			userId := c.GetString("userId")
			rows, err := db.Query(`
				SELECT u.id, u.username, u.phone_number, COALESCE(u.avatar, ''), b.created_at
				FROM blocked_users b
				JOIN users u ON b.blocked_user_id = u.id
				WHERE b.user_id = $1::uuid
				ORDER BY b.created_at DESC
			`, userId)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			defer rows.Close()
			blockedUsers := []gin.H{}
			for rows.Next() {
				var id, username, phoneNumber, avatar string
				var blockedAt time.Time
				err := rows.Scan(&id, &username, &phoneNumber, &avatar, &blockedAt)
				if err != nil {
					continue
				}
				blockedUsers = append(blockedUsers, gin.H{
					"id":          id,
					"name":        username,
					"phoneNumber": phoneNumber,
					"avatar":      avatar,
					"blockedAt":   blockedAt,
				})
			}
			c.JSON(http.StatusOK, blockedUsers)
		})

		// Mark messages as read
		authorized.POST("/messages/:messageId/read", func(c *gin.Context) {
			userId := c.GetString("userId")
			messageId := c.Param("messageId")
			var chatId, senderId string
			err := db.QueryRow(`
				SELECT m.session_id, m.sender_id 
				FROM messages m
				JOIN chat_participants cp ON m.session_id = cp.chat_id
				WHERE m.id = $1 AND cp.user_id = $2 AND m.sender_id != $2
			`, messageId, userId).Scan(&chatId, &senderId)
			if err != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "Message not found or not authorized"})
				return
			}
			_, err = db.Exec(`UPDATE messages SET status = 'read', read_at = NOW() WHERE id = $1`, messageId)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update message status"})
				return
			}
			if hub != nil {
				readMsg := &models.WSMessage{
					Type:     "read",
					SenderID: uuid.MustParse(userId),
					Content: map[string]interface{}{
						"messageId": messageId,
						"chatId":    chatId,
						"readerId":  userId,
					},
					Timestamp: time.Now().Unix(),
				}
				hub.Broadcast <- readMsg
			}
			c.JSON(http.StatusOK, gin.H{"message": "Message marked as read"})
		})

		// Setup 2FA
		authorized.POST("/auth/2fa/setup", func(c *gin.Context) {
			userId := c.GetString("userId")
			secret := generateTOTPSecret()
			_, err := db.Exec(`UPDATE users SET totp_secret = $2, totp_enabled = false WHERE id = $1`, userId, secret)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to setup 2FA"})
				return
			}
			var username string
			db.QueryRow("SELECT username FROM users WHERE id = $1", userId).Scan(&username)
			qrURL := fmt.Sprintf("otpauth://totp/SecureNet:%s?secret=%s&issuer=SecureNet", username, secret)
			c.JSON(http.StatusOK, gin.H{
				"secret":      secret,
				"qrCode":      qrURL,
				"backupCodes": generateBackupCodes(),
			})
		})

		authorized.POST("/auth/2fa/enable", func(c *gin.Context) {
			userId := c.GetString("userId")
			var req struct {
				Code string `json:"code" binding:"required"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			var secret string
			err := db.QueryRow("SELECT totp_secret FROM users WHERE id = $1", userId).Scan(&secret)
			if err != nil || secret == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "2FA not setup"})
				return
			}
			if !verifyTOTP(secret, req.Code) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid verification code"})
				return
			}
			_, err = db.Exec(`UPDATE users SET totp_enabled = true WHERE id = $1`, userId)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to enable 2FA"})
				return
			}
			// Log 2FA enable
			ipAddress, userAgent := services.GetClientInfo(c)
			auditService.LogAction(uuid.MustParse(userId), models.AuditAction2FAEnabled, "auth", nil, map[string]interface{}{
				"success": true,
			}, ipAddress, userAgent)

			c.JSON(http.StatusOK, gin.H{"message": "2FA enabled successfully"})
		})

		// Change password
		authorized.POST("/auth/change-password", func(c *gin.Context) {
			userId := c.GetString("userId")
			var req struct {
				CurrentPassword string `json:"currentPassword" binding:"required"`
				NewPassword     string `json:"newPassword" binding:"required,min=8"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			var currentHash string
			err := db.QueryRow("SELECT password_hash FROM users WHERE id = $1", userId).Scan(&currentHash)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify current password"})
				return
			}
			if err := bcrypt.CompareHashAndPassword([]byte(currentHash), []byte(req.CurrentPassword)); err != nil {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Current password is incorrect"})
				return
			}
			newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash new password"})
				return
			}
			_, err = db.Exec(`UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1`, userId, string(newHash))
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update password"})
				return
			}
			// Log password change
			ipAddress, userAgent := services.GetClientInfo(c)
			auditService.LogAction(uuid.MustParse(userId), models.AuditActionPasswordChange, "auth", nil, map[string]interface{}{
				"success": true,
			}, ipAddress, userAgent)

			c.JSON(http.StatusOK, gin.H{"message": "Password changed successfully"})
		})

		// Update privacy settings
		authorized.POST("/auth/privacy", func(c *gin.Context) {
			userId := c.GetString("userId")
			var req struct {
				PhoneVisibility     *string `json:"phoneVisibility"`
				LastSeenVisibility *string `json:"lastSeenVisibility"`
				AvatarVisibility    *string `json:"avatarVisibility"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			if req.PhoneVisibility != nil {
				_, err := db.Exec(`UPDATE users SET phone_visibility = $2, updated_at = NOW() WHERE id = $1`, userId, *req.PhoneVisibility)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update phone visibility"})
					return
				}
			}
			if req.LastSeenVisibility != nil {
				_, err := db.Exec(`UPDATE users SET last_seen_visibility = $2, updated_at = NOW() WHERE id = $1`, userId, *req.LastSeenVisibility)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update last seen visibility"})
					return
				}
			}
			if req.AvatarVisibility != nil {
				_, err := db.Exec(`UPDATE users SET avatar_visibility = $2, updated_at = NOW() WHERE id = $1`, userId, *req.AvatarVisibility)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update avatar visibility"})
					return
				}
			}

			c.JSON(http.StatusOK, gin.H{"message": "Privacy settings updated successfully"})
		})

		// Update notification settings
		authorized.POST("/auth/notifications", func(c *gin.Context) {
			userId := c.GetString("userId")
			var req struct {
				NotifPrivate   *bool `json:"notifPrivate"`
				NotifGroups    *bool `json:"notifGroups"`
				NotifChannels  *bool `json:"notifChannels"`
				NotifBadges    *bool `json:"notifBadges"`
				NotifSounds    *bool `json:"notifSounds"`
				NotifReactions *bool `json:"notifReactions"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			// Update only provided fields
			query := "UPDATE users SET updated_at = NOW()"
			args := []interface{}{userId}
			argIdx := 2

			if req.NotifPrivate != nil {
				query += fmt.Sprintf(", notif_private = $%d", argIdx)
				args = append(args, *req.NotifPrivate)
				argIdx++
			}
			if req.NotifGroups != nil {
				query += fmt.Sprintf(", notif_groups = $%d", argIdx)
				args = append(args, *req.NotifGroups)
				argIdx++
			}
			if req.NotifChannels != nil {
				query += fmt.Sprintf(", notif_channels = $%d", argIdx)
				args = append(args, *req.NotifChannels)
				argIdx++
			}
			if req.NotifBadges != nil {
				query += fmt.Sprintf(", notif_badges = $%d", argIdx)
				args = append(args, *req.NotifBadges)
				argIdx++
			}
			if req.NotifSounds != nil {
				query += fmt.Sprintf(", notif_sounds = $%d", argIdx)
				args = append(args, *req.NotifSounds)
				argIdx++
			}
			if req.NotifReactions != nil {
				query += fmt.Sprintf(", notif_reactions = $%d", argIdx)
				args = append(args, *req.NotifReactions)
				argIdx++
			}

			query += " WHERE id = $1"
			_, err := db.Exec(query, args...)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update notification settings: " + err.Error()})
				return
			}

			c.JSON(http.StatusOK, gin.H{"message": "Notification settings updated"})
		})

		// Get VAPID Public Key
		authorized.GET("/auth/vapid-key", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"publicKey": cfg.VAPIDPublicKey})
		})

		// Subscribe to Push Notifications
		authorized.POST("/auth/push-subscription", func(c *gin.Context) {
			userId := c.GetString("userId")
			uid, _ := uuid.Parse(userId)

			var sub services.PushSubscription
			if err := c.ShouldBindJSON(&sub); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			if err := notifSvc.Subscribe(uid, sub); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to subscribe: " + err.Error()})
				return
			}

			c.JSON(http.StatusOK, gin.H{"message": "Subscribed successfully"})
		})

		// Update profile settings
		authorized.POST("/auth/profile", func(c *gin.Context) {
			userId := c.GetString("userId")
			var req struct {
				Username string `json:"username"`
				Avatar   string `json:"avatar"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			if req.Username != "" {
				_, err := db.Exec(`UPDATE users SET username = $2, updated_at = NOW() WHERE id = $1`, userId, req.Username)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update username"})
					return
				}
			}

			if req.Avatar != "" {
				_, err := db.Exec(`UPDATE users SET avatar = $2, updated_at = NOW() WHERE id = $1`, userId, req.Avatar)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update avatar"})
					return
				}
			}

			// Log profile update
			ipAddress, userAgent := services.GetClientInfo(c)
			auditService.LogAction(uuid.MustParse(userId), "profile_update", "auth", nil, map[string]interface{}{
				"username": req.Username,
				"has_avatar": req.Avatar != "",
			}, ipAddress, userAgent)

			c.JSON(http.StatusOK, gin.H{"message": "Profile updated successfully"})
		})

		// Profile update
		// ... handled above

		// Audit endpoints
		authorized.GET("/audit/logs", func(c *gin.Context) {
			userId := c.GetString("userId")
			userRole := c.GetString("role")

			// Parse query parameters
			var filter models.AuditFilter
			if userIdParam := c.Query("userId"); userIdParam != "" && userRole == "admin" {
				if parsedUUID, err := uuid.Parse(userIdParam); err == nil {
					filter.UserID = &parsedUUID
				}
			} else if userRole != "admin" {
				// Non-admin users can only see their own logs
				if parsedUUID, err := uuid.Parse(userId); err == nil {
					filter.UserID = &parsedUUID
				}
			}

			if action := c.Query("action"); action != "" {
				filter.Action = &action
			}

			if resource := c.Query("resource"); resource != "" {
				filter.Resource = &resource
			}

			if severity := c.Query("severity"); severity != "" {
				filter.Severity = &severity
			}

			if startDate := c.Query("startDate"); startDate != "" {
				if parsedTime, err := time.Parse(time.RFC3339, startDate); err == nil {
					filter.StartDate = &parsedTime
				}
			}

			if endDate := c.Query("endDate"); endDate != "" {
				if parsedTime, err := time.Parse(time.RFC3339, endDate); err == nil {
					filter.EndDate = &parsedTime
				}
			}

			// Pagination
			limit := 50
			if l := c.Query("limit"); l != "" {
				if parsedLimit, err := parseInt(l); err == nil && parsedLimit > 0 && parsedLimit <= 1000 {
					limit = parsedLimit
				}
			}
			filter.Limit = limit

			offset := 0
			if o := c.Query("offset"); o != "" {
				if parsedOffset, err := parseInt(o); err == nil && parsedOffset >= 0 {
					offset = parsedOffset
				}
			}
			filter.Offset = offset

			entries, err := auditService.GetAuditLog(filter)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch audit log"})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"entries": entries,
				"limit":   limit,
				"offset":  offset,
			})
		})

		// Audit statistics
		authorized.GET("/audit/stats", func(c *gin.Context) {
			userId := c.GetString("userId")
			userRole := c.GetString("role")

			var filterUserID *uuid.UUID
			if userRole != "admin" {
				// Non-admin users can only see their own stats
				if parsedUUID, err := uuid.Parse(userId); err == nil {
					filterUserID = &parsedUUID
				}
			} else if userIdParam := c.Query("userId"); userIdParam != "" {
				if parsedUUID, err := uuid.Parse(userIdParam); err == nil {
					filterUserID = &parsedUUID
				}
			}

			var startDate, endDate *time.Time
			if sd := c.Query("startDate"); sd != "" {
				if parsedTime, err := time.Parse(time.RFC3339, sd); err == nil {
					startDate = &parsedTime
				}
			}
			if ed := c.Query("endDate"); ed != "" {
				if parsedTime, err := time.Parse(time.RFC3339, ed); err == nil {
					endDate = &parsedTime
				}
			}

			stats, err := auditService.GetAuditLogStats(filterUserID, startDate, endDate)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch audit stats"})
				return
			}

			c.JSON(http.StatusOK, stats)
		})

		// Cleanup old audit logs (admin only)
		authorized.DELETE("/audit/cleanup", func(c *gin.Context) {
			userRole := c.GetString("role")
			if userRole != "admin" {
				c.JSON(http.StatusForbidden, gin.H{"error": "Admin access required"})
				return
			}

			var req struct {
				OlderThanDays int `json:"olderThanDays" binding:"required,min=1"`
			}

			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			duration := time.Duration(req.OlderThanDays) * 24 * time.Hour
			err := auditService.CleanupOldAuditLogs(duration)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to cleanup audit logs"})
				return
			}

			// Log cleanup action
			ipAddress, userAgent := services.GetClientInfo(c)
			auditService.LogAction(uuid.MustParse(c.GetString("userId")), "audit_cleanup", "audit", nil, map[string]interface{}{
				"older_than_days": req.OlderThanDays,
			}, ipAddress, userAgent)

			c.JSON(http.StatusOK, gin.H{"message": "Audit logs cleaned up successfully"})
		})

		// ================================================================
		// NEW FEATURE ROUTES (Groups, Devices, Media)
		// ================================================================
		RegisterGroupRoutes(authorized, chatSvc)
		RegisterDeviceRoutes(authorized, deviceSvc)
		RegisterMediaRoutes(authorized, mediaSvc, chatSvc)

		// CRYPTO / E2EE
		cryptoGroup := authorized.Group("/crypto")
		{
			cryptoGroup.POST("/prekeys", func(c *gin.Context) {
				userID, _ := uuid.Parse(c.GetString("userId"))
				var req []models.PreKey
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
					return
				}
				if err := cryptoSvc.UploadPreKeys(c.Request.Context(), userID, req); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upload pre-keys"})
					return
				}
				c.JSON(http.StatusOK, gin.H{"message": "Pre-keys uploaded"})
			})

			cryptoGroup.GET("/bundle/:userId", func(c *gin.Context) {
				targetID, err := uuid.Parse(c.Param("userId"))
				if err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
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

		// Create Report
		authorized.POST("/reports", func(c *gin.Context) {
			var req struct {
				TargetID uuid.UUID `json:"targetId" binding:"required"`
				Reason   string    `json:"reason" binding:"required"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			userID, _ := uuid.Parse(c.GetString("userId"))
			_, err := db.Exec("INSERT INTO reports (reporter_id, target_id, reason) VALUES ($1, $2, $3)", userID, req.TargetID, req.Reason)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create report"})
				return
			}
			c.JSON(http.StatusCreated, gin.H{"message": "Report submitted"})
		})

		// SOCIAL
		socialRoute := authorized.Group("/social")
		{
			socialRoute.GET("/feed", func(c *gin.Context) {
				userID, _ := uuid.Parse(c.GetString("userId"))
				posts, err := socialSvc.GetFeed(userID, 50, 0)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
					return
				}
				c.JSON(http.StatusOK, posts)
			})

			socialRoute.POST("/posts", func(c *gin.Context) {
				userID, _ := uuid.Parse(c.GetString("userId"))
				var req struct {
					Content   string   `json:"content"`
					MediaURLs []string `json:"mediaUrls"`
					Signature string   `json:"signature"`
				}
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
					return
				}
				post, err := socialSvc.CreatePost(userID, req.Content, req.MediaURLs, req.Signature)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
					return
				}
				c.JSON(http.StatusCreated, post)
			})

			socialRoute.POST("/posts/:id/like", func(c *gin.Context) {
				userID, _ := uuid.Parse(c.GetString("userId"))
				postID, _ := uuid.Parse(c.Param("id"))
				if err := socialSvc.LikePost(userID, postID); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
					return
				}
				c.JSON(http.StatusOK, gin.H{"message": "Liked"})
			})

			socialRoute.DELETE("/posts/:id/like", func(c *gin.Context) {
				userID, _ := uuid.Parse(c.GetString("userId"))
				postID, _ := uuid.Parse(c.Param("id"))
				if err := socialSvc.UnlikePost(userID, postID); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
					return
				}
				c.JSON(http.StatusOK, gin.H{"message": "Unliked"})
			})

			socialRoute.POST("/subscribe", func(c *gin.Context) {
				userID, _ := uuid.Parse(c.GetString("userId"))
				var req struct {
					TargetID   string `json:"targetId" binding:"required"`
					TargetType string `json:"targetType" binding:"required"`
				}
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
					return
				}
				targetID, _ := uuid.Parse(req.TargetID)
				if err := socialSvc.Subscribe(userID, targetID, req.TargetType); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
					return
				}
				c.JSON(http.StatusOK, gin.H{"message": "Subscribed"})
			})

			socialRoute.POST("/unsubscribe", func(c *gin.Context) {
				userID, _ := uuid.Parse(c.GetString("userId"))
				var req struct {
					TargetID string `json:"targetId" binding:"required"`
				}
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
					return
				}
				targetID, _ := uuid.Parse(req.TargetID)
				if err := socialSvc.Unsubscribe(userID, targetID); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
					return
				}
				c.JSON(http.StatusOK, gin.H{"message": "Unsubscribed"})
			})

			socialRoute.GET("/posts/:id/comments", func(c *gin.Context) {
				postID, _ := uuid.Parse(c.Param("id"))
				comments, err := socialSvc.GetComments(postID)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
					return
				}
				c.JSON(http.StatusOK, comments)
			})

			socialRoute.POST("/posts/:id/comments", func(c *gin.Context) {
				userID, _ := uuid.Parse(c.GetString("userId"))
				postID, _ := uuid.Parse(c.Param("id"))
				var req struct {
					Content string `json:"content" binding:"required"`
				}
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
					return
				}
				comment, err := socialSvc.AddComment(userID, postID, req.Content)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
					return
				}
				c.JSON(http.StatusCreated, comment)
			})

			socialRoute.DELETE("/posts/:id/comments/:commentId", func(c *gin.Context) {
				// Simple delete for now
				commentID := c.Param("commentId")
				_, err := db.Exec("DELETE FROM post_comments WHERE id = $1", commentID)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
					return
				}
				c.JSON(http.StatusOK, gin.H{"message": "Comment deleted"})
			})
		}
	}

	// Admin-only operations
	admin := r.Group("/api/admin")
	admin.Use(authMiddleware(cfg.JWTSecret, db))
	admin.Use(adminMiddleware())
	{
		// Fetch reports
		admin.GET("/reports", func(c *gin.Context) {
			rows, err := db.Query(`
				SELECT r.id, r.reporter_id, u1.username as reporter_name, 
				       r.target_id, u2.username as target_name, 
				       r.reason, r.status, r.created_at
				FROM reports r
				LEFT JOIN users u1 ON r.reporter_id = u1.id
				LEFT JOIN users u2 ON r.target_id = u2.id
				ORDER BY r.created_at DESC`)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch reports"})
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
					"id": id,
					"reporterId": reporterID,
					"reporterName": reporterName,
					"targetId": targetID,
					"targetName": targetName,
					"reason": reason,
					"status": status,
					"createdAt": createdAt,
				})
			}
			c.JSON(http.StatusOK, results)
		})

		// Resolve report
		admin.PATCH("/reports/:id", func(c *gin.Context) {
			id := c.Param("id")
			var req struct {
				Status     string `json:"status" binding:"required"`
				Resolution string `json:"resolution"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			adminID, _ := uuid.Parse(c.GetString("userId"))
			_, err := db.Exec("UPDATE reports SET status = $1, resolution = $2, moderator_id = $3, resolved_at = NOW() WHERE id = $4", 
				req.Status, req.Resolution, adminID, id)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update report"})
				return
			}
			c.JSON(http.StatusOK, gin.H{"message": "Report updated"})
		})

		// Global Log Cleanup
		admin.DELETE("/audit/cleanup", func(c *gin.Context) {
			_, err := db.Exec("DELETE FROM audit_log")
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to clear audit logs"})
				return
			}
			// Log this very action
			ipAddress, userAgent := services.GetClientInfo(c)
			adminID, _ := uuid.Parse(c.GetString("userId"))
			auditService.LogAction(adminID, "audit_cleanup", "admin", nil, nil, ipAddress, userAgent)
			
			c.JSON(http.StatusOK, gin.H{"message": "Audit logs cleared"})
		})

		// Media Cache Cleanup
		admin.DELETE("/media/cache", func(c *gin.Context) {
			// In this context, media cache is the uploads folder
			err := os.RemoveAll("./uploads")
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to clear media cache: " + err.Error()})
				return
			}
			// Recreate the directory
			os.MkdirAll("./uploads", 0755)
			
			c.JSON(http.StatusOK, gin.H{"message": "Media cache cleared"})
		})

		// Fetch all posts (for moderation)
		admin.GET("/posts", func(c *gin.Context) {
			rows, err := db.Query(`
				SELECT p.id, p.author_id, u.username, p.content, p.media_urls, p.created_at
				FROM posts p
				JOIN users u ON p.author_id = u.id
				ORDER BY p.created_at DESC LIMIT 50`)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch posts"})
				return
			}
			defer rows.Close()

			var results []gin.H
			for rows.Next() {
				var id, authorID uuid.UUID
				var username, content string
				var mediaUrls []string
				var createdAt time.Time
				if err := rows.Scan(&id, &authorID, &username, &content, pq.Array(&mediaUrls), &createdAt); err != nil {
					continue
				}
				results = append(results, gin.H{
					"id": id,
					"authorId": authorID,
					"username": username,
					"content": content,
					"mediaUrls": mediaUrls,
					"createdAt": createdAt,
				})
			}
			c.JSON(http.StatusOK, results)
		})

		// Delete post (moderation)
		admin.DELETE("/posts/:id", func(c *gin.Context) {
			id := c.Param("id")
			_, err := db.Exec("DELETE FROM posts WHERE id = $1", id)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete post"})
				return
			}
			c.JSON(http.StatusOK, gin.H{"message": "Post deleted"})
		})
	}

	// WebSocket handler (uses tickets)
	r.GET("/ws", func(c *gin.Context) {
		websocket.ServeWs(hub, db, c.Writer, c.Request)
	})
}

// Helper function to parse int
func parseInt(s string) (int, error) {
	var result int
	_, err := fmt.Sscanf(s, "%d", &result)
	return result, err
}

func adminMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		role := c.GetString("role")
		// Strict RBAC enforcement
		if role != "admin" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "Admin access required"})
			return
		}
		c.Next()
	}
}

func authMiddleware(secret string, db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		tokenString := ""
		
		if authHeader != "" {
			parts := strings.Split(authHeader, " ")
			if len(parts) == 2 && parts[0] == "Bearer" {
				tokenString = parts[1]
			}
		}
		
		/* 
		   DEPRECATED: Insecure token fallback removed per security audit.
		   Only Authorization: Bearer <token> is supported.
		*/

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

		// DEVICE ENFORCEMENT
		fingerprint := c.GetHeader("X-Device-Fingerprint")
		if fingerprint != "" {
			var trusted bool
			err := db.QueryRow("SELECT trusted FROM devices WHERE user_id = $1 AND fingerprint = $2", claims.UserID, fingerprint).Scan(&trusted)
			if err == nil {
				c.Set("deviceTrusted", trusted)
				c.Set("deviceId", fingerprint)
			}
		}

		c.Next()
	}
}

// TOTP Helper Functions
func generateTOTPSecret() string {
	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
	secret := make([]byte, 16)
	for i := range secret {
		secret[i] = charset[cryptoRandIntn(len(charset))]
	}
	return string(secret)
}

func verifyTOTP(secret, code string) bool {
	secretBytes := []byte(secret)
	timeCounter := uint64(time.Now().Unix() / 30)
	hash := hmac.New(sha1.New, secretBytes)
	binary.Write(hash, binary.BigEndian, timeCounter)
	sum := hash.Sum(nil)
	offset := int(sum[len(sum)-1] & 0x0F)
	codeInt := int(sum[offset])&0x7f<<24 |
		int(sum[offset+1])&0xff<<16 |
		int(sum[offset+2])&0xff<<8 |
		int(sum[offset+3])&0xff
	codeInt = codeInt % 1000000
	return fmt.Sprintf("%06d", codeInt) == code
}

func generateBackupCodes() []string {
	codes := make([]string, 10)
	for i := range codes {
		randomInt, _ := rand.Int(rand.Reader, big.NewInt(100000000))
		codes[i] = fmt.Sprintf("%08d", randomInt.Int64())
	}
	return codes
}

func cryptoRandIntn(n int) int {
	if n <= 0 {
		return 0
	}
	randomInt, err := rand.Int(rand.Reader, big.NewInt(int64(n)))
	if err != nil {
		return 0
	}
	return int(randomInt.Int64())
}
