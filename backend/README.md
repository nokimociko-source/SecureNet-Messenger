# SecureNet Backend

Go-based backend for SecureNet E2EE messenger with WebSocket support.

## 🚀 Features

- **WebSocket** - Real-time messaging with ping/pong heartbeat
- **REST API** - Authentication, contacts, chats
- **PostgreSQL** - Data persistence
- **JWT Auth** - Secure authentication
- **CORS** - Configured for frontend

## 📁 Structure

```
backend/
├── cmd/server/        # Entry point
│   └── main.go
├── internal/
│   ├── api/          # REST API routes
│   ├── auth/         # JWT utilities
│   ├── config/       # Configuration
│   ├── db/           # Database connection & migrations
│   ├── models/       # Data models
│   └── websocket/    # WebSocket hub & client
├── go.mod
└── README.md
```

## 🛠 Setup

### Prerequisites

- Go 1.21+
- PostgreSQL 14+

### Install Dependencies

```bash
cd backend
go mod download
```

### Environment Variables

```bash
export DATABASE_URL="postgresql://localhost:5432/securenet?sslmode=disable"
export PORT="8080"
export JWT_SECRET="your-secret-key-change-in-production"
```

### Create Database

```sql
CREATE DATABASE securenet;
```

### Run

```bash
go run cmd/server/main.go
```

Server starts on `http://localhost:8080`

## 📡 API Endpoints

### Auth
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login

### Users
- `GET /api/users/search?q=query` - Search users (auth required)

### Contacts
- `GET /api/contacts` - List contacts (auth required)
- `POST /api/contacts` - Add contact (auth required)

### Chats
- `GET /api/chats` - List chats (auth required)
- `GET /api/chats/:id/messages` - Get messages (auth required)

### WebSocket
- `GET /ws?userId=xxx&username=xxx` - WebSocket connection

## 🔌 WebSocket Protocol

### Connect
```
ws://localhost:8080/ws?userId=<uuid>&username=<name>
```

### Message Types

#### Send Message
```json
{
  "type": "message",
  "chatId": "uuid",
  "content": "encrypted-base64"
}
```

#### Typing Indicator
```json
{
  "type": "typing",
  "chatId": "uuid"
}
```

#### Read Receipt
```json
{
  "type": "read",
  "messageId": "uuid"
}
```

### Receive Events
- `message` - New message
- `typing` - User typing
- `read` - Message read
- `presence` - User online/offline status

## 🔐 Security

- Passwords hashed with bcrypt
- JWT tokens expire in 24h
- All passwords must be min 8 characters
- Public keys stored for E2EE

## 📝 TODO

- [ ] File uploads (S3/MinIO)
- [ ] Push notifications (FCM)
- [ ] Group chat management
- [ ] Message encryption verification
- [ ] Rate limiting
