# 📋 План Реализации SecureNet (До Продакшена)

## 🎯 Статус Проекта

**Текущее состояние:** Локальный демо-режим с полным UI и криптографией
**Следующий шаг:** Интеграция Frontend ↔ Backend

---

## ✅ Готово (Без Интернета)

### Frontend (React 19 + TypeScript)
- [x] Полный UI/UX дизайн (Tailwind CSS)
- [x] 11 рабочих компонентов
- [x] PWA (Service Worker + Manifest)
- [x] Реальная криптография (RSA, ECDH, AES, ECDSA)
- [x] E2EE шифрование сообщений
- [x] IndexedDB хранилище
- [x] Локальная регистрация/логин
- [x] Локальные чаты
- [x] Все настройки безопасности (UI)

### Backend (Go) - Создан
- [x] Структура проекта
- [x] WebSocket hub
- [x] REST API endpoints
- [x] JWT аутентификация
- [x] PostgreSQL миграции
- [x] Модели данных

---

## 🔴 Критично (Блокирует Запуск)

### 1. Интеграция WebSocket Messaging
**Файлы:** `backend/internal/websocket/client.go`, `src/App.tsx`

```go
// СЕЙЧАС (backend/internal/websocket/client.go:140)
func handleChatMessage(c *Client, db *sql.DB, msg map[string]interface{}) {
    // ПУСТО - не сохраняет в БД!
}

// НУЖНО:
func handleChatMessage(c *Client, db *sql.DB, msg map[string]interface{}) {
    // 1. Сохранить в PostgreSQL
    // 2. Отправить получателю через WebSocket
    // 3. Обновить статус сообщения
}
```

**Время:** 4 часа

### 2. Frontend WebSocket Client
**Файл:** `src/App.tsx`

```typescript
// СЕЙЧАС:
const sendMessage = async () => {
  await storage.storeMessage(newMessage); // Только локально!
}

// НУЖНО:
const sendMessage = async () => {
  wsClient.send(JSON.stringify({
    type: 'message',
    chatId: activeChat.id,
    content: encryptedContent
  }));
}
```

**Время:** 3 часа

### 3. Реальная Аутентификация
**Файл:** `src/contexts/AuthContext.tsx`

```typescript
// СЕЙЧАС:
login: async () => { /* mock */ }
register: async () => { /* mock */ }

// НУЖНО:
login: async (phone, password) => {
  const res = await fetch('/api/auth/login', {...});
  const { token, user } = await res.json();
  localStorage.setItem('jwt', token);
}
```

**Время:** 3 часа

---

## 🟡 Важно (Для Удобства)

### 4. Поиск и Добавление Контактов
**API:** `GET /api/users/search` (готов)
**Frontend:** Интеграция поиска

```typescript
// Добавить в ContactsPanel:
const searchUsers = async (query: string) => {
  const res = await fetch(`/api/users/search?q=${query}`);
  return res.json();
}
```

**Время:** 2 часа

### 5. Синхронизация Контактов
- Загрузка контактов с сервера при логине
- Обновление онлайн-статуса через WebSocket

**Время:** 2 часа

### 6. История Сообщений
- Загрузка сообщений при открытии чата
- Пагинация (lazy loading)

**Время:** 2 часа

---

## 🟢 Желательно (Полироль)

### 7. Push Уведомления (FCM)
- Firebase Cloud Messaging
- Service Worker для background
- Шифрование push payload

**Время:** 4 часа

### 8. Загрузка Файлов
- S3/MinIO backend endpoint
- Шифрование перед загрузкой
- Chunk upload для больших файлов

**Время:** 4 часа

### 9. Групповые Чаты
- API создания групп
- Управление участниками
- Админ права

**Время:** 6 часов

### 10. Оптимизация
- Виртуализация списков
- Image lazy loading
- Bundle size optimization

**Время:** 4 часа

---

## 📊 Оценка Времени

| Этап | Время | Приоритет |
|------|-------|-----------|
| **Критично** | 10 часов | 🔴 Блокирует |
| **Важно** | 6 часов | 🟡 Удобство |
| **Желательно** | 18 часов | 🟢 Полироль |
| **ИТОГО** | **34 часа** | (~1 неделя) |

---

## 🚀 Быстрый Старт (Минимум)

Для запуска MVP достаточно:

1. **WebSocket Messaging** (4ч)
2. **Frontend WebSocket** (3ч)
3. **Auth Integration** (3ч)

**Минимум: 10 часов**

После этого мессенджер будет работать с реальными сообщениями через сервер!

---

## 📝 Порядок Действий

### Неделя 1: Ядро
- [ ] День 1-2: WebSocket messaging (backend + frontend)
- [ ] День 3: Auth integration
- [ ] День 4: Contacts sync
- [ ] День 5: Testing & Debug

### Неделя 2: Фичи
- [ ] История сообщений
- [ ] Push notifications
- [ ] File uploads
- [ ] Polish & Optimize

---

## 🎉 Результат

После выполнения плана:
- ✅ Рабочий E2EE мессенджер
- ✅ Реальная отправка сообщений
- ✅ Backend PostgreSQL + WebSocket
- ✅ Push уведомления
- ✅ Готов к деплою

---

## 💡 Заметки

- Backend уже создан и ждет интеграции
- Все криптографические функции работают
- UI полностью готов
- Нужна только "склейка" frontend ↔ backend

**Стартовать с критичных задач (🔴) — они разблокируют всё остальное!**
