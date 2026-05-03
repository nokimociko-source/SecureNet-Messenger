# 🗄️ Аудит Базы Данных Catlover Messenger

**Дата:** January 2025  
**База:** PostgreSQL (Supabase совместимая)  
**Схема:** 26 таблиц, 15+ индексов

---

## 1. 📊 СХЕМА БАЗЫ ДАННЫХ

### 1.1 Список Таблиц

| Таблица | Назначение | Размер (预估) |
|---------|-----------|---------------|
| `users` | Профили, ключи, настройки | 70M+ записей |
| `chats` | Чаты (direct/group/saved) | ~140M записей |
| `chat_participants` | Связь чат-пользователь | ~280M записей |
| `messages` | Зашифрованные сообщения | ~ billions |
| `contacts` | Контакты пользователей | ~350M записей |
| `media` | Метаданные файлов | ~500M записей |
| `devices` | Привязка устройств | ~200M записей |
| `user_prekeys` | X3DH pre-keys | ~700M записей |
| `posts` | Social feed посты | ~70M записей |
| `post_likes` | Лайки постов | ~ billions |
| `post_comments` | Комментарии | ~ billions |
| `subscribers` | Подписки | ~ billions |
| `blocked_users` | Блокировки | ~10M записей |
| `reports` | Жалобы/модерация | ~1M записей |
| `audit_log` | Аудит действий | ~ billions |
| `push_subscriptions` | Web Push подписки | ~140M записей |
| `key_history` | История ключей | ~140M записей |
| `system_configs` | Конфигурация системы | <100 записей |

---

## 2. 🚨 КРИТИЧЕСКИЕ ПРОБЛЕМЫ

### 2.1 ❌ Отсутствует Шифрование Полей БД
**Файл:** `core/db/db.go`, `core/models/models.go`

**Проблема:** Чувствительные данные хранятся в plaintext:
```go
// models.go
Type User struct {
    PhoneNumber  string  // ❌ Не зашифрован
    Email        string  // ❌ Не зашифрован
    PublicKey    string  // ❌ Не зашифрован (хотя это public)
    TotpSecret   string  // ❌ Не зашифрован!
    // ...
}
```

**Риск:**
- Компрометация БД = полная утечка PII (70M+ пользователей)
- TOTP secret в plaintext = обход 2FA

**Рекомендация:**
```go
// Использовать deterministic encryption для searchable fields
PhoneNumberEncrypted  string  // AES-256-GCM с master key
EmailEncrypted        string  
TotpSecretEncrypted   string
```

---

### 2.2 ❌ Отсутствует Row-Level Security (RLS)
**Файл:** `supabase_schema.sql`, `core/db/db.go`

**Проблема:** Нет политик RLS в Supabase.

**Риск:** Если API ключ скомпрометирован - полный доступ ко всем данным.

**Рекомендация:**
```sql
-- Supabase RLS policies
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only see their own messages" ON messages
    FOR SELECT USING (
        session_id IN (
            SELECT chat_id FROM chat_participants WHERE user_id = auth.uid()
        )
    );
```

---

### 2.3 ❌ Нет Soft Delete
**Файл:** Все таблицы

**Проблема:** `ON DELETE CASCADE` используется повсеместно, но нет `deleted_at` колонок.

**Риск:**
- Невозможно восстановить данные
- Нет аудита удаления
- Compliance риски (GDPR/CCPA)

**Рекомендация:**
```sql
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP;
ALTER TABLE messages ADD COLUMN deleted_at TIMESTAMP;
-- Создать view для активных записей
CREATE VIEW active_users AS SELECT * FROM users WHERE deleted_at IS NULL;
```

---

## 3. ⚠️ ПРОБЛЕМЫ ПРОИЗВОДИТЕЛЬНОСТИ

### 3.1 ❌ Отсутствуют Партиции для messages
**Файл:** `core/db/db.go:65-76`

```sql
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES chats(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    -- ...
    timestamp TIMESTAMP DEFAULT NOW()
);
```

**Проблема:** С 70M+ пользователей и средним 100 сообщений/день = **7B сообщений/100 дней**. 

**Риск:**
- Таблица станет неуправляемой (>TB)
- Vacuum/ANALYZE займет часы
- Индексы раздуваются

**Рекомендация:**
```sql
-- Партицирование по дате (monthly)
CREATE TABLE messages (
    id UUID,
    session_id UUID,
    -- ...
    timestamp TIMESTAMP NOT NULL,
    PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

CREATE TABLE messages_2025_01 PARTITION OF messages
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
```

---

### 3.2 ❌ Отсутствует Archive Strategy для audit_log
**Файл:** `core/db/db.go:137-148`

```sql
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    details JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    -- ...
);
```

**Проблема:** Audit log растет бесконтрольно. С 70M users и ~100 действий/день = **7B записей/день**.

**Риск:** БД умрет через несколько недель.

**Рекомендация:**
```sql
-- Separate audit database или TimescaleDB
-- TTL policy для старых записей
-- Compression для старых партиций
```

---

### 3.3 ❌ Медленный Search по users
**Файл:** `core/repository/postgres/user_repo.go:131-136`

```go
func (r *UserRepo) Search(ctx context.Context, query string, limit int) ([]*models.User, error) {
    rows, err := r.db.QueryContext(ctx,
        `SELECT id, phone_number, username, public_key, role, avatar FROM users
         WHERE phone_number ILIKE $1 OR username ILIKE $1 OR email ILIKE $1 LIMIT $2`,
        "%"+query+"%", limit,
    )
```

**Проблема:** 
- `ILIKE '%query%'` не может использовать индекс
- Full table scan на 70M записей

**Рекомендация:**
```sql
-- GIN индекс с pg_trgm
CREATE EXTENSION pg_trgm;
CREATE INDEX idx_users_trgm_search ON users 
    USING gin (phone_number gin_trgm_ops, username gin_trgm_ops);

-- Или Elasticsearch/OpenSearch для поиска
```

---

### 3.4 ❌ N+1 Query в GetUserChats
**Файл:** `core/repository/postgres/chat_repo.go:93-158`

```go
// 1. Get chats (1 query)
rows, err := r.db.QueryContext(ctx, `SELECT c.id...`)
// 2. Get participants for each chat (N queries в цикле!)
participantRows, err := r.db.QueryContext(ctx, `SELECT cp.chat_id...`)
```

**Проблема:** Хотя есть batch query, реализация все еще делает 2 round-trips. При 100 чатах = 2 queries (OK), но при 1000 чатах - проблема.

---

## 4. ✅ ПОЛОЖИТЕЛЬНЫЕ НАХОДКИ

### 4.1 ✅ Prepared Statements / Parameterized Queries
**Файл:** Все repo файлы

```go
// ✅ Хорошо - использует $1, $2 placeholders
r.db.QueryRowContext(ctx,
    `SELECT id, phone_number... FROM users WHERE phone_number = $1`, phone,
)
```

**Защита от SQL Injection:** ✅ Все запросы параметризованы.

---

### 4.2 ✅ Transactions для Complex Operations
**Файл:** `core/repository/postgres/chat_repo.go:28-64`

```go
func (r *ChatRepo) CreateChat(...) {
    tx, err := r.db.BeginTx(ctx, nil)
    defer tx.Rollback()
    // ... insert chat, insert participants
    if err := tx.Commit(); err != nil {
        return "", fmt.Errorf("commit: %w", err)
    }
}
```

---

### 4.3 ✅ Proper Indexing
**Файл:** `core/db/db.go:191-214`

```sql
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_fingerprint ON devices(user_id, fingerprint);
```

---

### 4.4 ✅ Connection Pool Configuration
**Файл:** `core/db/db.go:21-26`

```go
db.SetMaxOpenConns(5)        // Ограничение connections
db.SetMaxIdleConns(2)        // Idle connections
db.SetConnMaxLifetime(5 * time.Minute)  // Connection rotation
```

---

### 4.5 ✅ Repository Pattern / Interface Segregation
**Файл:** `core/repository/interfaces.go`

```go
type UserRepository interface {
    GetByPhone(ctx context.Context, phone string) (*models.User, error)
    GetByEmail(ctx context.Context, email string) (*models.User, error)
    // ...
}
```

Легко мигрировать на Spanner/Bigtable (есть заготовки директорий).

---

## 5. 🔒 GDPR / COMPLIANCE ПРОБЛЕМЫ

| Требование | Статус | Комментарий |
|------------|--------|-------------|
| **Right to be Forgotten** | ❌ | Нет soft delete, cascade delete удаляет безвозвратно |
| **Data Portability** | ⚠️ | Есть `exportAllData()` в frontend, но нет API endpoint |
| **PII Encryption** | ❌ | Phone/email в plaintext |
| **Access Logging** | ✅ | Audit log table есть |
| **Data Minimization** | ⚠️ | UserAgent и IP сохраняются без TTL |

---

## 6. 📋 РЕКОМЕНДАЦИИ ПО МАСШТАБИРОВАНИЮ

### Для 70M+ пользователей:

| Компонент | Текущее | Рекомендуемое |
|-----------|---------|---------------|
| **Database** | Single PostgreSQL | Read replicas + Connection pooling (PgBouncer) |
| **Messages** | Single table | Monthly partitions + Hot/cold storage |
| **Audit Log** | PostgreSQL | TimescaleDB или отдельный ClickHouse |
| **Media** | Local storage | S3/GCS с CDN |
| **Search** | ILIKE | Elasticsearch или Algolia |
| **Cache** | Нет | Redis для online status + last seen |

---

## 7. 🎯 ПРИОРИТЕТЫ ИСПРАВЛЕНИЙ

### 🔴 Критический (Немедленно):
1. **Encrypt PII fields** (phone, email, totp_secret)
2. **Enable RLS** в Supabase
3. **Add soft delete** ко всем таблицам

### 🟡 Высокий (Этот месяц):
4. **Partition messages** по дате
5. **Archive strategy** для audit_log
6. **Fix user search** (pg_trgm или Elasticsearch)

### 🟢 Средний (Следующий квартал):
7. **Add TTL** для device fingerprints (старые устройства)
8. **Data retention policy** для messages
9. **Read replicas** для тяжелых запросов

---

## 8. 📊 ОЦЕНКА

| Категория | Оценка | Комментарий |
|-----------|--------|-------------|
| **Схема** | B | Хорошая нормализация, но не для масштаба |
| **Безопасность** | D | Нет шифрования PII |
| **Производительность** | C | Нет партиций, медленный поиск |
| **Compliance** | C | Нет soft delete, GDPR риски |
| **Масштабируемость** | C | Single DB, нет caching layer |

**Итог:** Схема подойдет для <1M пользователей. Для 70M требуется серьезная переработка (шардинг, партиции, encryption).

---

*Дополнение к основному аудиту: @AUDIT_REPORT.md*
