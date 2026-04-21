/**
 * SERVICE WORKER - PWA Support
 * 
 * Features:
 * - Offline support
 * - Encrypted push notifications
 * - Background sync
 * - Cache management
 */

const CACHE_NAME = 'securenet-v3';
const STATIC_CACHE = 'securenet-static-v3';
const DYNAMIC_CACHE = 'securenet-dynamic-v3';

// Files to cache immediately
const STATIC_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// ============================================================================
// INSTALLATION
// ============================================================================

self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static files');
        return cache.addAll(STATIC_FILES);
      })
      .then(() => self.skipWaiting())
  );
});

// ============================================================================
// ACTIVATION
// ============================================================================

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== STATIC_CACHE && key !== DYNAMIC_CACHE) {
              console.log('[SW] Removing old cache:', key);
              return caches.delete(key);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// ============================================================================
// FETCH (Network-first strategy)
// ============================================================================

self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip Vite-specific requests and HMR
  const url = new URL(request.url);
  if (url.search.includes('v=') || url.pathname.includes('@vite') || url.pathname.includes('node_modules')) {
    return;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Only cache successful standard requests
        if (response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, responseClone).catch(() => {});
          });
        }
        return response;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;
        
        // Return a basic fallback for HTML requests if both network and cache fail
        if (request.headers.get('accept')?.includes('text/html')) {
          return caches.match('/');
        }
        
        // Fallback: return a dummy 404 response instead of crashing
        return new Response('Not found', { status: 404, statusText: 'Not Found' });
      })
  );
});

// ============================================================================
// PUSH NOTIFICATIONS (STUB - NOT IMPLEMENTED)
// ============================================================================
// ⚠️ WARNING: This is a STUB implementation!
// Real push notifications require:
// - FCM/APNS backend server
// - VAPID keys for Web Push
// - Backend to send encrypted payloads
// Currently shows placeholder notifications only.

self.addEventListener('push', async (event) => {
  console.log('[SW] Push notification received');
  
  event.waitUntil(
    (async () => {
      try {
        if (!event.data) return;
        const payload = event.data.json();
        
        // Extract data (Go sends it as {title, body, data: {type, chatId}})
        const title = payload.title || '🔒 SecureNet';
        const body = payload.body || 'Новое сообщение';
        const data = payload.data || {};
        
        // Smart Check: Don't show notification if the specific chat is already focused
        const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        const isChatFocused = clientList.some(client => 
          client.focused && 
          client.url.includes(data.chatId) // Simple check if chatId is in URL or handled by app
        );

        if (isChatFocused) {
          console.log('[SW] App is focused on this chat, skipping notification');
          return;
        }

        await self.registration.showNotification(title, {
          body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: data.chatId || 'new-msg',
          renotify: true,
          data: data
        });
      } catch (error) {
        console.error('[SW] Push error:', error);
      }
    })()
  );
});

// ============================================================================
// NOTIFICATION CLICK
// ============================================================================

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked');
  
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If app is already open, focus it
        for (const client of clientList) {
          if (client.url === self.location.origin && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Otherwise, open new window
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});

// ============================================================================
// BACKGROUND SYNC
// ============================================================================

self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);
  
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  }
});

async function syncMessages() {
  try {
    console.log('[SW] Syncing messages...');
    
    // Notify all clients to sync
    const clients = await self.clients.matchAll({ type: 'window' });
    
    for (const client of clients) {
      client.postMessage({
        type: 'SYNC_MESSAGES',
      });
    }
  } catch (error) {
    console.error('[SW] Sync error:', error);
  }
}

// ============================================================================
// MESSAGE HANDLER (from clients)
// ============================================================================

self.addEventListener('message', (event) => {
  console.log('[SW] Message from client:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((keys) => {
        return Promise.all(keys.map((key) => caches.delete(key)));
      })
    );
  }
});

// ============================================================================
// PERIODIC BACKGROUND SYNC (for key rotation)
// ============================================================================

self.addEventListener('periodicsync', (event) => {
  console.log('[SW] Periodic sync triggered:', event.tag);
  
  if (event.tag === 'rotate-keys') {
    event.waitUntil(rotateKeys());
  }
});

async function rotateKeys() {
  try {
    console.log('[SW] Rotating encryption keys...');
    
    const clients = await self.clients.matchAll({ type: 'window' });
    
    for (const client of clients) {
      client.postMessage({
        type: 'ROTATE_KEYS',
      });
    }
  } catch (error) {
    console.error('[SW] Key rotation error:', error);
  }
}

console.log('[SW] Service Worker loaded');
