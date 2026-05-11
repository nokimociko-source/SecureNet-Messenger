package auth

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
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

func normalizePEM(input string) string {
	// 1. Basic cleanup
	s := strings.TrimSpace(input)
	s = strings.Trim(s, `"'`)
	s = strings.ReplaceAll(s, "\\n", "\n")
	s = strings.ReplaceAll(s, "\\r", "")

	// 2. If it contains the header, extract it carefully
	if strings.Contains(s, "-----BEGIN") {
		start := strings.Index(s, "-----BEGIN")
		end := strings.Index(s, "-----END")
		if end > start {
			// Find the actual start of the base64 content (after the first footer line)
			headerEnd := strings.Index(s[start:], "-----")
			if headerEnd != -1 {
				headerEnd += start + 5
				headerClosing := strings.Index(s[headerEnd:], "-----")
				if headerClosing != -1 {
					headerClosing += headerEnd + 5
					
					// Find the start of the footer
					footerStart := end
					
					// Extract base64 content and remove all whitespace
					base64Content := s[headerClosing:footerStart]
					base64Content = strings.Map(func(r rune) rune {
						if (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '+' || r == '/' || r == '=' {
							return r
						}
						return -1
					}, base64Content)
					
					// Reconstruct with proper headers and 64-char wrapping
					var builder strings.Builder
					// Extract header type
					headerLine := s[start:headerClosing]
					footerLine := s[end:]
					closingIdx := strings.Index(footerLine[5:], "-----")
					if closingIdx != -1 {
						footerLine = footerLine[:5+closingIdx+5]
					}
					
					builder.WriteString(headerLine)
					builder.WriteString("\n")
					for i := 0; i < len(base64Content); i += 64 {
						endIdx := i + 64
						if endIdx > len(base64Content) {
							endIdx = len(base64Content)
						}
						builder.WriteString(base64Content[i:endIdx])
						builder.WriteString("\n")
					}
					builder.WriteString(footerLine)
					return builder.String()
				}
			}
		}
		return s
	}

	// 3. Try Base64 decode
	decoded, err := base64.StdEncoding.DecodeString(s)
	if err == nil {
		return normalizePEM(string(decoded))
	}

	return s
}

func ParseRSAPrivateKey(pemString string) (*rsa.PrivateKey, error) {
	normalized := normalizePEM(pemString)
	block, _ := pem.Decode([]byte(normalized))
	if block == nil {
		// Log the first and last 20 chars for debugging (safe)
		startChars := ""
		if len(normalized) > 20 { startChars = normalized[:20] }
		endChars := ""
		if len(normalized) > 20 { endChars = normalized[len(normalized)-20:] }
		
		return nil, fmt.Errorf("failed to parse JWT_PRIVATE_KEY (len:%d, start:%s, end:%s): failed to parse PEM block", 
			len(normalized), startChars, endChars)
	}

	if key, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
		return key, nil
	}

	pkcs8Key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, err
	}

	rsaKey, ok := pkcs8Key.(*rsa.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("key type is not RSA")
	}
	return rsaKey, nil
}

func ParseRSAPublicKey(pemString string) (*rsa.PublicKey, error) {
	normalized := normalizePEM(pemString)
	block, _ := pem.Decode([]byte(normalized))
	if block == nil {
		return nil, fmt.Errorf("failed to parse RSA public key: failed to parse PEM block")
	}

	if key, err := x509.ParsePKIXPublicKey(block.Bytes); err == nil {
		rsaKey, ok := key.(*rsa.PublicKey)
		if !ok {
			return nil, fmt.Errorf("key type is not RSA")
		}
		return rsaKey, nil
	}

	if key, err := x509.ParsePKCS1PublicKey(block.Bytes); err == nil {
		return key, nil
	}

	return nil, fmt.Errorf("failed to parse RSA public key")
}

func GenerateRefreshToken() (string, error) {
	return uuid.New().String(), nil
}
