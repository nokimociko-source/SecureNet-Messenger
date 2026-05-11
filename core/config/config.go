package config

import (
	"net/url"
	"os"
	"strings"
)

var databaseURLKeys = []string{
	"DATABASE_URL",
	"POSTGRES_URL",
	"PG_URL",
	"VERCEL_POSTGRES_URL",
	"POSTGRES_URL_NON_POOLING",
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
	MasterKey         string
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
		MasterKey:         getEnv("MASTER_KEY", "DANGER_INSECURE_DEFAULT_MASTER_KEY_32BYTES"),
	}
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

func DatabaseURLCandidateKeys() []string {
	keys := make([]string, len(databaseURLKeys))
	copy(keys, databaseURLKeys)
	return keys
}

func normalizeDatabaseURL(raw string) string {
	if raw == "" {
		return ""
	}

	// Try direct parse. If it works, the URL is likely already safe.
	if u, err := url.Parse(raw); err == nil && u.User != nil {
		return raw
	}

	// Fix URLs with special characters in password
	scheme := "postgres://"
	if strings.HasPrefix(raw, "postgresql://") {
		scheme = "postgresql://"
	} else if !strings.HasPrefix(raw, "postgres://") {
		return raw
	}

	rawWithoutScheme := raw[len(scheme):]
	atIdx := strings.LastIndex(rawWithoutScheme, "@")
	if atIdx == -1 {
		return raw
	}

	userinfoRaw := rawWithoutScheme[:atIdx]
	hostPathQuery := rawWithoutScheme[atIdx+1:]

	var user, password string
	if colonIdx := strings.Index(userinfoRaw, ":"); colonIdx != -1 {
		user = userinfoRaw[:colonIdx]
		password = userinfoRaw[colonIdx+1:]
	} else {
		user = userinfoRaw
	}

	// Safely encode user and password
	userInfo := url.UserPassword(user, password).String()
	
	return scheme + userInfo + "@" + hostPathQuery
}
