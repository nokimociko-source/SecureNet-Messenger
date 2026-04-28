package config

import (
	"os"
	"strings"
)

type Config struct {
	DatabaseURL      string
	Port             string
	JWTSecret        string
	VAPIDPublicKey   string
	VAPIDPrivateKey  string
	TelegramBotToken string
}

func Load() *Config {
	return &Config{
		DatabaseURL:      mustGetEnv("DATABASE_URL"),
		Port:             getEnv("PORT", "8080"),
		JWTSecret:        getEnv("JWT_SECRET", "DANGER_INSECURE_DEFAULT_SECRET_MUST_CHANGE_IN_PRODUCTION"),
		VAPIDPublicKey:   getEnv("VAPID_PUBLIC_KEY", ""),
		VAPIDPrivateKey:  getEnv("VAPID_PRIVATE_KEY", ""),
		TelegramBotToken: getEnv("TELEGRAM_BOT_TOKEN", ""),
	}
}

func mustGetEnv(key string) string {
	value, ok := lookupEnvValue(key)
	if ok {
		return value
	}
	return ""
}

func getEnv(key, defaultValue string) string {
	value, ok := lookupEnvValue(key)
	if !ok || value == "" {
		return defaultValue
	}
	return value
}

func lookupEnvValue(key string) (string, bool) {
	if value, ok := os.LookupEnv(key); ok {
		return strings.TrimSpace(value), true
	}

	for _, raw := range os.Environ() {
		envKey, envValue, found := strings.Cut(raw, "=")
		if !found {
			continue
		}
		if strings.TrimSpace(envKey) != key {
			continue
		}
		return strings.TrimSpace(envValue), true
	}

	return "", false
}
