package config

import "testing"

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
