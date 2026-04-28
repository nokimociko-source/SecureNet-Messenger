package config

import (
	"net/url"
	"os"
	"strings"
)

var databaseURLKeys = []string{
	"DATABASE_URL",
	"POSTGRES_URL",
	"POSTGRES_PRISMA_URL",
	"SUPABASE_DB_URL",
	"DB_URL",
}

type Config struct {
	DatabaseURL       string
	DatabaseURLSource string
	Port              string
	JWTSecret         string
	VAPIDPublicKey    string
	VAPIDPrivateKey   string
	TelegramBotToken  string
}

func Load() *Config {
	databaseURL, databaseURLSource := mustGetEnvAny(databaseURLKeys...)

	return &Config{
		DatabaseURL:       normalizeDatabaseURL(databaseURL),
		DatabaseURLSource: databaseURLSource,
		Port:              getEnv("PORT", "8080"),
		JWTSecret:         getEnv("JWT_SECRET", "DANGER_INSECURE_DEFAULT_SECRET_MUST_CHANGE_IN_PRODUCTION"),
		VAPIDPublicKey:    getEnv("VAPID_PUBLIC_KEY", ""),
		VAPIDPrivateKey:   getEnv("VAPID_PRIVATE_KEY", ""),
		TelegramBotToken:  getEnv("TELEGRAM_BOT_TOKEN", ""),
	}
}

func DatabaseURLCandidates() []string {
	return append([]string(nil), databaseURLKeys...)
}

func mustGetEnvAny(keys ...string) (string, string) {
	for _, key := range keys {
		value, ok := lookupEnvValue(key)
		if ok && value != "" {
			return value, key
		}
	}
	return "", ""
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
		if !strings.EqualFold(strings.TrimSpace(envKey), key) {
			continue
		}
		return strings.TrimSpace(envValue), true
	}

	return "", false
}

func normalizeDatabaseURL(raw string) string {
	if raw == "" {
		return ""
	}

	parsed, err := url.Parse(raw)
	if err != nil {
		return raw
	}

	if parsed.Scheme != "postgres" && parsed.Scheme != "postgresql" {
		return raw
	}

	q := parsed.Query()
	if q.Get("sslmode") == "" {
		q.Set("sslmode", "require")
		parsed.RawQuery = q.Encode()
		return parsed.String()
	}

	return raw
}
