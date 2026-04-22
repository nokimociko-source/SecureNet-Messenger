package spanner

import (
	"context"
	"fmt"

	"securenet-backend/internal/models"

	"cloud.google.com/go/spanner"
	"github.com/google/uuid"
	"google.golang.org/api/iterator"
)

type UserRepo struct {
	client *spanner.Client
}

func NewUserRepo(client *spanner.Client) *UserRepo {
	return &UserRepo{client: client}
}

func (r *UserRepo) GetByPhone(ctx context.Context, phone string) (*models.User, error) {
	stmt := spanner.Statement{
		SQL: `SELECT id, phone_number, username, public_key, role, password_hash, online, last_seen_at, created_at, updated_at 
			  FROM users WHERE phone_number = @phone`,
		Params: map[string]interface{}{"phone": phone},
	}
	iter := r.client.Single().Query(ctx, stmt)
	defer iter.Stop()

	row, err := iter.Next()
	if err == iterator.Done {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	var u models.User
	if err := row.ToStruct(&u); err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *UserRepo) Create(ctx context.Context, user *models.User) error {
	if user.ID == uuid.Nil {
		user.ID = uuid.New()
	}
	
	m := spanner.Insert("users", 
		[]string{"id", "phone_number", "username", "public_key", "password_hash", "role", "created_at", "updated_at"},
		[]interface{}{user.ID.String(), user.PhoneNumber, user.Username, user.PublicKey, user.PasswordHash, user.Role, spanner.CommitTimestamp, spanner.CommitTimestamp},
	)
	
	_, err := r.client.Apply(ctx, []*spanner.Mutation{m})
	return err
}

func (r *UserRepo) UpdateStatus(ctx context.Context, userID string, status string) error {
	online := status == "online"
	m := spanner.Update("users", 
		[]string{"id", "online", "last_seen_at"},
		[]interface{}{userID, online, spanner.CommitTimestamp},
	)
	_, err := r.client.Apply(ctx, []*spanner.Mutation{m})
	return err
}

func (r *UserRepo) GetByID(ctx context.Context, userID string) (*models.User, error) {
	row, err := r.client.Single().ReadRow(ctx, "users", spanner.Key{userID}, 
		[]string{"id", "phone_number", "username", "public_key", "role", "password_hash", "online", "last_seen_at", "created_at", "updated_at"})
	if err != nil {
		return nil, err
	}
	var u models.User
	if err := row.ToStruct(&u); err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *UserRepo) Search(ctx context.Context, query string, limit int) ([]*models.User, error) {
	stmt := spanner.Statement{
		SQL: `SELECT id, phone_number, username, public_key, role FROM users 
			  WHERE phone_number LIKE @query OR username LIKE @query LIMIT @limit`,
		Params: map[string]interface{}{
			"query": fmt.Sprintf("%%%s%%", query),
			"limit": limit,
		},
	}
	iter := r.client.Single().Query(ctx, stmt)
	defer iter.Stop()

	var users []*models.User
	for {
		row, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, err
		}
		var u models.User
		if err := row.ToStruct(&u); err != nil {
			continue
		}
		users = append(users, &u)
	}
	return users, nil
}
