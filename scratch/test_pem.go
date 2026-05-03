package main

import (
	"fmt"
	"strings"
	"encoding/pem"
)

func formatPEM(pemString string, keyType string) string {
	pemString = strings.ReplaceAll(pemString, "\\n", "\n")
	pemString = strings.Trim(pemString, "\"") // Remove surrounding quotes if any
	
	if strings.Contains(pemString, "\n") && len(strings.Split(pemString, "\n")) > 2 {
		return pemString // Already seems formatted
	}
	
	// If it's all one line, try to reconstruct it
	pemString = strings.ReplaceAll(pemString, " ", "") // remove spaces except in headers
	header := "-----BEGIN" + strings.ReplaceAll(keyType, " ", "") + "KEY-----"
	footer := "-----END" + strings.ReplaceAll(keyType, " ", "") + "KEY-----"
	
	// Remove headers to get raw base64
	raw := strings.ReplaceAll(pemString, header, "")
	raw = strings.ReplaceAll(raw, footer, "")
	raw = strings.ReplaceAll(raw, "\n", "")
	raw = strings.ReplaceAll(raw, "\r", "")
	
	// chunk by 64 chars
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

func main() {
	// Simulate Vercel input
	input := `-----BEGIN RSA PRIVATE KEY----- MIIEowIBAAKCAQEA21JittWaWgL/wl2iLkjI5SWPJwXFyC3L6FfkGPploNMwRNMh BsORApLz7H9T7+7s527VH9XTEcttTrgHfRFVBNcVVEdAEco2of3ER7pQm3Vi5gXI 0lP4sdU1zYfKqkEyPotBh4TWI/4SkWc6M8Z85n8Hl+YSBQDDLY9AKoHboMBY//so 77w9x8mqwetSaLa2yW9Uop0lgf3E7qhJEKaiKrPNWpQrJ31m0rHUmkHqNIP9caPa 5zWCCVyDMXMze0XmnpT2oGrIMjXBRZ50aY0ibdK+gAt2UQQfyLJnZkypKZu3z5FB cX66ebOXfMMj5w9tUooLTUJl1Km3RdxE2UhokQIDAQABAoIBADRiVuAXIEUICtj8 fshhy5QJtsmqBA22PIoL9hfuNLhnQNPrfqusKdZMzbSKy/xWm6CCdSajroSFS2Ae LfG2IlGj4r0MwJWPMCHcaBV+v5KGBN9uecMc2d110KI84Q/tvwe3wKjS9kfF/17Z 4kmsCriOFjz2b47g2f1nhfqxJglcfp+ebRVQaogyxhB2DxuHhjRoww8sryowHO2J HymCK8dOmzjjBL6vo84UWr2zND0qo+LBEDvVlH8iAu2q4hzZ+RPz/dtbuC2X2q3c CUpreSYqmuMiFG0RqjePXatFt7cJBiHKv/Mb23sX7UI6/5awbLJI5+VkQuzQYYeK ef5ifW0CgYEA6Llu+KDwvTWo8beLb/DeY3TyS2tT+ywHJnGcTjk5sDOGJXCggBHR 4r8gOKwr/pxc49IJXmrM/7XsbBBv41UokvhrGK/pBr3s4citNefxGy/ORt0QW6WB Ln7ZwI7wdO9ddqailH9iymWr+Mzh3qmJKCdGfmuaH7WD0clSO3ZTWA0CgYEA8UHM yAQH2TfXn1TkOTwxtPJWfTcDEJJMaZy2Vi3Kvcdml+g23dM0EDSvFCFPAJmCDvlv YmXyzxtDq7Oy7CEoYzlKfCFS1puQOh3h/stSoOPNYGWuUKhYbbi4RTHiQNlX5k5M z9LpgNxZOQRjJNsBU68pIoxbs41RmRihQE+jjZUCgYAm9y1SabgFJh/kYOPy2TST GHideHpcmrGTyT/vhPtYujfCuwnUh6dJvNCLTKCNH+cZqggxi9ZJFk/AhDwHpzGE 8h0UZBezLkekQjJmLTCcabOy/76Gab6oZ0rUR9qQ6acPf7UHAhErbDyQCtXiryYs 1+6gqimDF6Q7kua22Af6XQKBgCKE2KkRspHI5KgefF0YGMCcH/Xghia72AUQcCJa gPSwcCRyDE+m5X8gGqDVtzkNvccot2Ar2Bb7/q21k3cns2CnFNo35mNgdL1sAyby rororT0Kr2tI+wYP9QWpgobm0iXYtDLUKabPYFDBKPJgB4uSt18DGCfTo4Y1OPU7 r9oVAoGBANI8XIsv0CpZPM1ns/S9AXJBhiFl8wNHEmIFPFVVb2FMvaabGogT22lK Qa6xyrH2svPiu7mGFAo11FNVzAU6bgqzITqXcsUGBD6bowjAhIBzzgEE3XU0aWZW NJleBbclkTE1HsyeOLEODeA6zAG+DAjudSTGe8zOVMzqDC41zkhB -----END RSA PRIVATE KEY-----`
	formatted := formatPEM(input, "RSA PRIVATE")
	block, _ := pem.Decode([]byte(formatted))
	if block == nil {
		fmt.Println("FAILED TO DECODE")
		fmt.Println(formatted)
	} else {
		fmt.Println("SUCCESS")
	}
}
