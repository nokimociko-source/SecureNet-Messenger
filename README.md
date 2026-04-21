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

---
© 2026 DemonestoriCat Systems. All rights reserved.
