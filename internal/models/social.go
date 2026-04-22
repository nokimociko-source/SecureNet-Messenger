package models

import (
	"time"
	"github.com/google/uuid"
)

// Post представляет публикацию в ленте
type Post struct {
	ID            uuid.UUID `json:"id"`
	AuthorID      uuid.UUID `json:"authorId"`
	AuthorName    string    `json:"authorName"`
	AuthorAvatar  string    `json:"authorAvatar"`
	Content       string    `json:"content"`
	MediaURLs     []string  `json:"mediaUrls"`
	LikeCount     int       `json:"likeCount"`
	CommentCount  int       `json:"commentCount"`
	IsLiked       bool      `json:"isLiked"`
	IsSystem      bool      `json:"isSystem"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
	Signature     string    `json:"signature,omitempty"`
	AuthorPublicKey string  `json:"authorPublicKey,omitempty"`
}

// Comment представляет комментарий к посту
type Comment struct {
	ID           uuid.UUID `json:"id"`
	PostID       uuid.UUID `json:"postId"`
	AuthorID     uuid.UUID `json:"authorId"`
	AuthorName   string    `json:"authorName"`
	AuthorAvatar string    `json:"authorAvatar"`
	Content      string    `json:"content"`
	CreatedAt    time.Time `json:"createdAt"`
}

// Channel представляет публичный канал
type Channel struct {
	ID           uuid.UUID `json:"id"`
	OwnerID      uuid.UUID `json:"ownerId"`
	Name         string    `json:"name"`
	Description  string    `json:"description"`
	SubscriberCount int    `json:"subscriberCount"`
	IsPrivate    bool      `json:"isPrivate"`
	CreatedAt    time.Time `json:"createdAt"`
}

// Subscription представляет связь подписчик-автор или подписчик-канал
type Subscription struct {
	SubscriberID uuid.UUID `json:"subscriberId"`
	TargetID     uuid.UUID `json:"targetId"` // UserID или ChannelID
	TargetType   string    `json:"targetType"` // "user" или "channel"
	CreatedAt    time.Time `json:"createdAt"`
}
