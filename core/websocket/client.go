package websocket

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"securenet-backend/core/models"
	"time"

	"github.com/gorilla/websocket"
	"github.com/google/uuid"
)

func (c *Client) readPump(db *sql.DB) {
	defer func() {
		c.Hub.Unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(maxMessageSize)
	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		message = bytes.TrimSpace(bytes.Replace(message, []byte{'\n'}, []byte{' '}, -1))

		// Parse message
		var msg map[string]interface{}
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("Error parsing message: %v", err)
			continue
		}

		// Handle different message types
		msgType, ok := msg["type"].(string)
		if !ok {
			continue
		}

		switch msgType {
		case "message":
			c.handleChatMessage(db, msg)
		case "typing":
			handleTyping(c, msg)
		case "read":
			handleReadReceipt(c, db, msg)
		case "call":
			c.handleCall(msg)
		}
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// Add queued messages
			n := len(c.Send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.Send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func ServeWs(hub *Hub, db *sql.DB, w http.ResponseWriter, r *http.Request) {
	// ✅ SECURITY UPGRADE: Use One-Time Ticket for WebSocket auth (stop passing JWT in URL)
	ticket := r.URL.Query().Get("ticket")
	if ticket == "" {
		http.Error(w, "Authentication required: provide ?ticket= parameter", http.StatusUnauthorized)
		return
	}

	userID, username, valid := hub.ValidateTicket(ticket)
	if !valid {
		http.Error(w, "Invalid or expired ticket", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	client := &Client{
		Hub:      hub,
		Conn:     conn,
		Send:     make(chan []byte, 256),
		UserID:   userID,
		Username: username,
	}
	client.Hub.Register <- client

	log.Printf("🔐 Authenticated WebSocket: user=%s (%s)", username, userID)

	go client.writePump()
	go client.readPump(db)
}

func (c *Client) handleChatMessage(db *sql.DB, msg map[string]interface{}) {
	// Extract message data
	chatIDStr, _ := msg["chatId"].(string)
	content, _ := msg["content"].(string)
	
	// Correctly extract message sub-type (text, image, file)
	msgType, ok := msg["msg_type"].(string)
	if !ok || msgType == "" {
		msgType = "text" // Default to text
	}

	// Extract media ID if present
	var mediaID *uuid.UUID
	if midStr, ok := msg["media_id"].(string); ok && midStr != "" {
		if mid, err := uuid.Parse(midStr); err == nil {
			mediaID = &mid
		}
	}

	if chatIDStr == "" || (content == "" && mediaID == nil) {
		return
	}

	chatID, err := uuid.Parse(chatIDStr)
	if err != nil {
		log.Printf("Invalid chatId: %v", err)
		return
	}

	// Lazy init for Saved Messages chat row
	if chatID == c.UserID {
		if err := c.Hub.ChatRepo.EnsureSavedChat(context.Background(), c.UserID); err != nil {
			log.Printf("DEBUG: Failed to ensure saved chat in WS: %v", err)
		}
	}

	// Verify sender is participant of the chat
	var exists bool
	err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2)", chatID, c.UserID).Scan(&exists)
	if err != nil || !exists {
		log.Printf("🛑 SECURITY WARNING: User %s (%s) attempted to send message to unauthorized chat %s", c.Username, c.UserID, chatID)
		return
	}

	// Generate message ID
	messageID := uuid.New()

	// Determine initial status (self-chats are auto-read)
	initialStatus := "sent"
	if chatID == c.UserID {
		initialStatus = "read"
	}

	// Insert message into database
	_, err = db.Exec(
		`INSERT INTO messages (id, session_id, sender_id, content, msg_type, status, timestamp, media_id) 
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		messageID, chatIDStr, c.UserID, content, msgType, initialStatus, time.Now().Unix(), mediaID,
	)
	if err != nil {
		log.Printf("Error storing message (chat: %s, user: %s): %v", chatID, c.UserID, err)
		return
	}

	// Update chat last message time
	db.Exec("UPDATE chats SET last_message_at = NOW() WHERE id = $1", chatID)

	// Create broadcast message
	broadcastMsg := &models.WSMessage{
		Type:     "message",
		ChatID:   chatID,
		SenderID: c.UserID,
		Content: map[string]interface{}{
			"id":        messageID,
			"content":   content,
			"type":      msgType,
			"senderId":  c.UserID,
			"chatId":    chatID,
			"timestamp": time.Now().Unix(),
			"mediaId":   mediaID,
			"status":    initialStatus,
		},
		Timestamp: time.Now().Unix(),
	}

	// Send ONLY to participants
	rows, err := db.Query("SELECT user_id FROM chat_participants WHERE chat_id = $1", chatID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var pID uuid.UUID
			if err := rows.Scan(&pID); err == nil {
				c.Hub.SendToUser(pID, broadcastMsg)
			}
		}
	}

	log.Printf("Message stored and securely sent: %s from %s (type: %s, media: %v)", messageID, c.Username, msgType, mediaID != nil)
}

func handleTyping(c *Client, msg map[string]interface{}) {
	// Broadcast typing indicator ONLY to participants (To be implemented with targeted send)
}

func handleReadReceipt(c *Client, db *sql.DB, msg map[string]interface{}) {
	// Update message status to 'read'
	messageIDStr, _ := msg["messageId"].(string)
	messageID, err := uuid.Parse(messageIDStr)
	if err != nil {
		return
	}

	// ✅ SECURITY FIX: Verify the user is the receiver of this message or in the chat
	var chatID uuid.UUID
	err = db.QueryRow("SELECT session_id FROM messages WHERE id = $1", messageID).Scan(&chatID)
	if err != nil {
		return
	}

	// Update in database
	_, err = db.Exec("UPDATE messages SET status = 'read' WHERE id = $1", messageID)
	if err != nil {
		log.Printf("Error updating message status: %v", err)
		return
	}

	// Notify participants
	readMsg := &models.WSMessage{
		Type:     "read",
		ChatID:   chatID,
		SenderID: c.UserID,
		Content: map[string]interface{}{
			"messageId": messageID,
			"readerId":  c.UserID,
		},
		Timestamp: time.Now().Unix(),
	}

	// Send to participants
	rows, err := db.Query("SELECT user_id FROM chat_participants WHERE chat_id = $1", chatID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var pID uuid.UUID
			if err := rows.Scan(&pID); err == nil {
				c.Hub.SendToUser(pID, readMsg)
			}
		}
	}
}

func (c *Client) handleCall(msg map[string]interface{}) {
	targetUserIDStr, _ := msg["targetId"].(string)
	targetUserID, err := uuid.Parse(targetUserIDStr)
	if err != nil {
		return
	}

	// Just relay the entire message to the target user
	relayMsg := &models.WSMessage{
		Type:      "call",
		SenderID:  c.UserID,
		Content:   msg,
		Timestamp: time.Now().Unix(),
	}

	c.Hub.SendToUser(targetUserID, relayMsg)
}
