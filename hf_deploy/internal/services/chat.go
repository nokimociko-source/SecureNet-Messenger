package services

import (
	"context"
	"fmt"

	"securenet-backend/internal/models"
	"securenet-backend/internal/repository"

	"github.com/google/uuid"
)

// ChatService handles group chat and direct chat business logic.
type ChatService struct {
	chatRepo repository.ChatRepository
	auditSvc *AuditService
}

func NewChatService(chatRepo repository.ChatRepository, auditSvc *AuditService) *ChatService {
	return &ChatService{chatRepo: chatRepo, auditSvc: auditSvc}
}

// CreateGroupChat creates a new group chat with the given participants.
func (s *ChatService) CreateGroupChat(ctx context.Context, creatorID uuid.UUID, name string, participantIDs []uuid.UUID) (*models.ChatWithParticipants, error) {
	// Ensure creator is in the participant list
	creatorIncluded := false
	for _, id := range participantIDs {
		if id == creatorID {
			creatorIncluded = true
			break
		}
	}
	if !creatorIncluded {
		participantIDs = append([]uuid.UUID{creatorID}, participantIDs...)
	}

	if len(participantIDs) < 1 {
		return nil, fmt.Errorf("group chat requires at least 1 participant")
	}

	chat := &models.Chat{
		Type:      "group",
		Name:      &name,
		CreatedBy: creatorID,
	}

	chatID, err := s.chatRepo.CreateChat(ctx, chat, participantIDs)
	if err != nil {
		return nil, fmt.Errorf("create group chat: %w", err)
	}

	result, err := s.chatRepo.GetChatByID(ctx, chatID)
	if err != nil {
		return nil, fmt.Errorf("get created chat: %w", err)
	}

	if s.auditSvc != nil {
		s.auditSvc.LogAction(creatorID, models.AuditActionChatCreated, "chat", nil, map[string]interface{}{
			"chat_id":      chatID,
			"name":         name,
			"participants": len(participantIDs),
			"type":         "group",
		}, "", "")
	}

	return result, nil
}

// CreateDirectChat creates or retrieves a direct chat between two users.
func (s *ChatService) CreateDirectChat(ctx context.Context, userID, contactID uuid.UUID) (*models.ChatWithParticipants, error) {
	// Check if direct chat already exists
	userChats, err := s.chatRepo.GetUserChats(ctx, userID.String())
	if err == nil {
		for _, chat := range userChats {
			if chat.Type == "direct" {
				for _, p := range chat.Participants {
					if p.UserID == contactID {
						return chat, nil
					}
				}
			}
		}
	}

	chat := &models.Chat{
		Type:      "direct",
		CreatedBy: userID,
	}

	chatID, err := s.chatRepo.CreateChat(ctx, chat, []uuid.UUID{userID, contactID})
	if err != nil {
		return nil, fmt.Errorf("create direct chat: %w", err)
	}

	return s.chatRepo.GetChatByID(ctx, chatID)
}

// GetUserChats returns all chats for a user.
func (s *ChatService) GetUserChats(ctx context.Context, userID string) ([]*models.ChatWithParticipants, error) {
	return s.chatRepo.GetUserChats(ctx, userID)
}

// GetChat returns a specific chat by ID.
func (s *ChatService) GetChat(ctx context.Context, chatID string) (*models.ChatWithParticipants, error) {
	return s.chatRepo.GetChatByID(ctx, chatID)
}

// AddMember adds a user to a group chat.
func (s *ChatService) AddMember(ctx context.Context, chatID string, userID uuid.UUID) error {
	return s.chatRepo.AddParticipant(ctx, chatID, userID, "member")
}

// RemoveMember removes a user from a group chat.
func (s *ChatService) RemoveMember(ctx context.Context, chatID string, userID uuid.UUID) error {
	return s.chatRepo.RemoveParticipant(ctx, chatID, userID)
}

// UpdateGroupName changes the name of a group chat.
func (s *ChatService) UpdateGroupName(ctx context.Context, chatID, name string) error {
	return s.chatRepo.UpdateChat(ctx, chatID, name)
}

// EnsureSavedChat ensures the "Saved Messages" chat exists for a user.
func (s *ChatService) EnsureSavedChat(ctx context.Context, userID uuid.UUID) error {
	return s.chatRepo.EnsureSavedChat(ctx, userID)
}

// IsParticipant checks if a user is a participant of a chat.
func (s *ChatService) IsParticipant(ctx context.Context, chatID string, userID string) (bool, error) {
	return s.chatRepo.IsParticipant(ctx, chatID, userID)
}
