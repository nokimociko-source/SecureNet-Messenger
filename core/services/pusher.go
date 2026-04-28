package services

import (
	"github.com/pusher/pusher-http-go/v5"
	"os"
	"log"
)

type PusherService struct {
	client *pusher.Client
}

func NewPusherService() *PusherService {
	appID := os.Getenv("PUSHER_APP_ID")
	key := os.Getenv("PUSHER_KEY")
	secret := os.Getenv("PUSHER_SECRET")
	cluster := os.Getenv("PUSHER_CLUSTER")

	if appID == "" || key == "" || secret == "" || cluster == "" {
		log.Println("⚠️ Pusher credentials missing. Real-time features will be disabled.")
		return &PusherService{client: nil}
	}

	client := &pusher.Client{
		AppID:   appID,
		Key:     key,
		Secret:  secret,
		Cluster: cluster,
		Secure:  true,
	}

	return &PusherService{client: client}
}

func (s *PusherService) Trigger(channel string, event string, data interface{}) error {
	if s.client == nil {
		return nil
	}
	return s.client.Trigger(channel, event, data)
}

func (s *PusherService) Authenticate(channelName, socketID string) ([]byte, error) {
	if s.client == nil {
		return nil, nil
	}
	body := []byte("socket_id=" + socketID + "&channel_name=" + channelName)
	return s.client.AuthenticatePrivateChannel(body)
}
