# 🔒 Комплексный аудит Catlover Messenger

**Дата:** January 2025  
**Скоуп:** Web (React/Vite), Backend (Go), Windows (Tauri), Android (Kotlin)  
**Типы аудита:** Безопасность, Качество кода, Производительность, Криптография

---

## 1. 🚨 КРИТИЧЕСКИЕ УЯЗВИМОСТИ

### 1.1 Hardcoded RSA Private Key в Backend
**Файл:** `api/index.go:50-76`
**Severity:** CRITICAL

```go
// HARDCODED PRIVATE KEY - КРИТИЧЕСКАЯ УЯЗВИМОСТЬ
hardcodedPrivKey := `-----BEGIN RSA PRIVATE KEY-----
MIIEogIBAAKCAQEA1QRqJsCvIfU1fWs7KYAPHtbOGUhLadtg2ziH8Nsu+ziPKQ5d...
```

**Проблема:** Приватный ключ JWT захардкожен в исходном коде. Это означает:
- Любой, у кого есть доступ к коду или бинарнику, может подписывать токены
- Компрометация ключа = полная компрометация аутентификации
- Невозможно ротировать ключ без перекомпиляции

**Рекомендация:**
- Убрать хардкод, загружать ключ только из переменных окружения или secure vault
- Реализовать ротацию ключей
- Немедленно отозвать текущий ключ

---

### 1.2 X3DH Использует Неправильный Ключ Для Подписи
**Файл:** `src/crypto/ratchet.ts:55-60`, `src/components/SocialPost.tsx:55-59`

```typescript
// SocialPost.tsx - использует ECDH ключ для верификации ECDSA подписи!
const pubKey = await crypto.importECDHPublicKey(JSON.parse(post.authorPublicKey));
const valid = await crypto.verifyECDSA(data, sig, pubKey);
```

**Проблема:** Код импортирует ECDH публичный ключ и пытается верифицировать им ECDSA подпись. WebCrypto API не позволит это сделать - `verifyECDSA` требует ключ с `usages: ['verify']` и типом ECDSA, не ECDH.

**Рекомендация:**
- Для подписей постов использовать отдельный ECDSA ключ (identity signing key)
- При регистрации генерировать два ключевых пары: ECDH (encryption) + ECDSA (signing)

---

### 1.3 Отсутствует Защита от Replay Атак в WebSocket
**Файл:** `core/websocket/hub.go:112-122`, `src/App.tsx:284`

```go
func (h *Hub) ValidateTicket(ticket string) (uuid.UUID, string, bool) {
    info, ok := h.tickets[ticket]
    if !ok || time.Now().After(info.Expiry) {
        delete(h.tickets, ticket)
        return uuid.Nil, "", false
    }
    delete(h.tickets, ticket) // ✅ Single-use
    return info.UserID, info.Username, true
}
```

Хотя ticket single-use, отсутствует проверка timestamp на стороне клиента для предотвращения replay в пределах окна валидности.

---

### 1.4 CSP в Tauri Слишком Перmissивный
**Файл:** `client-windows/src-tauri/tauri.conf.json:71`

```json
"csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; ..."
```

**Проблемы:**
- `style-src 'unsafe-inline'` - разрешает inline styles, потенциальный XSS вектор
- `connect-src 'self' https: wss:` - разрешает любые https/wss соединения без ограничения доменов

**Рекомендация:**
```json
"csp": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://api.catlover.app wss://ws.catlover.app; img-src 'self' data: blob:; media-src 'self' blob:; object-src 'none'; frame-ancestors 'none';"
```

---

## 2. 🔐 КРИПТОГРАФИЧЕСКИЕ ПРОБЛЕМЫ

### 2.1 Double Ratchet: KDF Root Key Проблема
**Файл:** `src/crypto/ratchet.ts:80-97`

```typescript
async function kdfRootKey(rootKey: Uint8Array, dhOutput: CryptoKey): Promise<{ newRootKey: Uint8Array; chainKey: Uint8Array }> {
  const dhBits = await crypto.subtle.exportKey('raw', dhOutput);
  // ...
  return {
    newRootKey: hash.slice(0, 32),
    chainKey: hash.slice(0, 32), // ⚠️ Одинаковые ключи!
  };
}
```

**Проблема:** `newRootKey` и `chainKey` - одинаковые 32 байта. В Signal Protocol они должны быть разными (используется HKDF с разными info строками).

**Рекомендация:**
```typescript
// Использовать HKDF или разные порции хеша
return {
  newRootKey: hash.slice(0, 32),
  chainKey: hash.slice(32, 64), // Разные байты!
};
```

---

### 2.2 X3DH Реализация Неполная
**Файл:** `src/crypto/ratchet.ts:170-221`

```typescript
// Упрощенный X3DH - использует только один DH вместо трех
const sharedSecret1 = await deriveSharedSecret(ekKeyPair.privateKey, remoteSPK);
let sharedSecret = sharedSecret1;
if (remoteOTK) {
    sharedSecret = await deriveSharedSecret(ekKeyPair.privateKey, remoteOTK);
}
```

**Проблема:** Правильный X3DH требует комбинации трех DH операций:
- DH(IK_A, SPK_B)
- DH(EK_A, IK_B)  
- DH(EK_A, SPK_B)
- DH(EK_A, OTK_B) [optional]

**Риск:** Снижена forward secrecy

---

### 2.3 Отсутствует Проверка Associated Data в AES-GCM
**Файл:** `src/crypto/webcrypto.ts:107-127`

**Проблема:** AES-GCM шифрование не использует `additionalData` (AAD). Это означает отсутствие привязки ciphertext к контексту (session ID, message number).

**Риск:** Potential ciphertext substitution attacks

---

### 2.4 PBKDF2 Без Солти в Функции
**Файл:** `src/crypto/webcrypto.ts:235-265`

```typescript
export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array, // salt передается, но нет валидации
  iterations: number = 600000
): Promise<CryptoKey>
```

**Проблема:** Функция принимает salt как параметр, но нет гарантии что вызывающий код генерирует криптографически случайный salt.

---

## 3. 🛡️ ПРОБЛЕМЫ БЕЗОПАСНОСТИ

### 3.1 localStorage Для Sensitive Data
**Файл:** `src/App.tsx:41,204,221,104`, `src/components/MediaUpload.tsx:103`

```typescript
const [isAppLocked, setIsAppLocked] = useState(!!localStorage.getItem('app_passcode'));
const token = localStorage.getItem('token');
```

**Проблема:**
- Токены и passcode хранятся в localStorage (уязвим для XSS)
- Может быть доступно другим скриптам на странице

**Рекомендация:**
- Использовать `IndexedDB` с шифрованием (как в `storage.ts`)
- Для Windows: использовать `keyring` через Tauri API
- Для Android: использовать Android Keystore

---

### 3.2 URL Содержит Токен
**Файл:** `src/components/MediaUpload.tsx:103`

```typescript
url: `/api/media/${media.id}?token=${localStorage.getItem('token')}`,
```

**Проблема:**
- Токен в query string попадает в логи сервера
- Токен может быть сохранен в browser history

---

### 3.3 Отсутствует Certificate Pinning
**Файл:** `src/App.tsx:200-225`

Хотя в SECURITY_AUDIT_REPORT.md указано "Certificate pinning (Android)", в коде это не реализовано.

---

### 3.4 Trust On First Use (TOFU) Уязвимость
**Файл:** `src/components/ChatView.tsx:92-101`

```typescript
if (!storedKey) {
  // First time seeing this key, trust on first use
  localStorage.setItem(storageKey, contact.publicKey);
} else if (storedKey !== contact.publicKey) {
  // Key mismatch detected!
```

**Проблема:** TOFU уязвим для MITM на первом соединении.

---

### 3.5 Hardcoded Pusher Key
**Файл:** `src/App.tsx:206`

```typescript
const pusher = new Pusher('6c40eb129881d9bb18cf', {
```

**Проблема:** Ключ захардкожен. Хотя это публичный ключ, лучше загружать с сервера.

---

## 4. 📊 ПРОБЛЕМЫ ПРОИЗВОДИТЕЛЬНОСТИ

### 4.1 App.tsx - Огромный Файл (1252 строк)
**Файл:** `src/App.tsx`

**Проблема:** 1252 строки в одном файле. Смешение:
- WebSocket/Pusher логика
- State management
- Push notification subscription
- Service Worker coordination
- Crypto key management

**Риск:** Трудно поддерживать, тестировать, медленная компиляция TypeScript.

---

### 4.2 Race Condition в WebSocket Reconnect
**Файл:** `src/App.tsx:299-306`

```typescript
socket.onclose = (event) => {
  if (event.code !== 1000 && event.code !== 1001) {
    setTimeout(() => {
      const t = localStorage.getItem('token');
      if (t) initWebSocket(t);
    }, 3000);
  }
};
```

**Проблема:** Нет защиты от множественных одновременных реконнектов.

---

### 4.3 Мемори Лик в MediaPreview
**Файл:** `src/components/MediaUpload.tsx:295-321`

```typescript
useState(() => { // ❌ Должен быть useEffect
  if (!media.encryptionKey || !media.iv) return;
  const decrypt = async () => { ... };
  decrypt();
});
```

**Проблема:** Используется `useState` вместо `useEffect`. Это создает новый стейт при каждом рендере и запускает дешифрование синхронно.

---

### 4.4 Нет Cleanup для Object URLs
**Файл:** `src/components/MediaUpload.tsx:312`

```typescript
setDecryptedUrl(URL.createObjectURL(blob));
```

**Проблема:** `URL.createObjectURL` создает мемори лик если не вызвать `URL.revokeObjectURL`.

---

## 5. 📝 ПРОБЛЕМЫ КАЧЕСТВА КОДА

### 5.1 Смешение Концернов в API Routes
**Файл:** `core/api/routes.go` (927 строк)

**Проблема:** В одном файле:
- Telegram webhook
- Auth (register/login/2FA)
- Media upload
- Social features
- Moderation

---

### 5.2 Нет Input Validation в Media Upload
**Файл:** `core/api/media.go` (не показан, но видно по фронтенду)

**Риск:**
- Нет проверки magic bytes для файлов
- Нет ограничения на типы файлов на сервере
- Потенциальный вектор для malicious file upload

---

### 5.3 Git Merge Conflicts в README
**Файл:** `README.md:36-39`

```markdown
<<<<<<< HEAD
---
© 2026 DemonestoriCat Systems. All rights reserved.
=======
```

**Проблема:** Неразрешенный merge conflict.

---

### 5.4 Неиспользуемые Зависимости
**Файл:** `package.json`

```json
"@capacitor-community/contacts": "^7.1.0",
"pusher-js": "^8.5.0",
"qrcode.react": "^4.2.0",
```

**Проблема:** Некоторые зависимости возможно не используются (требуется deeper analysis).

---

## 6. ✅ ПОЛОЖИТЕЛЬНЫЕ НАХОДКИ

### 6.1 Правильное Использование WebCrypto API
**Файл:** `src/crypto/webcrypto.ts`
- ✅ Использует нативный WebCrypto (не JS crypto libraries)
- ✅ P-521 curve для ECDH/ECDSA
- ✅ AES-256-GCM с 128-bit tag
- ✅ PBKDF2 с 600k итераций (OWASP 2024 compliant)

### 6.2 Encrypted IndexedDB Storage
**Файл:** `src/crypto/storage.ts`
- ✅ Приватные ключи шифруются перед сохранением
- ✅ Salt и IV для каждого ключа
- ✅ Audit logging с fingerprinting

### 6.3 WebSocket Ticket System
**Файл:** `core/websocket/hub.go:100-122`
- ✅ Single-use tickets
- ✅ 60-second expiry
- ✅ Thread-safe с mutex

### 6.4 Tauri Keyring Integration
**Файл:** `client-windows/src-tauri/src/desktop.rs:30-40`
- ✅ Использует OS keyring для secure storage
- ✅ Fallback к зашифрованному IndexedDB

---

## 7. 📋 ПРИОРИТИЗИРОВАННЫЙ ПЛАН ИСПРАВЛЕНИЙ

### Немедленно (CRITICAL):
1. **Убрать hardcoded JWT key** - `api/index.go`
2. **Исправить X3DH** - использовать правильную комбинацию DH
3. **Разделить ECDH/ECDSA ключи** - отдельные ключи для шифрования и подписей
4. **Исправить KDF** - rootKey и chainKey должны быть разными

### Высокий Приоритет (HIGH):
5. **Убрать localStorage для токенов** - перейти на secure storage
6. **Исправить MediaPreview** - useEffect + cleanup
7. **Убрать token из URL** - использовать заголовки
8. **Улучшить CSP** - убрать unsafe-inline

### Средний Приоритет (MEDIUM):
9. **Рефакторинг App.tsx** - разделить на модули
10. **Добавить certificate pinning**
11. **Улучшить input validation**
12. **Resolve git conflicts**

---

## 8. 🎯 ОБЩАЯ ОЦЕНКА

| Категория | Оценка | Комментарий |
|-----------|--------|-------------|
| **Криптография** | C+ | Правильные алгоритмы, но ошибки в реализации |
| **Безопасность** | C | Критические проблемы с хранением секретов |
| **Качество кода** | C | Технический долг, требуется рефакторинг |
| **Производительность** | B | Некоторые race conditions и лики |
| **Архитектура** | B | Хорошая структура, но перегруженные файлы |

**Итог:** Система имеет криптографический потенциал, но требует немедленного исправления критических уязвимостей перед production использованием.

---

*Отчет составлен автоматизированным аудитом. Рекомендуется дополнительный ручной аудит критических компонентов.*
