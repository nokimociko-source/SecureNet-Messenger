package main

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"log"
)

func main() {
	// Generate RSA key
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		log.Fatal(err)
	}

	// Encode Private Key to PEM
	privateKeyPEM := &pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(privateKey),
	}
	fmt.Println("---PRIVATE KEY START---")
	fmt.Print(string(pem.EncodeToMemory(privateKeyPEM)))
	fmt.Println("---PRIVATE KEY END---")

	// Encode Public Key to PEM
	publicKeyBytes, err := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
	if err != nil {
		log.Fatal(err)
	}
	publicKeyPEM := &pem.Block{
		Type:  "RSA PUBLIC KEY",
		Bytes: publicKeyBytes,
	}
	fmt.Println("\n---PUBLIC KEY START---")
	fmt.Print(string(pem.EncodeToMemory(publicKeyPEM)))
	fmt.Println("---PUBLIC KEY END---")
}
