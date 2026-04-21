# 🐾 Catlover Messenger (Enterprise Hardened)
**The Ultimate Privacy Protocol for Mass Communication.**

Catlover is a military-grade, cross-platform communication system built on a **Zero-Knowledge Architecture**. Developed by **DemonestoriCat** and designed for 70M+ users, it ensures that your identity, messages, and social metadata are mathematically shielded from surveillance.

## 🚀 Vision
Our mission is to eliminate the concept of "trusted third parties". In the Catlover ecosystem, the only entity you trust is the laws of mathematics.

## ✨ Key Features
- **Quantum-Resistant Preparedness**: Using **NIST P-521** (the strongest NIST curve) for all key agreements.
- **Double Ratchet (Signal Protocol)**: Every message has its own unique, temporary encryption key.
- **Client-Side Sovereignty**: Digital signatures (ECDSA SHA-512) for all social posts ensure cryptographically verified authorship.
- **High-Quality Encrypted Media**: AES-256-GCM encrypted binary transfers.

## 🛡 Security Specifications
- **Asymmetric**: ECDH (P-521) / X3DH.
- **Signatures**: ECDSA with SHA-512.
- **Symmetric**: AES-256-GCM.
- **KDF**: PBKDF2 (SHA-512, 600,000 iterations).

## 🛠 Tech Stack
- **Backend**: Go (Golang), PostgreSQL, Redis.
- **Frontend**: React, Vite, TypeScript.
- **Mobile**: Kotlin (Android Native).
- **Desktop**: Rust / Tauri.

## 📦 Getting Started
```bash
# Launch the entire stack
docker-compose up -d --build
```

## 📜 Legal
See [PRIVACY_POLICY.md](docs/PRIVACY_POLICY.md) and [TERMS_OF_SERVICE.md](docs/TERMS_OF_SERVICE.md).

<<<<<<< HEAD
---
© 2026 DemonestoriCat Systems. All rights reserved.
=======
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
>>>>>>> origin/codex/verify-request-cu3ass
