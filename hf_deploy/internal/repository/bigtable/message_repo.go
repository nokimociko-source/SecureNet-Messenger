package bigtable

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"securenet-backend/internal/models"

	"cloud.google.com/go/bigtable"
	"github.com/google/uuid"
)

type MessageRepo struct {
	client *bigtable.Client
	table  string
}

func NewMessageRepo(client *bigtable.Client, table string) *MessageRepo {
	return &MessageRepo{client: client, table: table}
}

// RowKey format: ChatID#InvertedTimestamp#MessageID
func (r *MessageRepo) StoreMessage(ctx context.Context, msg *models.Message, clientMsgID string) (string, error) {
	if msg.ID == uuid.Nil {
		msg.ID = uuid.New()
	}

	tbl := r.client.Open(r.table)
	
	// Используем инвертированное время для сортировки в Bigtable (новые сверху)
	invertedTimestamp := 999999999999999999 - time.Now().UnixNano()
	rowKey := fmt.Sprintf("%s#%d#%s", msg.ChatID.String(), invertedTimestamp, msg.ID.String())

	mut := bigtable.NewMutation()
	data, _ := json.Marshal(msg)
	
	mut.Set("msg", "data", bigtable.Now(), data)
	if clientMsgID != "" {
		mut.Set("msg", "client_msg_id", bigtable.Now(), []byte(clientMsgID))
	}

	err := tbl.Apply(ctx, rowKey, mut)
	return msg.ID.String(), err
}

func (r *MessageRepo) GetChatMessages(ctx context.Context, chatID string, limit int, offset int) ([]*models.Message, error) {
	tbl := r.client.Open(r.table)
	
	// Префиксный поиск по ChatID
	prefix := chatID + "#"
	var messages []*models.Message
	
	err := tbl.ReadRows(ctx, bigtable.PrefixRange(prefix), func(row bigtable.Row) bool {
		if len(messages) >= limit {
			return false
		}
		
		for _, items := range row {
			for _, item := range items {
				if item.Column == "msg:data" {
					var m models.Message
					if err := json.Unmarshal(item.Value, &m); err == nil {
						messages = append(messages, &m)
					}
				}
			}
		}
		return true
	})

	return messages, err
}

func (r *MessageRepo) UpdateMessageStatus(ctx context.Context, messageID string, status string) error {
	// В Bigtable обновление по ID требует знания RowKey (который содержит Timestamp). 
	// В продакшене для этого используется либо вторичный индекс в Spanner, 
	// либо специальная таблица-маппинг ID -> RowKey.
	return nil // Упрощено для примера архитектуры
}
