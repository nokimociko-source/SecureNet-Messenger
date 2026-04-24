package api

import (
	"net/http"
	"path/filepath"
	"strconv"

	"securenet-backend/core/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// RegisterMediaRoutes adds file upload/download endpoints.
func RegisterMediaRoutes(group *gin.RouterGroup, mediaSvc *services.MediaService, chatSvc *services.ChatService) {
	// Upload file
	group.POST("/media/upload", func(c *gin.Context) {
		userID := c.GetString("userId")
		uid, err := uuid.Parse(userID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid userId"})
			return
		}

		chatIDStr := c.PostForm("chatId")
		// Handle "saved_..." prefix for Saved Messages
		if len(chatIDStr) > 6 && chatIDStr[:6] == "saved_" {
			chatIDStr = chatIDStr[6:]
		}

		chatID, err := uuid.Parse(chatIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid chatId"})
			return
		}

		// ✅ SECURITY FIX: Verify requester is a participant
		isParticipant, err := chatSvc.IsParticipant(c.Request.Context(), chatID.String(), userID)
		if err != nil || !isParticipant {
			c.JSON(http.StatusForbidden, gin.H{"error": "You are not a participant of this chat"})
			return
		}

		file, header, err := c.Request.FormFile("file")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "File is required"})
			return
		}
		defer file.Close()

		media, err := mediaSvc.UploadFile(c.Request.Context(), file, header, uid, chatID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusCreated, media)
	})

	// Download / serve file
	group.GET("/media/:mediaId", func(c *gin.Context) {
		mediaID := c.Param("mediaId")
		userID := c.GetString("userId")

		media, err := mediaSvc.GetMedia(c.Request.Context(), mediaID)
		if err != nil || media == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Media not found"})
			return
		}

		// ✅ SECURITY FIX: Verify requester is a participant of the chat this media belongs to
		isParticipant, err := chatSvc.IsParticipant(c.Request.Context(), media.ChatID.String(), userID)
		if err != nil || !isParticipant {
			c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
			return
		}

		c.Header("Content-Disposition", "attachment; filename="+media.FileName)
		c.Header("Content-Type", media.MimeType)
		c.File(filepath.Clean(media.StoragePath))
	})

	// Get media metadata
	group.GET("/media/:mediaId/info", func(c *gin.Context) {
		mediaID := c.Param("mediaId")
		userID := c.GetString("userId")

		media, err := mediaSvc.GetMedia(c.Request.Context(), mediaID)
		if err != nil || media == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Media not found"})
			return
		}

		// ✅ SECURITY FIX: Verify participation
		isParticipant, err := chatSvc.IsParticipant(c.Request.Context(), media.ChatID.String(), userID)
		if err != nil || !isParticipant {
			c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
			return
		}

		c.JSON(http.StatusOK, media)
	})

	// List media for a chat
	group.GET("/chats/:chatId/media", func(c *gin.Context) {
		chatID := c.Param("chatId")
		userID := c.GetString("userId")
		
		// ✅ SECURITY FIX: Verify participation
		isParticipant, err := chatSvc.IsParticipant(c.Request.Context(), chatID, userID)
		if err != nil || !isParticipant {
			c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
			return
		}

		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
		offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

		mediaList, err := mediaSvc.GetChatMedia(c.Request.Context(), chatID, limit, offset)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, mediaList)
	})

	// Delete media
	group.DELETE("/media/:mediaId", func(c *gin.Context) {
		mediaID := c.Param("mediaId")
		userID := c.GetString("userId")

		media, err := mediaSvc.GetMedia(c.Request.Context(), mediaID)
		if err != nil || media == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Media not found"})
			return
		}

		// ✅ SECURITY FIX: Only uploader or admin can delete
		if media.UploaderID.String() != userID && c.GetString("role") != "admin" {
			c.JSON(http.StatusForbidden, gin.H{"error": "You can only delete your own media"})
			return
		}

		if err := mediaSvc.DeleteMedia(c.Request.Context(), mediaID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Media deleted"})
	})
}
