package main

import (
	"encoding/base64"
	"fmt"
	"io/ioutil"
	"log"
)

func main() {
	priv, err := ioutil.ReadFile("scratch/priv.txt")
	if err != nil {
		log.Fatal(err)
	}
	pub, err := ioutil.ReadFile("scratch/pub.txt")
	if err != nil {
		log.Fatal(err)
	}

	privB64 := base64.StdEncoding.EncodeToString(priv)
	pubB64 := base64.StdEncoding.EncodeToString(pub)

	err = ioutil.WriteFile("scratch/priv_b64.txt", []byte(privB64), 0644)
	err = ioutil.WriteFile("scratch/pub_b64.txt", []byte(pubB64), 0644)
	fmt.Println("Base64 keys generated.")
}
