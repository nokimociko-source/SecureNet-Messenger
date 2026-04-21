package websocket

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"securenet-backend/internal/models"
	"securenet-backend/internal/repository"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 65536 // 64KB
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			// Allow non-browser/native clients that do not send Origin.
			return true
		}

		allowed := map[string]bool{
			"http://localhost:5173": true,
		}
		if raw := os.Getenv("WS_ALLOWED_ORIGINS"); raw != "" {
			for _, v := range strings.Split(raw, ",") {
				o := strings.TrimSpace(v)
				if o != "" {
					allowed[o] = true
				}
			}
		}
		return allowed[origin]
	},
}

type Client struct {
	Hub      *Hub
	Conn     *websocket.Conn
	Send     chan []byte
	UserID   uuid.UUID
	Username string
}

type Hub struct {
	Clients    map[*Client]bool
	Register   chan *Client
	Unregister chan *Client
	Broadcast  chan *models.WSMessage
	UserMap    map[uuid.UUID]*Client
	mu         sync.RWMutex
	ChatRepo   repository.ChatRepository
	NotifSvc   interface {
		SendPush(userID uuid.UUID, title, body string, data map[string]interface{})
	}
	tickets    map[string]ticketInfo
}

type ticketInfo struct {
	UserID   uuid.UUID
	Username string
	Expiry   time.Time
}

func NewHub(chatRepo repository.ChatRepository, notifSvc interface {
	SendPush(userID uuid.UUID, title, body string, data map[string]interface{})
}) *Hub {
	return &Hub{
		Clients:    make(map[*Client]bool),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
		Broadcast:  make(chan *models.WSMessage),
		UserMap:    make(map[uuid.UUID]*Client),
		ChatRepo:   chatRepo,
		NotifSvc:   notifSvc,
		tickets:    make(map[string]ticketInfo),
	}
}

func (h *Hub) IssueTicket(userID uuid.UUID, username string) string {
	ticket := uuid.New().String()
	h.mu.Lock()
	defer h.mu.Unlock()
	h.tickets[ticket] = ticketInfo{
		UserID:   userID,
		Username: username,
		Expiry:   time.Now().Add(60 * time.Second),
	}
	return ticket
}

func (h *Hub) ValidateTicket(ticket string) (uuid.UUID, string, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	info, ok := h.tickets[ticket]
	if !ok || time.Now().After(info.Expiry) {
		delete(h.tickets, ticket)
		return uuid.Nil, "", false
	}
	delete(h.tickets, ticket)
	return info.UserID, info.Username, true
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.mu.Lock()
			h.Clients[client] = true
			h.UserMap[client.UserID] = client
			h.mu.Unlock()
			log.Printf("User %s connected", client.Username)

		case client := <-h.Unregister:
			h.mu.Lock()
			if _, ok := h.Clients[client]; ok {
				delete(h.Clients, client)
				delete(h.UserMap, client.UserID)
				close(client.Send)
			}
			h.mu.Unlock()
			log.Printf("User %s disconnected", client.Username)
			// Presence broadcasting should be handled selectively in production
		}
	}
}

func (h *Hub) SendToUser(userID uuid.UUID, msg *models.WSMessage) {
	h.mu.RLock()
	client, ok := h.UserMap[userID]
	h.mu.RUnlock()

	// Always try to send push for messages and calls
	if h.NotifSvc != nil && (msg.Type == "message" || msg.Type == "call") {
		content := "Новое сообщение"
		if m, ok := msg.Content.(map[string]interface{}); ok {
			if c, ok := m["content"].(string); ok && len(c) > 0 {
				content = c
			}
		}
		
		// Send push to all user's devices
		h.NotifSvc.SendPush(userID, "🔒 SecureNet", content, map[string]interface{}{
			"chatId": msg.ChatID,
			"type":   "NEW_MESSAGE", // Align with sw.js expectation
		})
	}

	if !ok {
		return
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return
	}

	select {
	case client.Send <- data:
	default:
	}
}
