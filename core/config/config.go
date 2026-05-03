package config

import (
	"net/url"
	"os"
	"strings"
)

var databaseURLKeys = []string{
	"DATABASE_URL",
	"POSTGRES_URL",
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

	// Try direct parse first
	parsed, err := url.Parse(raw)
	if err == nil && (parsed.Scheme == "postgres" || parsed.Scheme == "postgresql") {
		// Valid URL — ensure sslmode is set
		q := parsed.Query()
		if q.Get("sslmode") == "" {
			q.Set("sslmode", "require")
			parsed.RawQuery = q.Encode()
			return parsed.String()
		}
		return raw
	}

	// URL parse failed — likely due to special characters in password (e.g. !@#$)
	// Try to reconstruct with URL-encoded userinfo
	// Format: postgres://user:password@host:port/dbname?params
	if !strings.HasPrefix(raw, "postgres://") && !strings.HasPrefix(raw, "postgresql://") {
		return raw
	}

	scheme := "postgres://"
	if strings.HasPrefix(raw, "postgresql://") {
		scheme = "postgresql://"
	}
	rest := raw[len(scheme):]

	// Find the @ separator between userinfo and host
	atIdx := strings.LastIndex(rest, "@")
	if atIdx == -1 {
		// No @ found — can't fix
		return raw
	}

	userinfo := rest[:atIdx]
	hostPart := rest[atIdx+1:]

	// Split user:password
	colonIdx := strings.Index(userinfo, ":")
	if colonIdx == -1 {
		// No password — just reassemble
		rebuilt := scheme + url.PathEscape(userinfo) + "@" + hostPart
		return setDefaultSSLMode(rebuilt)
	}

	user := userinfo[:colonIdx]
	password := userinfo[colonIdx+1:]

	// URL-encode the password to handle special characters like !@#$%
	encodedPassword := url.QueryEscape(password)

	rebuilt := scheme + user + ":" + encodedPassword + "@" + hostPart
	return setDefaultSSLMode(rebuilt)
}

func setDefaultSSLMode(dbURL string) string {
	parsed, err := url.Parse(dbURL)
	if err != nil {
		return dbURL
	}
	q := parsed.Query()
	if q.Get("sslmode") == "" {
		q.Set("sslmode", "require")
		parsed.RawQuery = q.Encode()
		return parsed.String()
	}
	return dbURL
}
