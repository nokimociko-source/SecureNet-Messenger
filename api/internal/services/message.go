package services

import (
	"context"
	"fmt"

	"securenet-backend/internal/models"
	"securenet-backend/internal/repository"

	"github.com/google/uuid"
)

type MessageService struct {
	messageRepo repository.MessageRepository
	chatRepo    repository.ChatRepository
	auditSvc    *AuditService
}

func NewMessageService(messageRepo repository.MessageRepository, chatRepo repository.ChatRepository, auditSvc *AuditService) *MessageService {
	return &MessageService{
		messageRepo: messageRepo,
		chatRepo:    chatRepo,
		auditSvc:    auditSvc,
	}
}

func (s *MessageService) SendMessage(ctx context.Context, msg *models.Message, clientMsgID string) (*models.Message, error) {
	// Сохраняем сообщение через репозиторий (Idempotent)
	msgID, err := s.messageRepo.StoreMessage(ctx, msg, clientMsgID)
	if err != nil {
		return nil, fmt.Errorf("failed to store message: %w", err)
	}

	// Обновляем время последнего сообщения в чате
	// Это важно для сортировки списка чатов
	// s.chatRepo.UpdateLastMessageTime(ctx, msg.ChatID.String())

	// Логируем действие
	if s.auditSvc != nil {
		s.auditSvc.LogAction(msg.SenderID, models.AuditActionMessageSent, "message", nil, map[string]interface{}{
			"chat_id": msg.ChatID,
			"type":    msg.Type,
		}, "", "")
	}

	msg.ID = uuid.MustParse(msgID)
	return msg, nil
}

func (s *MessageService) GetHistory(ctx context.Context, chatID string, limit, offset int) ([]*models.Message, error) {
	return s.messageRepo.GetChatMessages(ctx, chatID, limit, offset)
}
