package services

import (
	"context"
	"errors"
	"time"

	"securenet-backend/internal/auth"
	"securenet-backend/internal/models"
	"securenet-backend/internal/repository"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

type AuthService struct {
	userRepo  repository.UserRepository
	jwtSecret string
}

func NewAuthService(userRepo repository.UserRepository, jwtSecret string) *AuthService {
	return &AuthService{
		userRepo:  userRepo,
		jwtSecret: jwtSecret,
	}
}

func (s *AuthService) Register(ctx context.Context, phone, email, username, password, publicKey string) (*models.User, string, error) {
	existingPhone, _ := s.userRepo.GetByPhone(ctx, phone)
	if existingPhone != nil {
		return nil, "", errors.New("пользователь с таким номером уже существует")
	}

	if email != "" {
		existingEmail, _ := s.userRepo.GetByEmail(ctx, email)
		if existingEmail != nil {
			return nil, "", errors.New("пользователь с такой почтой уже существует")
		}
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, "", err
	}

	role := "user"
	// Bootstrap: only the very first account can become admin automatically.
	count, _ := s.userRepo.Count(ctx)
	if count == 0 {
		role = "admin"
	}

	user := &models.User{
		ID:           uuid.New(),
		PhoneNumber:  phone,
		Email:        email,
		Username:     username,
		PasswordHash: string(hashedPassword),
		PublicKey:    publicKey,
		Role:         role,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		return nil, "", err
	}

	token, err := auth.GenerateToken(user.ID, user.Username, user.Role, s.jwtSecret)
	return user, token, err
}

func (s *AuthService) Login(ctx context.Context, phone, password string) (*models.User, string, error) {
	user, err := s.userRepo.GetByPhone(ctx, phone)
	if err != nil || user == nil {
		return nil, "", errors.New("invalid credentials")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, "", errors.New("invalid credentials")
	}

	token, err := auth.GenerateToken(user.ID, user.Username, user.Role, s.jwtSecret)
	return user, token, err
}
