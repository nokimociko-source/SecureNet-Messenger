package config

import (
	"strings"
	"testing"
)

func TestLookupEnvValueFallsBackToTrimmedKey(t *testing.T) {
	t.Setenv("DATABASE_URL ", " postgres://user:pass@localhost:5432/db?sslmode=require ")

	got, ok := lookupEnvValue("DATABASE_URL")
	if !ok {
		t.Fatalf("expected key to be found via trimmed lookup")
	}
	if got != "postgres://user:pass@localhost:5432/db?sslmode=require" {
		t.Fatalf("unexpected value: %q", got)
	}
}

func TestMustGetEnvAnyUsesAliases(t *testing.T) {
	t.Setenv("POSTGRES_URL", "postgres://alias.example:5432/app?sslmode=require")

	got, source := mustGetEnvAny(databaseURLKeys...)
	if got == "" {
		t.Fatalf("expected database URL from aliases")
	}
	if source != "POSTGRES_URL" {
		t.Fatalf("unexpected source key: %s", source)
	}
}

func TestNormalizeDatabaseURLAddsSSLMode(t *testing.T) {
	got := normalizeDatabaseURL("postgres://user:pass@db.example:5432/app")
	if !strings.Contains(got, "sslmode=require") {
		t.Fatalf("expected sslmode=require in url, got: %s", got)
	}
}
