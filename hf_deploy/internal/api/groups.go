package api

import (
	"net/http"

	"securenet-backend/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// RegisterGroupRoutes adds group chat endpoints.
func RegisterGroupRoutes(group *gin.RouterGroup, chatSvc *services.ChatService) {
	// Create group chat
	group.POST("/groups", func(c *gin.Context) {
		userID := c.GetString("userId")
		uid, err := uuid.Parse(userID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid userId"})
			return
		}

		var req struct {
			Name           string   `json:"name" binding:"required,min=1,max=100"`
			ParticipantIDs []string `json:"participantIds" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Parse participant UUIDs
		var participantIDs []uuid.UUID
		for _, idStr := range req.ParticipantIDs {
			pid, err := uuid.Parse(idStr)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid participant ID: " + idStr})
				return
			}
			participantIDs = append(participantIDs, pid)
		}

		chat, err := chatSvc.CreateGroupChat(c.Request.Context(), uid, req.Name, participantIDs)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusCreated, chat)
	})

	// Get all chats for current user (includes groups)
	group.GET("/groups", func(c *gin.Context) {
		userID := c.GetString("userId")
		chats, err := chatSvc.GetUserChats(c.Request.Context(), userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, chats)
	})

	// Get specific chat/group
	group.GET("/groups/:chatId", func(c *gin.Context) {
		chatID := c.Param("chatId")
		chat, err := chatSvc.GetChat(c.Request.Context(), chatID)
		if err != nil || chat == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Chat not found"})
			return
		}
		c.JSON(http.StatusOK, chat)
	})

	// Add member to group
	group.POST("/groups/:chatId/members", func(c *gin.Context) {
		chatID := c.Param("chatId")

		var req struct {
			UserID string `json:"userId" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		uid, err := uuid.Parse(req.UserID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid userId"})
			return
		}

		if err := chatSvc.AddMember(c.Request.Context(), chatID, uid); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Member added"})
	})

	// Remove member from group
	group.DELETE("/groups/:chatId/members/:userId", func(c *gin.Context) {
		chatID := c.Param("chatId")
		uid, err := uuid.Parse(c.Param("userId"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid userId"})
			return
		}

		if err := chatSvc.RemoveMember(c.Request.Context(), chatID, uid); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Member removed"})
	})

	// Leave group
	group.POST("/groups/:chatId/leave", func(c *gin.Context) {
		chatID := c.Param("chatId")
		userID := c.GetString("userId")
		uid, _ := uuid.Parse(userID)

		if err := chatSvc.RemoveMember(c.Request.Context(), chatID, uid); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "You left the group"})
	})

	// Update group name
	group.PUT("/groups/:chatId", func(c *gin.Context) {
		chatID := c.Param("chatId")

		var req struct {
			Name string `json:"name" binding:"required,min=1,max=100"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if err := chatSvc.UpdateGroupName(c.Request.Context(), chatID, req.Name); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Group updated"})
	})
}
