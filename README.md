# 🐾 Catlover Messenger (Production Ready)

Military-grade E2EE messenger with Zero-Knowledge architecture, high-quality media support, and Double Ratchet security.

## 🚀 Key Features
- **Zero-Knowledge E2EE**: All messages and media are encrypted on the device using WebCrypto API.
- **Double Ratchet (Signal Protocol)**: Perfect Forward Secrecy for every session.
- **High-Quality Media**: Encrypted binary blob transfers without standard browser compression.
- **Saved Messages**: Telegram-style private storage for notes and files.
- **Military-Grade Infrastructure**: Go backend with Nginx Anti-DDoS protection.
- **Cross-Platform**: Web, Android (Kotlin), and Windows (Tauri/Rust) support.

## 🛡 Security Architecture
- **Encryption**: AES-256-GCM for messages, RSA-4096 for identity.
- **Authentication**: JWT-based sessions with password-derived Master Key.
- **Privacy**: No metadata leaks, restricted WebSocket broadcasting, and selective presence.

## 🛠 Tech Stack
- **Frontend**: React, Vite, TypeScript, Tailwind CSS.
- **Backend**: Go (Golang), PostgreSQL, Redis.
- **Infra**: Nginx (WAF/Anti-DDoS), Docker Compose.
- **Mobile**: Kotlin (Android Native).
- **Desktop**: Rust/Tauri.

## 📦 Getting Started

### Prerequisites
- Docker & Docker Compose
- Node.js 18+

### Launch with Docker (Recommended)
```bash
docker-compose up -d --build
```

### Local Development
1. **Backend**:
   ```bash
   cd backend
   go run ./cmd/server/main.go
   ```
2. **Frontend**:
   ```bash
   npm install
   npm run dev
   ```

## 🏗 CI/CD
Automated pipelines via GitHub Actions:
- **Backend**: Build, Test, and Security Scan (gosec).
- **Frontend**: Type-check (tsc) and Production Build.

## 🔄 Self-hosted Updates (GitHub/Telegram)
If you do not use Play Market/App Store, SecureNet can expose update metadata from backend:

`GET /api/updates/latest?platform=android|windows`

Configure via environment variables:

- `ANDROID_LATEST_VERSION`
- `ANDROID_APK_URL`
- `ANDROID_APK_SHA256`
- `ANDROID_RELEASE_NOTES`
- `WINDOWS_LATEST_VERSION`
- `WINDOWS_INSTALLER_URL`
- `WINDOWS_INSTALLER_SHA256`
- `WINDOWS_RELEASE_NOTES`

Use HTTPS URLs only (GitHub Releases or trusted Telegram CDN links), and always publish SHA-256 for integrity checks.

## 📜 License
Private / Proprietary
