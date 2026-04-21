package services

import (
	"database/sql"
	"errors"
	"securenet-backend/internal/models"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

type SocialService struct {
	db *sql.DB
}

func NewSocialService(db *sql.DB) *SocialService {
	return &SocialService{db: db}
}

// CreatePost создает новый пост в ленте с проверкой подписи
func (s *SocialService) CreatePost(authorID uuid.UUID, content string, mediaURLs []string, signature string) (*models.Post, error) {
	if content == "" && len(mediaURLs) == 0 {
		return nil, errors.New("post cannot be empty")
	}

	post := &models.Post{
		ID:        uuid.New(),
		AuthorID:  authorID,
		Content:   content,
		MediaURLs: mediaURLs,
		Signature: signature,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	err := s.db.QueryRow(
		`INSERT INTO posts (id, author_id, content, media_urls, signature, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id`,
		post.ID, post.AuthorID, post.Content, pq.Array(post.MediaURLs), post.Signature, post.CreatedAt, post.UpdatedAt,
	).Scan(&post.ID)

	if err != nil {
		return nil, err
	}

	// Fetch author name
	s.db.QueryRow("SELECT username FROM users WHERE id = $1", authorID).Scan(&post.AuthorName)

	return post, nil
}

// CreateChannel создает новый канал
func (s *SocialService) CreateChannel(ownerID uuid.UUID, name, description string, isPrivate bool) (*models.Channel, error) {
	if name == "" {
		return nil, errors.New("channel name is required")
	}

	channel := &models.Channel{
		ID:          uuid.New(),
		OwnerID:     ownerID,
		Name:        name,
		Description: description,
		IsPrivate:   isPrivate,
		CreatedAt:   time.Now(),
	}

	_, err := s.db.Exec(
		`INSERT INTO chats (id, type, name, avatar_url, created_by, created_at, updated_at)
		 VALUES ($1, 'channel', $2, NULL, $3, $4, $4)`,
		channel.ID, channel.Name, channel.OwnerID, channel.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return channel, nil
}

// Subscribe подписывает пользователя на другого пользователя или канал
func (s *SocialService) Subscribe(subscriberID, targetID uuid.UUID, targetType string) error {
	if targetType != "user" && targetType != "channel" {
		return errors.New("invalid target type")
	}

	if subscriberID == targetID && targetType == "user" {
		return errors.New("cannot subscribe to yourself")
	}
	
	_, err := s.db.Exec(
		`INSERT INTO subscribers (subscriber_id, target_id, target_type, created_at)
		 VALUES ($1, $2, $3, NOW())
		 ON CONFLICT (subscriber_id, target_id) DO NOTHING`,
		subscriberID, targetID, targetType,
	)
	return err
}

// Unsubscribe отписывает пользователя
func (s *SocialService) Unsubscribe(subscriberID, targetID uuid.UUID) error {
	_, err := s.db.Exec(
		"DELETE FROM subscribers WHERE subscriber_id = $1 AND target_id = $2",
		subscriberID, targetID,
	)
	return err
}

// GetFeed возвращает ленту постов для пользователя
func (s *SocialService) GetFeed(userID uuid.UUID, limit, offset int) ([]models.Post, error) {
	query := `
		SELECT p.id, p.author_id, u.username, u.avatar, u.public_key, p.content, p.media_urls, p.is_system, p.created_at, p.updated_at, p.signature,
		       (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) as like_count,
		       (SELECT COUNT(*) FROM post_comments WHERE post_id = p.id) as comment_count,
		       EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = $3) as is_liked
		FROM posts p
		JOIN users u ON p.author_id = u.id
		ORDER BY p.is_system DESC, p.created_at DESC
		LIMIT $1 OFFSET $2
	`
	rows, err := s.db.Query(query, limit, offset, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	posts := []models.Post{}
	for rows.Next() {
		var p models.Post
		var mediaURLs pq.StringArray
		var avatar sql.NullString
		err := rows.Scan(
			&p.ID, &p.AuthorID, &p.AuthorName, &avatar, &p.AuthorPublicKey, &p.Content, &mediaURLs, &p.IsSystem, &p.CreatedAt, &p.UpdatedAt, &p.Signature,
			&p.LikeCount, &p.CommentCount, &p.IsLiked,
		)
		if err != nil {
			continue
		}
		p.MediaURLs = []string(mediaURLs)
		if avatar.Valid {
			p.AuthorAvatar = avatar.String
		}
		posts = append(posts, p)
	}

	return posts, nil
}

// LikePost ставит лайк посту
func (s *SocialService) LikePost(userID, postID uuid.UUID) error {
	_, err := s.db.Exec(
		"INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
		postID, userID,
	)
	return err
}

// UnlikePost убирает лайк с поста
func (s *SocialService) UnlikePost(userID, postID uuid.UUID) error {
	_, err := s.db.Exec(
		"DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2",
		postID, userID,
	)
	return err
}

// AddComment добавляет комментарий к посту
func (s *SocialService) AddComment(authorID, postID uuid.UUID, content string) (*models.Comment, error) {
	if content == "" {
		return nil, errors.New("comment cannot be empty")
	}

	comment := &models.Comment{
		ID:        uuid.New(),
		PostID:    postID,
		AuthorID:  authorID,
		Content:   content,
		CreatedAt: time.Now(),
	}

	err := s.db.QueryRow(
		`INSERT INTO post_comments (id, post_id, author_id, content, created_at)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id`,
		comment.ID, comment.PostID, comment.AuthorID, comment.Content, comment.CreatedAt,
	).Scan(&comment.ID)

	if err != nil {
		return nil, err
	}

	// Fetch author metadata
	var avatar sql.NullString
	s.db.QueryRow("SELECT username, avatar FROM users WHERE id = $1", authorID).Scan(&comment.AuthorName, &avatar)
	if avatar.Valid {
		comment.AuthorAvatar = avatar.String
	}

	return comment, nil
}

// GetComments возвращает комментарии к посту
func (s *SocialService) GetComments(postID uuid.UUID) ([]models.Comment, error) {
	query := `
		SELECT c.id, c.post_id, c.author_id, u.username, u.avatar, c.content, c.created_at
		FROM post_comments c
		JOIN users u ON c.author_id = u.id
		WHERE c.post_id = $1
		ORDER BY c.created_at ASC
	`
	rows, err := s.db.Query(query, postID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	comments := []models.Comment{}
	for rows.Next() {
		var c models.Comment
		var avatar sql.NullString
		err := rows.Scan(&c.ID, &c.PostID, &c.AuthorID, &c.AuthorName, &avatar, &c.Content, &c.CreatedAt)
		if err != nil {
			continue
		}
		if avatar.Valid {
			c.AuthorAvatar = avatar.String
		}
		comments = append(comments, c)
	}

	return comments, nil
}

// SearchUsers ищет пользователей по нику или телефону
func (s *SocialService) SearchUsers(query string) ([]models.User, error) {
	rows, err := s.db.Query(`
		SELECT id, username, phone_number, avatar, public_key, created_at
		FROM users
		WHERE (username ILIKE $1 OR phone_number ILIKE $1)
		LIMIT 20`,
		"%"+query+"%",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := []models.User{}
	for rows.Next() {
		var u models.User
		var avatar sql.NullString
		if err := rows.Scan(&u.ID, &u.Username, &u.PhoneNumber, &avatar, &u.PublicKey, &u.CreatedAt); err != nil {
			continue
		}
		if avatar.Valid {
			u.Avatar = avatar.String
		}
		users = append(users, u)
	}
	return users, nil
}

// SyncContacts сопоставляет номера телефонов с пользователями
func (s *SocialService) SyncContacts(userID uuid.UUID, phones []string) ([]models.User, error) {
	rows, err := s.db.Query(`
		SELECT id, username, phone_number, avatar, public_key, created_at
		FROM users
		WHERE phone_number = ANY($1) AND id != $2`,
		pq.Array(phones), userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := []models.User{}
	for rows.Next() {
		var u models.User
		var avatar sql.NullString
		if err := rows.Scan(&u.ID, &u.Username, &u.PhoneNumber, &avatar, &u.PublicKey, &u.CreatedAt); err != nil {
			continue
		}
		if avatar.Valid {
			u.Avatar = avatar.String
		}
		users = append(users, u)
	}
	return users, nil
}
