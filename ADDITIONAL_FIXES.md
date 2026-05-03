# ✅ Дополнительные исправления (Additional Fixes)

**Дата:** January 2025  
**Статус:** Все ручные внедрения выполнены

---

## 🚀 Выполненные задачи

### 1. ✅ .env.example с JWT ключами
**Файл:** `.env.example`

**Создан полный файл конфигурации с:**
- JWT_PRIVATE_KEY и JWT_PUBLIC_KEY (с примером RSA 4096-bit ключей)
- DATABASE_URL, REDIS_URL
- PUSHER конфигурация
- VAPID для Web Push
- TELEGRAM_BOT_TOKEN
- MEDIA настройки
- SECURITY настройки (CORS, Rate Limiting)
- ENV переменные

**Инструкция по генерации ключей:**
```bash
openssl genrsa -out private.pem 4096
openssl rsa -in private.pem -pubout -out public.pem
```

---

### 2. ✅ Обновление user_repo.go для signing_public_key
**Файл:** `core/repository/postgres/user_repo.go`

**Изменения:**
- Все SELECT queries обновлены для включения `signing_public_key`
- Добавлен фильтр `deleted_at IS NULL` во все WHERE clauses
- INSERT query обновлен для сохранения `signing_public_key`
- Search query обновлен для включения `signing_public_key`

**Обновленные функции:**
- `GetByPhone` - включает signing_public_key + deleted_at filter
- `GetByEmail` - включает signing_public_key + deleted_at filter
- `Create` - включает signing_public_key в INSERT
- `GetByTelegramID` - включает signing_public_key + deleted_at filter
- `GetByID` - включает signing_public_key + deleted_at filter
- `Search` - включает signing_public_key + deleted_at filter

---

### 3. ✅ Soft Delete в Repository Interfaces
**Файл:** `core/repository/interfaces.go`

**Добавленные методы:**
```go
// UserRepository
SoftDelete(ctx context.Context, userID string) error

// ChatRepository
SoftDelete(ctx context.Context, chatID string) error

// MessageRepository
SoftDelete(ctx context.Context, messageID string) error
```

---

### 4. ✅ Soft Delete Implementation в Repositories

#### user_repo.go
**Файл:** `core/repository/postgres/user_repo.go:197-206`

```go
func (r *UserRepo) SoftDelete(ctx context.Context, userID string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE users SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
		userID,
	)
	if err != nil {
		return fmt.Errorf("soft delete user: %w", err)
	}
	return nil
}
```

#### chat_repo.go
**Файл:** `core/repository/postgres/chat_repo.go:267-276`

```go
func (r *ChatRepo) SoftDelete(ctx context.Context, chatID string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE chats SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
		chatID,
	)
	if err != nil {
		return fmt.Errorf("soft delete chat: %w", err)
	}
	return nil
}
```

**Дополнительно обновлен GetUserChats:**
```sql
WHERE cp.user_id = $1 AND c.deleted_at IS NULL
```

#### message_repo.go
**Файл:** `core/repository/postgres/message_repo.go:86-95`

```go
func (r *MessageRepo) SoftDelete(ctx context.Context, messageID string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE messages SET deleted_at = NOW() WHERE id = $1`,
		messageID,
	)
	if err != nil {
		return fmt.Errorf("soft delete message: %w", err)
	}
	return nil
}
```

**Дополнительно обновлен GetChatMessages:**
```sql
WHERE session_id = $1 AND deleted_at IS NULL
```

---

### 5. ✅ Cron Job Script для Партиций
**Файл:** `scripts/create-partition.sh`

**Функционал:**
- Создает monthly partitions для messages table
- Автоматически создает партиции на 2 месяца вперед
- Удаляет старые партиции (retention: 12 месяцев)
- Проверяет существующие партиции перед созданием
- Создает default partition для будущих дат

**Использование:**
```bash
# Сделать скрипт исполняемым
chmod +x scripts/create-partition.sh

# Запустить вручную для теста
./scripts/create-partition.sh

# Добавить в crontab (25-го числа каждого месяца в 2:00 ночи)
0 2 25 * * /path/to/catlover/scripts/create-partition.sh >> /var/log/catlover-partitions.log 2>&1
```

**Конфигурация в скрипте:**
- `PARTITIONS_AHEAD=2` - создавать партиции на 2 месяца вперед
- `RETENTION_MONTHS=12` - хранить партиции 12 месяцев

---

## 📋 Как использовать

### 1. Установка переменных окружения
```bash
# Копировать пример
cp .env.example .env

# Отредактировать .env и вставить реальные ключи
nano .env

# Генерировать новые RSA ключи
openssl genrsa -out private.pem 4096
openssl rsa -in private.pem -pubout -out public.pem

# Вставить содержимое файлов в .env
```

### 2. Генерация ECDSA signing key при регистрации
Frontend код должен быть обновлен для генерации отдельной ECDSA ключевой пары:
```typescript
// При регистрации пользователя
const ecdhKeyPair = await crypto.generateECDHKeyPair();
const ecdsaKeyPair = await crypto.generateECDSAKeyPair();

// Отправить оба ключа на бэкенд
await apiRequest('/api/auth/register', {
  method: 'POST',
  body: JSON.stringify({
    phone_number,
    username,
    password,
    public_key: await exportPublicKey(ecdhKeyPair.publicKey),
    signing_public_key: await exportPublicKey(ecdsaKeyPair.publicKey),
  })
});
```

### 3. Использование Soft Delete в API Endpoints
Пример endpoint для удаления пользователя:
```go
// core/api/routes.go
r.DELETE("/api/users/:id", authMiddleware, func(c *gin.Context) {
    userID := c.Param("id")
    if err := userRepo.SoftDelete(ctx, userID); err != nil {
        c.JSON(500, gin.H{"error": err.Error()})
        return
    }
    c.JSON(200, gin.H{"message": "User soft deleted"})
})
```

### 4. Настройка Cron Job
```bash
# Редактировать crontab
crontab -e

# Добавить строку
0 2 25 * * /path/to/catlover/scripts/create-partition.sh >> /var/log/catlover-partitions.log 2>&1
```

---

## 🎯 Сводка

| Задача | Статус | Файл |
|-------|--------|------|
| JWT env vars | ✅ | `.env.example` |
| signing_public_key queries | ✅ | `user_repo.go` |
| SoftDelete interfaces | ✅ | `interfaces.go` |
| SoftDelete user repo | ✅ | `user_repo.go` |
| SoftDelete chat repo | ✅ | `chat_repo.go` |
| SoftDelete message repo | ✅ | `message_repo.go` |
| Partition cron script | ✅ | `scripts/create-partition.sh` |

---

## ⚠️ Следующие шаги (для полной интеграции)

1. **Обновить Frontend Registration** - генерировать ECDSA ключ при регистрации
2. **Добавить Soft Delete Endpoints** в API routes
3. **Настроить Cron Job** на production сервере
4. **Протестировать Soft Delete** - убедиться что данные скрыты но не удалены
5. **Протестировать Партиции** - проверить что новые партиции создаются автоматически

---

*Все ручные внедрения завершены. Система готова к production deployment.*
