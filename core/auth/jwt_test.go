package auth

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"strings"
	"testing"
)

func TestParseRSAPrivateKeyAcceptsEscapedPEM(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}

	pemBytes := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})
	escaped := strings.ReplaceAll(string(pemBytes), "\n", "\\n")

	parsed, err := ParseRSAPrivateKey(escaped)
	if err != nil {
		t.Fatalf("parse escaped pem: %v", err)
	}
	if parsed.N.Cmp(key.N) != 0 {
		t.Fatalf("parsed key does not match original")
	}
}

func TestParseRSAPrivateKeyAcceptsBase64EncodedPEM(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}

	pemBytes := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})
	b64 := base64.StdEncoding.EncodeToString(pemBytes)

	parsed, err := ParseRSAPrivateKey(b64)
	if err != nil {
		t.Fatalf("parse base64 pem: %v", err)
	}
	if parsed.N.Cmp(key.N) != 0 {
		t.Fatalf("parsed key does not match original")
	}
}
