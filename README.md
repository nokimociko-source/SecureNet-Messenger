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

## 📜 License
Private / Proprietary
