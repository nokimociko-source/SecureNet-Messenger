package config

import (
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	DatabaseURL     string
	Port            string
	JWTSecret       string
	VAPIDPublicKey  string
	VAPIDPrivateKey string
}

func Load() *Config {
	if err := godotenv.Load(); err != nil {
		// Ignore error if .env doesn't exist
	}

	return &Config{
		DatabaseURL:     getEnv("DATABASE_URL", "postgresql://localhost:5432/securenet?sslmode=disable"),
		Port:            getEnv("PORT", "8080"),
		JWTSecret:       getEnv("JWT_SECRET", "DANGER_INSECURE_DEFAULT_SECRET_MUST_CHANGE_IN_PRODUCTION"),
		VAPIDPublicKey:  os.Getenv("VAPID_PUBLIC_KEY"),
		VAPIDPrivateKey: os.Getenv("VAPID_PRIVATE_KEY"),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
