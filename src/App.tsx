import { useState, useEffect, useRef } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import * as crypto from './crypto/webcrypto';
import * as storage from './crypto/storage';
import ChatView from './components/ChatView';
import SettingsView from './components/SettingsView';
import AdminPanel from './components/AdminPanel';
import SecurityView from './components/SecurityView';
import { CreateGroupChat } from './components/GroupChat';
import { DeviceManager } from './components/DeviceManager';
import { FeedPage } from './pages/FeedPage';
import ContactsView from './components/ContactsView';
import { Message, User, Session } from './types';
import { useAuth } from './contexts/AuthContext';
import { useI18n } from './contexts/I18nContext';
import { generateDeviceFingerprint, registerDevice, validateDevice } from './crypto/device';
import PasscodeUnlock from './components/PasscodeUnlock';
import ConfirmModal from './components/ConfirmModal';
import CallView from './components/CallView';
import { TwoFactorVerify } from './components/TwoFactorVerify';

// PWA Service Worker registration
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(reg => {
    console.log('✅ Service Worker registered', reg.scope);
  }).catch(err => {
    console.error('❌ Service Worker registration failed:', err);
  });
}

export default function App() {
  const { apiRequest } = useAuth();
  const { t } = useI18n();

  const [isInitialized, setIsInitialized] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<'auth' | 'messenger' | 'settings' | 'security' | 'feed' | 'admin' | 'contacts' | '2fa'>('auth');
  const [temp2FAToken, setTemp2FAToken] = useState<string | null>(null);
  const [isAppLocked, setIsAppLocked] = useState(!!localStorage.getItem('app_passcode'));
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const [contacts, setContacts] = useState<User[]>([]);
  
  const [auditLog, setAuditLog] = useState<storage.AuditLogEntry[]>([]);
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);
  
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showDeviceManager, setShowDeviceManager] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const [callData, setCallData] = useState<{
    isOpen: boolean;
    isIncoming: boolean;
    callType: 'audio' | 'video';
    targetUser: { id: string; username: string; avatar?: string } | null;
  }>({
    isOpen: false,
    isIncoming: false,
    callType: 'audio',
    targetUser: null
  });
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);

  // Helper Functions
  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const initWebSocket = async (token: string) => {
    // Prevent multiple concurrent connection attempts
    if (wsRef.current && (wsRef.current.readyState === WebSocket.CONNECTING || wsRef.current.readyState === WebSocket.OPEN)) {
      return;
    }

    
    // Sync token with Service Worker for media auth
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SET_TOKEN',
        token: localStorage.getItem('token')
      });
    }

    if (wsRef.current) {
      wsRef.current.onclose = null; // Prevent retry on intentional close
      wsRef.current.close();
      wsRef.current = null;
    }
    
    // ✅ SECURITY UPGRADE: Request a One-Time Ticket first
    try {
      const res = await fetch('/ws-ticket', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Ticket failed');
      const { ticket } = await res.json();

      const isNative = !!(window as any).__TAURI__ || !!(window as any).Capacitor;
      const host = isNative ? 'yhiscizk-securenet-messenger.hf.space' : window.location.host;
      const protocol = isNative ? 'wss:' : (window.location.protocol === 'https:' ? 'wss:' : 'ws:');
      
      const socket = new WebSocket(`${protocol}//${host}/ws?ticket=${ticket}`);
      wsRef.current = socket;
    
    socket.onopen = () => { 
      console.log('⚡️ Catlover Connected'); 
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'presence') {
          setOnlineUsers(data.content?.onlineUsers || []);
          return;
        }
        if (data.type === 'message') {
          const msg = data.content;
          setMessages(prev => {
            if (prev.some(p => p.id === msg.id)) return prev;
            const filtered = prev.filter(p => 
              !(p.status === 'sending' && p.content === msg.content && p.senderId === msg.senderId)
            );
            return [...filtered, {
              id: msg.id,
              sessionId: msg.chatId,
              senderId: msg.senderId,
              senderName: msg.username || 'User',
              content: msg.content,
              timestamp: msg.timestamp * 1000,
              type: (msg.type || 'text').trim() as any,
              status: msg.status || 'sent',
              mediaId: msg.mediaId || msg.media_id,
              fileUrl: (msg.mediaId || msg.media_id) 
                ? `/api/media/${msg.mediaId || msg.media_id}` 
                : undefined,
              encrypted: true
            }];
          });
        }

        if (data.type === 'call') {
          const { subType, callType } = data.content;
          if (subType === 'invite') {
            // Find sender name from contacts or sessions
            const senderName = sessions.find(s => s.contactId === data.senderId)?.contactName || 
                              contacts.find(c => c.id === data.senderId)?.username || 
                              'Неизвестный';
            
            setCallData({
              isOpen: true,
              isIncoming: true,
              callType: callType || 'audio',
              targetUser: { id: data.senderId, username: senderName }
            });
          } else {
            // Relay signal to CallView component
            window.dispatchEvent(new CustomEvent('securenet-call-signal', { 
              detail: { ...data.content, senderId: data.senderId } 
            }));
          }
        }
      } catch (e) { console.error('Parse error', e); }
    };
    
    socket.onclose = (event) => {
      // Only retry if it wasn't a clean close from our side
      if (event.code !== 1000 && event.code !== 1001) {
        console.log('🔌 Connection lost, retrying...');
        setTimeout(() => {
          const t = localStorage.getItem('token');
          if (t) initWebSocket(t);
        }, 3000);
      }
    };

    socket.onerror = (err) => {
      // Don't log if it's already closing/closed to avoid clutter during React hot reloads
      if (socket.readyState !== WebSocket.CLOSED && socket.readyState !== WebSocket.CLOSING) {
        console.error('❌ WebSocket Error:', err);
      }
    };
  } catch (err) {
      console.error('❌ Failed to establish secure WebSocket connection:', err);
      // Retry in 5 seconds on ticket failure
      setTimeout(() => {
        const t = localStorage.getItem('token');
        if (t) initWebSocket(t);
      }, 5000);
    }
  };

  const subscribeToPush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      
      // Check if already subscribed
      const existingSub = await registration.pushManager.getSubscription();
      if (existingSub) {
        console.log('ℹ️ Push subscription already exists');
        // Optionally update backend with existing sub
        return;
      }

      if (Notification.permission === 'denied') return;
      if (Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;
      }

      const keyRes = await apiRequest('/auth/vapid-key');
      if (!keyRes.ok) return;
      const { publicKey } = await keyRes.json();
      if (!publicKey) {
        console.warn('⚠️ No VAPID public key received from server');
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      await apiRequest('/auth/push-subscription', {
        method: 'POST',
        body: JSON.stringify(subscription)
      });
      console.log('✅ Push subscription active');
    } catch (e: any) {
      // Don't log as error if it's a known non-critical issue (like AbortError)
      if (e.name === 'AbortError' || e.name === 'NotAllowedError') {
        console.warn('ℹ️ Push subscription skipped:', e.message);
      } else {
        console.error('❌ Push subscription failed:', e);
      }
    }
  };

  const fetchSessions = async () => {
    try {
      const response = await apiRequest('/chats');
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setSessions(data.map((chat: any) => {
            const isGroup = chat.type === 'group';
            const isSaved = chat.type === 'saved';
            let contactId = chat.id;
            let contactName = chat.name || 'Chat';

            if (chat.type === 'direct' && Array.isArray(chat.participants)) {
              const otherUser = chat.participants.find((p: any) => p.userId !== currentUser?.id);
              if (otherUser) {
                contactId = otherUser.userId;
                contactName = otherUser.username;
              }
            } else if (isSaved) {
              contactId = currentUser?.id || chat.id;
              contactName = 'Избранное';
            }

            return {
              id: chat.id,
              contactId: contactId,
              contactName: contactName,
              unreadCount: chat.unreadCount || 0,
              verified: true,
              pinned: isSaved,
              muted: false,
              isGroup: isGroup,
              isBlocked: chat.is_blocked || false,
              lastMessage: chat.last_message,
              lastMessageAt: chat.lastMessageAt,
              participants: chat.participants || []
            };
          }));
        }
      }
    } catch (err) { console.error('Failed to fetch sessions', err); }
  };

  const fetchMessages = async (chatId: string) => {
    try {
      const response = await apiRequest(`/chats/${chatId}/messages`);
      if (response.ok) {
        const data = await response.json();
        const formatted = (Array.isArray(data) ? data : []).map((m: any) => ({
          id: m.id,
          sessionId: chatId,
          senderId: m.sender_id || m.senderId,
          senderName: m.username || m.senderName || 'User',
          content: m.content,
          timestamp: m.timestamp ? m.timestamp * 1000 : Date.now(),
          type: (m.msg_type || m.type || 'text').trim() as any,
          status: m.status || 'sent',
          mediaId: m.mediaId || m.media_id,
          fileUrl: (m.mediaId || m.media_id)                ? `/api/media/${m.mediaId || m.media_id}` 
            : undefined,
          encrypted: true
        }));
        setMessages(formatted.reverse());
      }
    } catch (err) { console.error('Failed to fetch messages', err); }
  };

  const initializeApp = async () => {
    try {
      console.log('🔐 Initializing SecureNet...');
      const storedUser = localStorage.getItem('currentUser');
      const storedToken = localStorage.getItem('token');
      
      if (storedUser && storedToken) {
        const user = JSON.parse(storedUser);
        setCurrentUser(user);
        setCurrentView('messenger');

        initWebSocket(storedToken);
        setTimeout(() => subscribeToPush(), 2000);

        const [localSessions, localContacts, localLogs] = await Promise.all([
          storage.getAllSessions(),
          storage.getAllContacts(),
          storage.getAuditLog()
        ]);

        await fetchSessions();
        
        setSessions(prev => {
          const existingIds = new Set(prev.map(s => s.id));
          const hasSavedFromBackend = prev.some(s => s.contactId === user.id);
          const localMapped = localSessions
            .filter(s => !existingIds.has(s.id) && !(s.contactId === user.id && hasSavedFromBackend))
            .map(s => ({
              id: s.id,
              contactId: s.contactId,
              contactName: localContacts.find(c => c.id === s.contactId)?.name || (s.contactId === user.id ? t('nav.savedMessages') : 'Chat'),
              lastMessage: undefined,
              unreadCount: 0,
              verified: true,
              pinned: s.contactId === user.id,
              muted: false
            }));
          return [...prev, ...localMapped];
        });

        setContacts(localContacts.map(c => ({
          id: c.id,
          name: c.name,
          username: c.name,
          phoneNumber: c.phoneNumber || '',
          publicKey: {} as JsonWebKey,
          online: false,
          lastSeen: c.lastSeen || 0,
          verified: c.verifiedIdentity
        })));
        setAuditLog(localLogs);

        try {
          const deviceInfo = await generateDeviceFingerprint();
          localStorage.setItem('deviceFingerprint', deviceInfo.fingerprint);
          await registerDevice(apiRequest, deviceInfo);
          const valResult = await validateDevice(apiRequest, deviceInfo.fingerprint);
          if (!valResult.trusted) {
            toast.error('Устройство не подтверждено. Проверьте безопасность в настройках.', { duration: 6000 });
          }
        } catch (e) { console.error('❌ Device check failed:', e); }
      }
      setIsInitialized(true);
    } catch (error) {
      console.error('Initialization error:', error);
      setIsInitialized(true);
    }
  };

  const initStartedRef = useRef(false);
  useEffect(() => {
    if (!initStartedRef.current) {
      initStartedRef.current = true;
      initializeApp();
    }
    return () => {
      // Only close if it's actually open to avoid "closed before established" error in console
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (activeSession) {
      fetchMessages(activeSession.id);
    }
  }, [activeSession]);

  const formatTimestamp = (ts: any) => {
    if (!ts) return '';
    const date = new Date(ts);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const handleLogout = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Выход из аккаунта',
      message: 'Вы уверены, что хотите выйти? Вам потребуется пароль для повторного входа.',
      isDestructive: true,
      onConfirm: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('currentUser');
        setCurrentUser(null);
        setCurrentView('auth');
        toast.success('Вы вышли из аккаунта');
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleUpdatePrivacy = async (key: string, value: string) => {
    try {
      const response = await apiRequest('/auth/privacy', {
        method: 'POST',
        body: JSON.stringify({ [key]: value })
      });
      if (response.ok) {
        toast.success('Настройки обновлены');
        if (currentUser) {
          const updatedUser = { ...currentUser, [key]: value };
          setCurrentUser(updatedUser as User);
          localStorage.setItem('currentUser', JSON.stringify(updatedUser));
        }
      }
    } catch { toast.error('Ошибка при обновлении'); }
  };

  const signData = async (data: any): Promise<string> => {
    if (!masterKey) throw new Error('Security vault locked');
    const identity = await storage.getIdentityKeyPair('primary', masterKey);
    if (!identity?.privateKeys?.signing) throw new Error('Signing key not found');
    
    const encoder = new TextEncoder();
    const encoded = encoder.encode(typeof data === 'string' ? data : JSON.stringify(data));
    const signature = await crypto.signECDSA(encoded, identity.privateKeys.signing);
    return crypto.arrayToBase64(signature);
  };

  const { login: contextLogin, verify2FA } = useAuth();

  const handleLogin = async (phone: string, pass: string) => {
    try {
      const result = await contextLogin(phone, pass);
      
      if (result.requires2FA) {
        setTemp2FAToken(result.tempToken || null);
        setCurrentView('2fa');
        return;
      }

      if (result.success) {
        // Derive master key for storage encryption
        const identity = await storage.getIdentityKeyPair();
        if (identity?.keyPair.salt) {
          const salt = crypto.base64ToArray(identity.keyPair.salt);
          const key = await crypto.deriveKeyFromPassword(pass, salt);
          setMasterKey(key);
        }

        const storedUser = localStorage.getItem('currentUser');
        const storedToken = localStorage.getItem('token');
        if (storedUser && storedToken) {
          setCurrentUser(JSON.parse(storedUser));
          initWebSocket(storedToken);
          setCurrentView('messenger');
          fetchSessions();
          toast.success('Вход выполнен!');
        }
      } else {
        toast.error('Ошибка входа');
      }
    } catch (error) { toast.error('Ошибка входа'); }
  };

  const handleVerify2FA = async (code: string) => {
    if (!temp2FAToken) return false;
    const success = await verify2FA(temp2FAToken, code);
    if (success) {
      const storedUser = localStorage.getItem('currentUser');
      const storedToken = localStorage.getItem('token');
      if (storedUser && storedToken) {
        setCurrentUser(JSON.parse(storedUser));
        initWebSocket(storedToken);
        setCurrentView('messenger');
        fetchSessions();
        toast.success('Вход выполнен!');
      }
      return true;
    }
    return false;
  };

  const handleRegister = async (name: string, email: string, phone: string, pass: string) => {
    try {
      const salt = crypto.randomBytes(16);
      const encryptionKey = await crypto.deriveKeyFromPassword(pass, salt);
      
      // 1. Generate long-term Identity Key (IK) - we'll use ECDSA/ECDH P-521
      const idKeyPair = await crypto.generateECDHKeyPair();
      const idPubJwk = await crypto.exportPublicKey(idKeyPair.publicKey);
      
      // 2. Generate a Signed Pre-key (SPK)
      const spkKeyPair = await crypto.generateECDHKeyPair();
      const spkPubJwk = await crypto.exportPublicKey(spkKeyPair.publicKey);
      
      // 3. Generate a batch of One-Time Pre-keys (OTPK) - let's do 50
      const otpkBatch = [];
      const otpkUploadData = [];
      
      for (let i = 0; i < 50; i++) {
        const keyPair = await crypto.generateECDHKeyPair();
        const pubJwk = await crypto.exportPublicKey(keyPair.publicKey);
        otpkBatch.push({ id: i, keyPair });
        otpkUploadData.push({
          keyId: i,
          publicKey: JSON.stringify(pubJwk),
          isSigned: false
        });
      }

      // Store identity and pre-keys locally (encrypted)
      await storage.storeIdentityKeyPair({
        id: 'primary',
        publicKey: JSON.stringify(idPubJwk),
        privateKey: 'ENCRYPTED', 
        privateKeyIv: 'IV',
        signPublicKey: JSON.stringify(idPubJwk),
        signPrivateKey: 'ENCRYPTED',
        signPrivateKeyIv: 'IV',
        salt: crypto.arrayToBase64(salt),
        createdAt: Date.now(),
        lastRotated: Date.now()
      }, encryptionKey, {
        identity: idKeyPair.privateKey,
        signing: idKeyPair.privateKey // Using same ID key for signing in this POC
      });

      // 4. Register User
      const response = await apiRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          phoneNumber: phone,
          email: email,
          username: name,
          password: pass,
          publicKey: JSON.stringify(idPubJwk)
        }),
      });

      if (!response.ok) throw new Error('Registration failed');
      const data = await response.json();
      setMasterKey(encryptionKey);
      
      // 5. Upload Pre-keys
      await apiRequest('/crypto/prekeys', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${data.token}` },
        body: JSON.stringify([
          { keyId: 0, publicKey: JSON.stringify(spkPubJwk), isSigned: true },
          ...otpkUploadData
        ])
      });

      setCurrentUser(data.user);
      localStorage.setItem('currentUser', JSON.stringify(data.user));
      localStorage.setItem('token', data.token);
      initWebSocket(data.token);
      setCurrentView('messenger');
      toast.success('Регистрация успешна! Крипто-ключи сгенерированы.');
    } catch (error) {
      console.error('❌ Registration error:', error);
      toast.error('Ошибка регистрации');
    }
  };

  const sendMessage = async (content: string, sessionId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      toast.error('Нет подключения к серверу');
      return;
    }
    wsRef.current.send(JSON.stringify({
      type: 'message',
      chatId: sessionId,
      content: content,
      msg_type: 'text'
    }));
    setMessages(prev => [...prev, {
      id: Math.random().toString(),
      sessionId: sessionId,
      senderId: currentUser?.id || '',
      senderName: currentUser?.username || 'Me',
      content: content,
      timestamp: Date.now(),
      type: 'text',
      status: 'sending',
      encrypted: true
    }]);
  };

  const sendFile = async (file: File, customType?: string) => {
    if (!activeSession) return;
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('chatId', activeSession.id);
      const response = await fetch(`/api/media/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: formData
      });
      if (!response.ok) throw new Error('Upload failed');
      const media = await response.json();
      let msgType = 'file';
      if (customType) msgType = customType;
      else if (file.type.startsWith('image/')) msgType = 'image';
      else if (file.type.startsWith('audio/')) msgType = 'audio';
      else if (file.type.startsWith('video/')) msgType = 'video';

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'message',
          chatId: activeSession.id,
          content: msgType === 'text' || msgType === 'image' || msgType === 'sticker' ? '' : file.name,
          msg_type: msgType,
          media_id: media.id
        }));
      }
      toast.success('Файл отправлен');
      fetchMessages(activeSession.id);
    } catch (err) {
      console.error('File send error', err);
      toast.error('Ошибка при отправке файла');
    }
  };

  const handleClearHistory = async (chatId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Очистка истории',
      message: 'Это действие удалит все сообщения в этом чате. Отменить его будет невозможно.',
      isDestructive: true,
      onConfirm: async () => {
        try {
          const response = await apiRequest(`/chats/${chatId}/messages`, { method: 'DELETE' });
          if (response.ok) {
            setMessages([]);
            toast.success('История очищена');
          }
        } catch (err) { toast.error('Ошибка при очистке'); }
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleDeleteChat = async (chatId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Удаление чата',
      message: 'Вы уверены? Чат и вся история сообщений будут безвозвратно удалены.',
      isDestructive: true,
      onConfirm: async () => {
        try {
          const response = await apiRequest(`/chats/${chatId}`, { method: 'DELETE' });
          if (response.ok) {
            setSessions(prev => prev.filter(s => s.id !== chatId));
            setActiveSession(null);
            toast.success('Чат удален');
          }
        } catch (err) { toast.error('Ошибка при удалении'); }
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleDeleteMessage = async (messageId: string) => {
    // If it's a temporary local ID (from Math.random()), just remove from state
    if (!messageId.includes('-') && messageId.includes('.')) {
      setMessages(prev => prev.filter(m => m.id !== messageId));
      return;
    }

    try {
      const response = await apiRequest(`/messages/${messageId}`, { method: 'DELETE' });
      if (response.ok) {
        setMessages(prev => prev.filter(m => m.id !== messageId));
        toast.success('Сообщение удалено');
      }
    } catch (err) { toast.error('Ошибка при удалении сообщения'); }
  };

  const handleAddMember = async (contactId: string) => {
    if (!activeSession) return;
    try {
      const response = await apiRequest(`/groups/${activeSession.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId: contactId })
      });
      if (response.ok) {
        toast.success('Участник добавлен');
        fetchSessions();
      }
    } catch (err) { toast.error('Ошибка при добавлении'); }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!activeSession) return;
    try {
      const response = await apiRequest(`/groups/${activeSession.id}/members/${userId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        toast.success('Участник удален');
        fetchSessions();
      }
    } catch (err) { toast.error('Ошибка при удалении'); }
  };

  const handleUpdateGroup = async (name: string) => {
    if (!activeSession) return;
    try {
      const response = await apiRequest(`/groups/${activeSession.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name })
      });
      if (response.ok) {
        toast.success('Группа обновлена');
        fetchSessions();
      }
    } catch (err) { toast.error('Ошибка при обновлении'); }
  };

  const handleLeaveGroup = async () => {
    if (!activeSession) return;
    setConfirmModal({
      isOpen: true,
      title: 'Выход из группы',
      message: 'Вы уверены, что хотите покинуть эту группу?',
      isDestructive: true,
      onConfirm: async () => {
        try {
          const response = await apiRequest(`/groups/${activeSession.id}/leave`, {
            method: 'POST'
          });
          if (response.ok) {
            toast.success('Вы покинули группу');
            setActiveSession(null);
            fetchSessions();
          }
        } catch (err) { toast.error('Ошибка при выходе'); }
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleBlockUser = async (contactId: string, isBlocked: boolean) => {
    try {
      const method = isBlocked ? 'DELETE' : 'POST';
      const response = await apiRequest(`/contacts/${contactId}/block`, {
        method
      });
      if (response.ok) {
        toast.success(isBlocked ? 'Пользователь разблокирован' : 'Пользователь заблокирован');
        fetchSessions(); // Refresh sessions to update UI
      }
    } catch (err) { toast.error('Ошибка при изменении блокировки'); }
  };

  const handleCall = () => {
    if (!activeSession) return;
    setCallData({
      isOpen: true,
      isIncoming: false,
      callType: 'audio',
      targetUser: { id: activeSession.contactId, username: activeSession.contactName }
    });
  };

  const handleVideoCall = () => {
    if (!activeSession) return;
    setCallData({
      isOpen: true,
      isIncoming: false,
      callType: 'video',
      targetUser: { id: activeSession.contactId, username: activeSession.contactName }
    });
  };

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-[#0f0a1e] flex items-center justify-center">
        <div className="text-center animate-pulse">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-purple-300 font-bold tracking-widest text-xs uppercase">Catlover Secure</div>
        </div>
      </div>
    );
  }

  if (currentView === '2fa') return <TwoFactorVerify onVerify={handleVerify2FA} onCancel={() => setCurrentView('auth')} />;

  if (currentView === 'auth') return <AuthView onRegister={handleRegister} onLogin={handleLogin} />;

  return (
    <div className="h-screen flex bg-[#0f0a1e] text-white overflow-hidden selection:bg-purple-500/30">
      {isAppLocked && <PasscodeUnlock hashedPasscode={localStorage.getItem('app_passcode') || ''} onUnlock={() => setIsAppLocked(false)} />}
      <Toaster position="top-right" />
      <div className={`w-full sm:w-[350px] lg:w-[400px] flex-shrink-0 border-r border-white/5 flex flex-col ${activeSession ? 'hidden sm:flex' : 'flex'}`}>
        <div className="glass px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-600 to-pink-600 flex items-center justify-center font-bold shadow-lg shadow-purple-900/40">C</div>
            <h1 className="font-bold text-xl tracking-tight">Catlover</h1>
          </div>
          <div className="flex items-center gap-2">
            {(currentUser?.role === 'admin') && (
              <button onClick={() => setCurrentView('admin')} className="p-2 hover:bg-purple-500/20 text-purple-400 rounded-full transition-all" title="Админ-панель">
                 <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </button>
            )}
            <button onClick={() => setCurrentView('settings')} className="p-2 hover:bg-white/10 rounded-full transition-colors">
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
           {sessions.map(session => (
             <div
               key={session.id}
               onClick={() => { setActiveSession(session); setCurrentView('messenger'); }}
               className={`flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all animate-message ${activeSession?.id === session.id ? 'bg-purple-600 shadow-xl' : 'hover:bg-white/5'}`}
             >
               <div className="relative flex-shrink-0">
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold ${activeSession?.id === session.id ? 'bg-white/20' : 'bg-gradient-to-tr from-indigo-500 to-purple-500 shadow-lg'}`}>
                    {session.contactId === currentUser?.id ? '🔖' : (session.contactName?.[0] || '?')}
                  </div>
                  {/* Online Indicator: Only for private chats and if user is in onlineUsers */}
                  {!session.isGroup && (session.contactId === currentUser?.id || onlineUsers.includes(session.contactId)) && (
                    <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 border-4 border-[#0f0a1e] rounded-full shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                  )}
               </div>
               <div className="flex-1 min-w-0">
                 <div className="flex items-center justify-between mb-1">
                   <span className="font-bold truncate text-[16px]">{session.contactId === currentUser?.id ? 'Избранное' : session.contactName}</span>
                   <span className="text-[11px] opacity-40">{formatTimestamp(session.lastMessageAt || session.lastMessage?.timestamp)}</span>
                 </div>
                 <p className="text-sm truncate opacity-50">{session.lastMessage?.content || (session.contactId === currentUser?.id ? 'Личные заметки' : 'Начните общение')}</p>
               </div>
             </div>
           ))}
        </div>
        <div className="glass p-4 flex justify-around">
           <button onClick={() => setCurrentView('messenger')} className={`p-2 transition-all ${currentView === 'messenger' ? 'text-purple-400 scale-110' : 'text-white/40 hover:text-white'}`}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
           </button>
           <button onClick={() => setCurrentView('contacts')} className={`p-2 transition-all ${currentView === 'contacts' ? 'text-purple-400 scale-110' : 'text-white/40 hover:text-white'}`}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
           </button>
           <button onClick={() => setCurrentView('feed')} className={`p-2 transition-all ${currentView === 'feed' ? 'text-purple-400 scale-110' : 'text-white/40 hover:text-white'}`}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
           </button>
        </div>
      </div>
      <div className="flex-1 relative flex flex-col bg-[#0f0a1e]">
        {currentView === 'messenger' && activeSession && (
          <ChatView 
            session={activeSession} 
            messages={messages} 
            currentUser={currentUser!} 
            contacts={contacts}
            onSend={(content) => sendMessage(content, activeSession.id)} 
            onSendFile={sendFile} 
            onClearHistory={() => handleClearHistory(activeSession.id)}
            onDeleteChat={() => handleDeleteChat(activeSession.id)}
            onDeleteMessage={handleDeleteMessage}
            onAddMember={handleAddMember}
            onRemoveMember={handleRemoveMember}
            onUpdateGroup={handleUpdateGroup}
            onLeaveGroup={handleLeaveGroup}
            onBlockUser={handleBlockUser}
            onBack={() => setActiveSession(null)} 
            onCall={handleCall}
            onVideoCall={handleVideoCall}
          />
        )}

        {callData.isOpen && callData.targetUser && (
          <CallView 
            isOpen={callData.isOpen}
            isIncoming={callData.isIncoming}
            callType={callData.callType}
            targetUser={callData.targetUser}
            ws={wsRef.current}
            onClose={() => setCallData(prev => ({ ...prev, isOpen: false }))}
          />
        )}
        {currentView === 'messenger' && !activeSession && (
          <div className="flex-1 flex items-center justify-center flex-col text-white/10 select-none">
             <div className="w-40 h-40 mb-8 glass rounded-full flex items-center justify-center"><svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
             <p className="text-sm font-bold tracking-[0.3em] uppercase opacity-30">Выберите чат</p>
          </div>
        )}
        {currentView === 'settings' && (
          <SettingsView 
            currentUser={currentUser!} 
            onUpdateUser={setCurrentUser} 
            onBack={() => setCurrentView('messenger')} 
            onLogout={handleLogout} 
            onUpdatePrivacy={handleUpdatePrivacy}
            onStartChat={(user) => {
              const existing = sessions.find(s => s.contactId === user.id);
              if (existing) setActiveSession(existing);
              else {
                setActiveSession({
                  id: `temp-${user.id}`,
                  contactId: user.id,
                  contactName: user.username,
                  unreadCount: 0,
                  muted: false,
                  pinned: false,
                  verified: true,
                  lastMessage: {
                    id: `msg-temp-${user.id}`,
                    sessionId: `temp-${user.id}`,
                    senderId: user.id,
                    content: 'Начните общение',
                    timestamp: Date.now() / 1000,
                    type: 'text',
                    status: 'sent',
                    encrypted: true
                  }
                });
              }
              setCurrentView('messenger');
            }}
          />
        )}
        {currentView === 'admin' && <AdminPanel onBack={() => setCurrentView('messenger')} />}
        {currentView === 'security' && <SecurityView auditLog={auditLog} onBack={() => setCurrentView('messenger')} />}
        {currentView === 'feed' && <div className="flex-1 overflow-y-auto"><FeedPage currentUser={currentUser!} contacts={contacts} onSign={signData} /></div>}
        {currentView === 'contacts' && (
          <ContactsView 
            contacts={contacts} 
            onStartChat={(user) => {
              // Find or create session
              const existing = sessions.find(s => s.contactId === user.id);
              if (existing) {
                setActiveSession(existing);
              } else {
                // Temporary session or trigger backend chat creation
                setActiveSession({
                  id: `temp-${user.id}`,
                  contactId: user.id,
                  contactName: user.username,
                  unreadCount: 0,
                  muted: false,
                  pinned: false,
                  verified: true,
                  lastMessage: { 
                    id: `msg-temp-${user.id}`,
                    sessionId: `temp-${user.id}`,
                    senderId: user.id,
                    content: 'Начните общение', 
                    timestamp: Date.now() / 1000,
                    type: 'text',
                    status: 'sent',
                    encrypted: true
                  }
                });
              }
              setCurrentView('messenger');
            }} 
            onCreateGroup={() => setShowCreateGroup(true)}
          />
        )}
      </div>
      {showCreateGroup && <CreateGroupChat apiRequest={apiRequest} contacts={contacts.map(c => ({ id: c.id, name: c.name, phoneNumber: c.phoneNumber }))} onGroupCreated={() => setShowCreateGroup(false)} onClose={() => setShowCreateGroup(false)} />}
      {showDeviceManager && <DeviceManager apiRequest={apiRequest} onClose={() => setShowDeviceManager(false)} />}
      <ConfirmModal 
        {...confirmModal} 
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} 
      />
    </div>
  );
}

function AuthView({ onRegister, onLogin }: { onRegister: (name: string, email: string, phone: string, password: string) => void; onLogin: (phone: string, password: string) => void; }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  return (
    <div className="min-h-screen bg-[#0f0a1e] flex items-center justify-center p-4">
      <div className="glass p-10 max-w-md w-full rounded-[40px] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-pink-500"></div>
        <div className="text-center mb-10"><h1 className="text-4xl font-black text-white mb-3 tracking-tight">Catlover</h1><p className="text-purple-300/60 text-sm font-medium">Безопасность превыше всего 🐾</p></div>
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (mode === 'register') onRegister(name, email, phone, password); else onLogin(phone, password); }}>
          {mode === 'register' && (
            <>
              <input type="text" autoComplete="name" placeholder={t('auth.name')} value={name} onChange={(e) => setName(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/20 focus:ring-2 focus:ring-purple-500 outline-none transition-all" required />
              <input type="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/20 focus:ring-2 focus:ring-purple-500 outline-none transition-all" required />
            </>
          )}
          <input type="tel" autoComplete="username" placeholder={t('auth.phone')} value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/20 focus:ring-2 focus:ring-purple-500 outline-none transition-all" required />
          <div className="relative">
            <input 
              type={showPassword ? "text" : "password"} 
              autoComplete={mode === 'login' ? "current-password" : "new-password"} 
              placeholder={t('auth.password')} 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              className="w-full px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/20 focus:ring-2 focus:ring-purple-500 outline-none transition-all" 
              required 
            />
            <button 
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-12 top-1/2 -translate-y-1/2 p-2 text-purple-400 hover:text-white transition-colors z-10"
            >
              {showPassword ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              )}
            </button>
          </div>
          <button type="submit" className="w-full py-5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black rounded-2xl transition-all shadow-xl active:scale-95 text-lg">{mode === 'login' ? 'Войти' : 'Создать аккаунт'}</button>
        </form>
        <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')} className="w-full mt-8 text-sm font-bold text-purple-400 hover:text-white transition-colors">{mode === 'login' ? t('auth.needAccount') : t('auth.haveAccount')}</button>
      </div>
    </div>
  );
}
