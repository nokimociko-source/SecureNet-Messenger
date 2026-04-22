package services

import (
	"database/sql"
	"encoding/json"
	"log"

	"github.com/SherClockHolmes/webpush-go"
	"github.com/google/uuid"
	"securenet-backend/internal/config"
)

type NotificationService struct {
	db  *sql.DB
	cfg *config.Config
}

func NewNotificationService(db *sql.DB) *NotificationService {
	return &NotificationService{
		db:  db,
		cfg: config.Load(),
	}
}

type PushSubscription struct {
	Endpoint string `json:"endpoint"`
	Keys     struct {
		P256dh string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
}

func (s *NotificationService) Subscribe(userID uuid.UUID, sub PushSubscription) error {
	_, err := s.db.Exec(`
		INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (user_id, endpoint) DO UPDATE SET p256dh = $3, auth = $4
	`, userID, sub.Endpoint, sub.Keys.P256dh, sub.Keys.Auth)
	return err
}

func (s *NotificationService) SendPush(userID uuid.UUID, title, body string, data map[string]interface{}) {
	rows, err := s.db.Query(`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`, userID)
	if err != nil {
		log.Printf("Error fetching subscriptions: %v", err)
		return
	}
	defer rows.Close()

	payload, _ := json.Marshal(map[string]interface{}{
		"title": title,
		"body":  body,
		"data":  data,
	})

	for rows.Next() {
		var endpoint, p256dh, auth string
		if err := rows.Scan(&endpoint, &p256dh, &auth); err != nil {
			continue
		}

		// Decode subscription
		s := &webpush.Subscription{
			Endpoint: endpoint,
			Keys: webpush.Keys{
				P256dh: p256dh,
				Auth:   auth,
			},
		}

		// Send Notification
		resp, err := webpush.SendNotification(payload, s, &webpush.Options{
			Subscriber:      "mailto:admin@catlover.app", // Optional
			VAPIDPublicKey:  config.Load().VAPIDPublicKey,
			VAPIDPrivateKey: config.Load().VAPIDPrivateKey,
			TTL:             30,
		})
		if err != nil {
			log.Printf("Error sending push: %v", err)
			continue
		}
		defer resp.Body.Close()
	}
}
