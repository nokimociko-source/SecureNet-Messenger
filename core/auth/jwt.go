package auth

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type Claims struct {
	UserID   uuid.UUID `json:"userId"`
	Username string    `json:"username"`
	Role     string    `json:"role"`
	jwt.RegisteredClaims
}

func GenerateToken(userID uuid.UUID, username, role string, privateKey *rsa.PrivateKey) (string, error) {
	claims := Claims{
		UserID:   userID,
		Username: username,
		Role:     role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	return token.SignedString(privateKey)
}

func ValidateToken(tokenString string, publicKey *rsa.PublicKey) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return publicKey, nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}

	return nil, fmt.Errorf("invalid token")
}

func formatPEM(pemString string, keyType string) string {
	// Strip literally everything that could be a formatting artifact
	pemString = strings.ReplaceAll(pemString, "\\n", "")
	pemString = strings.ReplaceAll(pemString, "\n", "")
	pemString = strings.ReplaceAll(pemString, "\r", "")
	pemString = strings.ReplaceAll(pemString, "\t", "")
	pemString = strings.ReplaceAll(pemString, " ", "")
	pemString = strings.ReplaceAll(pemString, "\"", "")
	pemString = strings.ReplaceAll(pemString, "'", "")
	
	// Determine the compressed header and footer
	header := "-----BEGIN" + strings.ReplaceAll(keyType, " ", "") + "KEY-----"
	footer := "-----END" + strings.ReplaceAll(keyType, " ", "") + "KEY-----"
	
	// Extract pure base64
	raw := strings.ReplaceAll(pemString, header, "")
	raw = strings.ReplaceAll(raw, footer, "")
	
	// Reconstruct by 64 chars
	var chunks []string
	for i := 0; i < len(raw); i += 64 {
		end := i + 64
		if end > len(raw) {
			end = len(raw)
		}
		chunks = append(chunks, raw[i:end])
	}
	
	return "-----BEGIN " + keyType + " KEY-----\n" + strings.Join(chunks, "\n") + "\n-----END " + keyType + " KEY-----\n"
}

func ParseRSAPrivateKey(pemString string) (*rsa.PrivateKey, error) {
	pemString = formatPEM(pemString, "RSA PRIVATE")
	block, _ := pem.Decode([]byte(pemString))
	if block == nil {
		return nil, fmt.Errorf("failed to parse PEM block containing the key")
	}
	return x509.ParsePKCS1PrivateKey(block.Bytes)
}

func ParseRSAPublicKey(pemString string) (*rsa.PublicKey, error) {
	pemString = formatPEM(pemString, "RSA PUBLIC")
	block, _ := pem.Decode([]byte(pemString))
	if block == nil {
		return nil, fmt.Errorf("failed to parse PEM block containing the key")
	}
	pub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	switch pub := pub.(type) {
	case *rsa.PublicKey:
		return pub, nil
	default:
		return nil, fmt.Errorf("key type is not RSA")
	}
}

func GenerateRefreshToken() (string, error) {
	return uuid.New().String(), nil
}
