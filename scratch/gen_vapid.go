package main

import (
	"crypto/elliptic"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"log"
)

func main() {
	curve := elliptic.P256()
	privateKey, x, y, err := elliptic.GenerateKey(curve, rand.Reader)
	if err != nil {
		log.Fatal(err)
	}

	publicKey := append(elliptic.Marshal(curve, x, y))

	fmt.Printf("VAPID_PUBLIC_KEY=%s\n", base64.RawURLEncoding.EncodeToString(publicKey))
	fmt.Printf("VAPID_PRIVATE_KEY=%s\n", base64.RawURLEncoding.EncodeToString(privateKey))
}
