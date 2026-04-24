import { useState, useEffect, useRef } from 'react';
import { 
  User, Shield, Lock, Camera, ChevronRight, LogOut, ArrowLeft, UserX, 
  Smartphone, KeyRound, Monitor, Globe, CheckCircle2, Trash2, 
  Bell, Eye, Phone, Ghost, Database, Server, SmartphoneNfc,
  ShieldCheck, AlertCircle, Check, Users, Hash, Download, Send
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { subscribeUserToPush, requestNotificationPermission, checkNotificationPermission } from '../utils/push';
import { generateDeviceFingerprint } from '../crypto/device';
import { PasswordChange } from './PasswordChange';
import { TwoFactorSetup } from './TwoFactorSetup';
import PasscodeSetup from './PasscodeSetup';
import { PushNotifications } from '@capacitor/push-notifications';
import { ContactSyncService, SyncedContact } from '../services/ContactSyncService';
import ContactSyncModal from './ContactSyncModal';


const isNative = !!(window as any).__TAURI__ || !!(window as any).Capacitor;

export default function SettingsView({
  currentUser,
  onUpdateUser,
  onUpdatePrivacy,
  onBack,
  onLogout,
  onStartChat,
}: {
  currentUser: any;
  onUpdateUser?: (user: any) => void;
  onUpdatePrivacy?: (key: string, value: string) => void;
  onBack: () => void;
  onLogout: () => void;
  onStartChat?: (user: any) => void;
}) {
  const { apiRequest } = useAuth();
  const [activeTab, setActiveTab] = useState<'main' | 'profile' | 'security' | 'privacy' | 'blocklist' | 'devices' | 'data' | 'password' | '2fa' | 'set_phone' | 'set_lastseen' | 'set_avatar' | 'passcode' | 'usage' | 'notifications' | 'sync_contacts' | 'updates' | 'telegram' | 'server'>('main');
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [isPasscodeActive, setIsPasscodeActive] = useState(!!localStorage.getItem('app_passcode'));
  const [currentFingerprint, setCurrentFingerprint] = useState<string>('');
  const [newUsername, setNewUsername] = useState(currentUser.username);
  const [avatarPreview, setAvatarPreview] = useState(currentUser.avatar);
  
  const [notifSettings, setNotifSettings] = useState({
    private: currentUser.notifPrivate ?? true,
    groups: currentUser.notifGroups ?? true,
    channels: currentUser.notifChannels ?? true,
    badges: currentUser.notifBadges ?? true,
    sounds: currentUser.notifSounds ?? true,
    reactions: currentUser.notifReactions ?? true
  });

  const [dataSettings, setDataSettings] = useState(() => {
    const saved = localStorage.getItem('data_settings');
    return saved ? JSON.parse(saved) : {
      autoDownloadMobile: false,
      autoDownloadWifi: true,
      useProxy: false
    };
  });

  const [syncResults, setSyncResults] = useState<SyncedContact[]>([]);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(true);
  
  const [updateInfo, setUpdateInfo] = useState<{ version: string, notes: string, status: 'idle' | 'checking' | 'found' | 'latest' | 'error' }>({ 
    version: '0.1.0', 
    notes: '', 
    status: 'idle' 
  });

  const syncService = new ContactSyncService(apiRequest);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const checkUpdates = async () => {
    setUpdateInfo(prev => ({ ...prev, status: 'checking' }));
    try {
      // 1. Try GitHub Node first (nokimociko-source)
      const ghResponse = await fetch('https://raw.githubusercontent.com/nokimociko-source/SecureNet-Messenger/master/update.json').catch(() => null);
      
      if (ghResponse && ghResponse.ok) {
        const data = await ghResponse.json();
        if (data.version !== '0.1.0') {
          setUpdateInfo({ version: data.version, notes: data.notes, status: 'found' });
          return;
        }
      }

      // 2. Fallback to our own API (detect platform)
      const platform = navigator.userAgent.toLowerCase().includes('android') ? 'android' : 'windows';
      const apiResponse = await apiRequest(`/updates/latest?platform=${platform}`).catch(() => null);
      if (apiResponse && apiResponse.ok) {
        const data = await apiResponse.json();
        if (data.version !== '0.1.0') {
          setUpdateInfo({ version: data.version, notes: data.release_notes, status: 'found' });
          return;
        }
      }

      setUpdateInfo(prev => ({ ...prev, status: 'latest' }));
    } catch (e) {
      setUpdateInfo(prev => ({ ...prev, status: 'error' }));
      toast.error('Ошибка связи с узлом обновлений');
    }
  };

  useEffect(() => {
    if (activeTab === 'blocklist') loadBlockedUsers();
    if (activeTab === 'devices') {
      loadDevices();
      initFingerprint();
    }
  }, [activeTab]);

  const initFingerprint = async () => {
    const info = await generateDeviceFingerprint();
    setCurrentFingerprint(info.fingerprint);
  };

  const loadBlockedUsers = async () => {
    try {
      const response = await apiRequest('/blocked-users');
      const users = await response.json();
      setBlockedUsers(Array.isArray(users) ? users : []);
    } catch (error) { console.error(error); }
  };

  const loadDevices = async () => {
    try {
      const response = await apiRequest('/devices');
      const data = await response.json();
      if (Array.isArray(data)) setDevices(data);
    } catch (error) { console.error(error); }
  };

  const handleRevokeDevice = async (deviceId: string, isCurrent: boolean) => {
    if (!confirm('Вы уверены, что хотите завершить этот сеанс?')) return;
    try {
      const response = await apiRequest(`/devices/${deviceId}`, { method: 'DELETE' });
      if (response.ok) {
        toast.success('Сеанс завершен');
        if (isCurrent) onLogout();
        else loadDevices();
      }
    } catch (error) { toast.error('Ошибка'); }
  };

  const handleTrustDevice = async (deviceId: string) => {
    try {
      const response = await apiRequest(`/devices/${deviceId}/trust`, { method: 'POST' });
      if (response.ok) {
        toast.success('Устройство теперь доверенное');
        loadDevices();
      }
    } catch (error) { toast.error('Ошибка при подтверждении'); }
  };

  const handleTerminateOthers = async () => {
    const currentDevice = devices.find(d => d.fingerprint === currentFingerprint);
    if (!currentDevice) { toast.error('Ошибка идентификации'); return; }
    if (!confirm('Все остальные сеансы будут завершены. Продолжить?')) return;
    try {
      const response = await apiRequest(`/devices?currentDeviceId=${currentDevice.id}`, { method: 'DELETE' });
      if (response.ok) {
        toast.success('Сеансы завершены');
        loadDevices();
      }
    } catch (error) { toast.error('Ошибка'); }
  };

  const handleUnblockUser = async (userId: string) => {
    try {
      const response = await apiRequest(`/contacts/${userId}/block`, { method: 'DELETE' });
      if (response.ok) {
        toast.success('Пользователь разблокирован');
        loadBlockedUsers();
      } else {
        toast.error('Не удалось разблокировать');
      }
    } catch (error) {
      toast.error('Ошибка при разблокировке');
    }
  };

  const handleSyncContacts = async () => {
    setIsSyncing(true);
    try {
      const matched = await syncService.sync();
      setSyncResults(matched);
      setShowSyncModal(true);
      if (matched.length > 0) {
        ContactSyncService.setAutoSync(true);
      }
    } catch (e) {
      toast.error('Синхронизация не удалась');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleChangePassword = async (current: string, next: string) => {
    try {
      const response = await apiRequest('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: current, newPassword: next })
      });
      return response.ok;
    } catch { return false; }
  };

  const handleUpdatePrivacy = async (key: string, value: string) => {
    if (onUpdatePrivacy) {
      onUpdatePrivacy(key, value);
      return;
    }
    
    try {
      const response = await apiRequest('/auth/privacy', {
        method: 'POST',
        body: JSON.stringify({ [key]: value })
      });
      if (response.ok) {
        toast.success('Настройки обновлены');
        if (onUpdateUser) {
          onUpdateUser({ ...currentUser, [key]: value });
        }
      }
    } catch { toast.error('Ошибка при обновлении'); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error('Файл слишком большой (макс. 2МБ)');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = async () => {
    try {
      const response = await apiRequest('/auth/profile', {
        method: 'POST',
        body: JSON.stringify({ 
          username: newUsername,
          avatar: avatarPreview 
        })
      });
      if (response.ok) {
        toast.success('Профиль обновлен');
        if (onUpdateUser) {
          onUpdateUser({ ...currentUser, username: newUsername, avatar: avatarPreview });
        }
      }
    } catch { toast.error('Ошибка при сохранении'); }
  };

  const updateDataSetting = (key: keyof typeof dataSettings) => {
    const newVal = !dataSettings[key];
    const newSettings = { ...dataSettings, [key]: newVal };
    setDataSettings(newSettings);
    localStorage.setItem('data_settings', JSON.stringify(newSettings));
  };

  const updateNotifSetting = async (key: string) => {
    const fieldMap: Record<string, string> = {
      private: 'notifPrivate',
      groups: 'notifGroups',
      channels: 'notifChannels',
      badges: 'notifBadges',
      sounds: 'notifSounds',
      reactions: 'notifReactions'
    };
    
    const backendKey = fieldMap[key] || key;
    const newVal = !notifSettings[key as keyof typeof notifSettings];
    
    setNotifSettings(prev => ({ ...prev, [key]: newVal }));

    try {
      const response = await apiRequest('/auth/notifications', {
        method: 'POST',
        body: JSON.stringify({ [backendKey]: newVal })
      });
      if (!response.ok) {
        setNotifSettings(prev => ({ ...prev, [key]: !newVal }));
        toast.error('Не удалось сохранить настройку');
      }
    } catch {
      setNotifSettings(prev => ({ ...prev, [key]: !newVal }));
      toast.error('Ошибка сети');
    }
  };

  const handleSetup2FA = async () => {
    try {
      const response = await apiRequest('/auth/2fa/setup', { method: 'POST' });
      if (response.ok) return await response.json();
    } catch { return null; }
  };

  const handleEnable2FA = async (code: string) => {
    try {
      const response = await apiRequest('/auth/2fa/enable', {
        method: 'POST',
        body: JSON.stringify({ code })
      });
      return response.ok;
    } catch { return false; }
  };

  useEffect(() => {
    const checkPush = async () => {
      try {
        const perm = await PushNotifications.checkPermissions();
        setPushEnabled(perm.receive === 'granted');
        setPushSupported(true);
        
        if (perm.receive === 'granted') {
          PushNotifications.addListener('registration', (token) => {
             apiRequest('/auth/push-subscription', {
               method: 'POST',
               body: JSON.stringify({ token: token.value, platform: 'android' })
             });
          });
          PushNotifications.addListener('registrationError', (err) => {
             console.error('Push registration error:', err);
          });
        }
      } catch (e) {
        // Fallback for web
        const permission = await checkNotificationPermission();
        setPushEnabled(permission === 'granted');
        setPushSupported(permission !== 'unsupported');
      }
    };
    checkPush();

    return () => {
      PushNotifications.removeAllListeners();
    };
  }, []);

  const handleEnablePush = async () => {
    try {
      let perm = await PushNotifications.checkPermissions();
      if (perm.receive !== 'granted') {
        perm = await PushNotifications.requestPermissions();
      }
      
      if (perm.receive === 'granted') {
        await PushNotifications.register();
        setPushEnabled(true);
        toast.success('Уведомления включены!');
      } else {
        toast.error('Доступ к уведомлениям запрещен');
      }
    } catch (e) {
      // Fallback for web
      const granted = await requestNotificationPermission();
      if (granted) {
        const sub = await subscribeUserToPush();
        if (sub) {
          setPushEnabled(true);
          toast.success('Уведомления включены!');
        } else {
          toast.error('Ошибка при подписке');
        }
      } else {
        toast.error('Доступ к уведомлениям запрещен');
      }
    }
  };

  const renderAvatar = (size: string = "w-24 h-24", textSize: string = "text-3xl", customUrl?: string) => {
    const url = customUrl || currentUser.avatar;
    if (url) {
      return (
        <div className={`${size} rounded-full overflow-hidden shadow-2xl ring-4 ring-white/10`}>
          <img src={url} alt="Avatar" className="w-full h-full object-cover" />
        </div>
      );
    }
    return (
      <div className={`${size} rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center ${textSize} font-black text-white shadow-2xl ring-4 ring-white/10 uppercase tracking-tighter`}>
        {currentUser.username?.slice(0, 2) || '??'}
      </div>
    );
  };

  const renderHeader = (title: string, showBackToMain = true) => (
    <div className={`flex items-center gap-4 px-6 ${isNative ? 'pt-10' : 'pt-[calc(1.5rem+env(safe-area-inset-top))]'} pb-6 border-b border-white/5 bg-white/2 sticky top-0 backdrop-blur-xl z-20`}>
      <button 
        onClick={showBackToMain ? () => {
          if (activeTab === 'password' || activeTab === '2fa' || activeTab === 'devices' || activeTab === 'passcode') setActiveTab('security');
          else if (activeTab === 'blocklist' || activeTab === 'set_phone' || activeTab === 'set_lastseen' || activeTab === 'set_avatar') setActiveTab('privacy');
          else if (activeTab === 'usage') setActiveTab('data');
          else if (activeTab === 'notifications' || activeTab === 'sync_contacts' || activeTab === 'updates' || activeTab === 'telegram' || activeTab === 'server') setActiveTab('main');
          else setActiveTab('main');
        } : onBack}
        className="p-2 hover:bg-white/10 rounded-full transition-all text-purple-400"
      >
        <ArrowLeft size={24} />
      </button>
      <h2 className="text-xl font-bold text-white tracking-tight">{title}</h2>
    </div>
  );

  const SettingItem = ({ icon: Icon, title, subtitle, onClick, danger = false, rightElement, showChevron = true }: any) => (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 p-4 hover:bg-white/5 transition-all group border-b border-white/5 last:border-0"
    >
      <div className={`p-2 rounded-xl bg-white/5 ${danger ? 'text-rose-400' : 'text-purple-400'} group-hover:scale-110 transition-transform`}>
        {Icon && <Icon size={20} />}
      </div>
      <div className="flex-1 text-left">
        <p className={`font-medium ${danger ? 'text-rose-400' : 'text-white'}`}>{title}</p>
        {subtitle && <p className="text-[11px] text-white/40 font-medium leading-tight">{subtitle}</p>}
      </div>
      {rightElement ? rightElement : (showChevron && <ChevronRight size={18} className="text-white/20 group-hover:text-white/50 transition-colors" />)}
    </button>
  );

  const ToggleSwitch = ({ active, onClick }: { active: boolean, onClick: () => void }) => (
    <div 
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`w-10 h-5 rounded-full transition-all relative cursor-pointer ${active ? 'bg-purple-500' : 'bg-white/10'}`}
    >
      <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${active ? 'left-6 shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'left-1'}`} />
    </div>
  );

  const PrivacySelector = ({ title, current, onSelect }: { title: string, current: string, onSelect: (v: string) => void }) => (
    <div className="space-y-4">
      <SectionTitle>{title}</SectionTitle>
      <div className="bg-white/2 rounded-[28px] border border-white/5 overflow-hidden shadow-xl">
        {[
          { id: 'everybody', label: 'Все' },
          { id: 'contacts', label: 'Мои контакты' },
          { id: 'nobody', label: 'Никто' }
        ].map(opt => (
          <button
            key={opt.id}
            onClick={() => onSelect(opt.id)}
            className="w-full flex items-center justify-between p-5 hover:bg-white/5 transition-all border-b border-white/5 last:border-0"
          >
            <span className="font-bold text-white">{opt.label}</span>
            {current === opt.id && <Check size={20} className="text-purple-400" />}
          </button>
        ))}
      </div>
    </div>
  );

  const SectionTitle = ({ children, className = "" }: any) => (
    <h4 className={`text-[10px] font-black text-purple-400/50 uppercase tracking-[0.2em] px-4 mt-8 mb-3 ${className}`}>{children}</h4>
  );

  const getVisibilityLabel = (v: string) => {
    if (v === 'contacts') return 'Мои контакты';
    if (v === 'nobody') return 'Никто';
    return 'Все';
  };

  if (activeTab === 'main') {
    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in fade-in duration-300 overflow-hidden">
        {renderHeader('Настройки', false)}
        <div className="flex-1 overflow-y-auto custom-scrollbar pb-10">
          <div className="flex flex-col items-center p-10 bg-gradient-to-b from-purple-500/10 to-transparent relative">
            <div className="relative group cursor-pointer" onClick={() => setActiveTab('profile')}>
              {renderAvatar("w-28 h-28", "text-4xl")}
              <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity border-2 border-purple-500/50 scale-95 group-hover:scale-100 transition-transform">
                <Camera size={32} className="text-white" />
              </div>
            </div>
            <h3 className="mt-6 text-3xl font-black text-white tracking-tighter">{currentUser.username}</h3>
            <p className="text-purple-400/60 text-sm font-mono mt-1 font-bold">{currentUser.phone_number}</p>
          </div>
          <div className="max-w-2xl mx-auto w-full px-4 space-y-2">
            <SectionTitle>Аккаунт</SectionTitle>
            <div className="bg-white/2 rounded-[28px] border border-white/5 overflow-hidden shadow-2xl">
              <SettingItem icon={User} title="Мой профиль" subtitle="Имя, био, номер телефона" onClick={() => setActiveTab('profile')} />
              <SettingItem icon={Bell} title="Уведомления и звуки" subtitle="Звуки, наклейки, реакции" onClick={() => setActiveTab('notifications')} />
              <SettingItem icon={Database} title="Данные и память" subtitle="Использование сети, прокси" onClick={() => setActiveTab('data')} />
              <SettingItem icon={Server} title="Сервер API" subtitle={localStorage.getItem('custom_api_url') || 'По умолчанию'} onClick={() => setActiveTab('server')} />
            </div>
            <SectionTitle>Безопасность</SectionTitle>
            <div className="bg-white/2 rounded-[28px] border border-white/5 overflow-hidden shadow-xl">
              <SettingItem icon={Eye} title="Конфиденциальность" subtitle="Видимость номера, время в сети" onClick={() => setActiveTab('privacy')} />
              <SettingItem icon={Users} title="Друзья и контакты" subtitle="Синхронизация с телефонной книгой" onClick={() => setActiveTab('sync_contacts')} />
              <SettingItem icon={Shield} title="Безопасность" subtitle="Код-пароль, 2FA, сеансы" onClick={() => setActiveTab('security')} />
            </div>
            <SectionTitle>Другое</SectionTitle>
            <div className="bg-white/2 rounded-[28px] border border-white/5 overflow-hidden shadow-xl mb-4">
              <SettingItem 
                icon={SmartphoneNfc} 
                title="Обновление системы" 
                subtitle="Проверить наличие новой версии" 
                onClick={() => setActiveTab('updates')} 
              />
              <SettingItem 
                icon={Send} 
                title="Telegram Импорт" 
                subtitle="Перенос стикеров и эмодзи" 
                onClick={() => setActiveTab('telegram')} 
              />
            </div>
            <div className="bg-white/2 rounded-[28px] border border-white/5 overflow-hidden shadow-xl mb-10">
              <SettingItem icon={LogOut} title="Выйти" subtitle="Завершить текущую сессию" danger={true} onClick={onLogout} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'profile') {
    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
        {renderHeader('Мой профиль')}
        <div className="max-w-2xl mx-auto w-full p-6 space-y-8 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col items-center gap-6 py-8">
            <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              {renderAvatar("w-32 h-32", "text-5xl", avatarPreview)}
              <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera size={32} className="text-white" />
              </div>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
            </div>
            <div className="w-full space-y-4">
              <div>
                <label className="text-[10px] font-black text-purple-400/50 uppercase tracking-widest ml-4">Имя пользователя</label>
                <input 
                  type="text" 
                  value={newUsername} 
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full mt-1 p-4 bg-white/5 border border-white/10 rounded-[20px] text-white font-bold focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                />
              </div>
              <button 
                onClick={handleSaveProfile}
                className="w-full py-4 bg-purple-600 hover:bg-purple-500 text-white font-black uppercase tracking-widest rounded-[20px] shadow-lg transition-all active:scale-[0.98]"
              >
                Сохранить изменения
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'security') {
    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
        {renderHeader('Безопасность')}
        <div className="max-w-2xl mx-auto w-full p-6 space-y-8">
          <SectionTitle>Защита доступа</SectionTitle>
          <div className="bg-white/2 rounded-[28px] border border-white/5 overflow-hidden shadow-xl">
            <SettingItem icon={KeyRound} title="Двухэтапная аутентификация" subtitle={currentUser.totp_enabled ? "Включена" : "Выключена"} onClick={() => setActiveTab('2fa')} />
            <SettingItem icon={SmartphoneNfc} title="Код-пароль" subtitle={isPasscodeActive ? "Включен" : "Выключен"} onClick={() => setActiveTab('passcode')} />
            <SettingItem icon={Lock} title="Изменить пароль" subtitle="Обновить пароль аккаунта" onClick={() => setActiveTab('password')} />
          </div>
          <SectionTitle>Сеансы</SectionTitle>
          <div className="bg-white/2 rounded-[28px] border border-white/5 overflow-hidden shadow-xl">
            <SettingItem icon={Smartphone} title="Устройства" subtitle={`${devices.length} активных сеансов`} onClick={() => setActiveTab('devices')} />
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'privacy') {
    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
        {renderHeader('Конфиденциальность')}
        <div className="max-w-2xl mx-auto w-full p-6 space-y-8">
          <SectionTitle>Видимость данных</SectionTitle>
          <div className="bg-white/2 rounded-[28px] border border-white/5 overflow-hidden shadow-xl">
            <SettingItem icon={Phone} title="Номер телефона" subtitle={getVisibilityLabel(currentUser.phoneVisibility)} onClick={() => setActiveTab('set_phone')} />
            <SettingItem icon={Ghost} title="Время захода" subtitle={getVisibilityLabel(currentUser.lastSeenVisibility)} onClick={() => setActiveTab('set_lastseen')} />
            <SettingItem icon={Camera} title="Фотография профиля" subtitle={getVisibilityLabel(currentUser.avatarVisibility)} onClick={() => setActiveTab('set_avatar')} />
          </div>
          <SectionTitle>Пользователи</SectionTitle>
          <div className="bg-white/2 rounded-[28px] border border-white/5 overflow-hidden shadow-xl">
            <SettingItem icon={UserX} title="Черный список" subtitle={`${blockedUsers.length} заблокированных`} onClick={() => setActiveTab('blocklist')} />
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'devices') {
    const otherDevices = devices.filter(d => d.fingerprint !== currentFingerprint);
    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
        {renderHeader('Активные сеансы')}
        <div className="max-w-2xl mx-auto w-full p-6 space-y-8 overflow-y-auto custom-scrollbar">
          <SectionTitle>Текущее устройство</SectionTitle>
          {devices.find(d => d.fingerprint === currentFingerprint) && (
             <div className="p-5 bg-purple-500/10 border border-purple-500/20 rounded-[28px] flex items-center justify-between">
                <div className="flex items-center gap-4">
                   <div className="p-3 bg-purple-500/20 rounded-2xl text-purple-400"><Monitor size={24} /></div>
                   <div>
                      <p className="font-bold text-white">Этот браузер</p>
                      <p className="text-xs text-white/40 font-mono">{currentFingerprint.slice(0, 8)}...</p>
                   </div>
                </div>
                <CheckCircle2 className="text-purple-400" size={24} />
             </div>
          )}
          
          <div className="flex justify-between items-center">
            <SectionTitle className="mt-0">Другие устройства</SectionTitle>
            {otherDevices.length > 0 && (
              <button onClick={handleTerminateOthers} className="text-[10px] font-black text-rose-400 uppercase tracking-widest px-3 py-1 hover:bg-rose-400/10 rounded-lg transition-all">Завершить остальные</button>
            )}
          </div>
          
          <div className="space-y-3">
             {otherDevices.length === 0 ? (
               <div className="py-12 text-center text-white/20 italic text-sm">Других активных устройств нет</div>
             ) : (
               otherDevices.map(device => (
                 <div key={device.id} className="p-5 bg-white/2 border border-white/5 rounded-[28px] flex items-center justify-between group hover:bg-white/5 transition-all">
                    <div className="flex items-center gap-4">
                       <div className={`p-3 rounded-2xl ${device.trusted ? 'bg-purple-500/20 text-purple-400' : 'bg-white/5 text-white/40'}`}>
                          {device.trusted ? <ShieldCheck size={24} /> : <AlertCircle size={24} />}
                       </div>
                       <div>
                          <p className="font-bold text-white">{device.device_name || 'Неизвестное устройство'}</p>
                          <p className="text-xs text-white/30">{device.platform} • {device.ip_address}</p>
                       </div>
                    </div>
                    <div className="flex items-center gap-2">
                       {!device.trusted && (
                          <button 
                            onClick={() => handleTrustDevice(device.id)}
                            className="px-3 py-1 bg-purple-600/20 text-purple-400 text-[10px] font-black uppercase rounded-lg hover:bg-purple-600 hover:text-white transition-all"
                          >
                             Доверять
                          </button>
                       )}
                       <button 
                         onClick={() => handleRevokeDevice(device.id, false)}
                         className="p-3 text-rose-400 hover:bg-rose-400/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                       >
                          <Trash2 size={20} />
                       </button>
                    </div>
                 </div>
               ))
             )}
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'notifications') {
    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
        {renderHeader('Уведомления')}
        <div className="max-w-2xl mx-auto w-full p-6 space-y-8">
           <div className="p-6 bg-white/2 rounded-[32px] border border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                 <div className="p-4 bg-purple-500/20 rounded-2xl text-purple-400"><Bell size={28} /></div>
                 <div>
                    <p className="font-bold text-white text-lg">Push-уведомления</p>
                    <p className="text-sm text-white/40">{pushEnabled ? 'Активны' : 'Выключены'}</p>
                 </div>
              </div>
              <button 
                onClick={handleEnablePush}
                disabled={pushEnabled || !pushSupported}
                className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${pushEnabled ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-purple-600 text-white'}`}
              >
                {pushEnabled ? 'Включено' : 'Включить'}
              </button>
           </div>
           
           <SectionTitle>Чаты</SectionTitle>
           <div className="bg-white/2 rounded-[28px] border border-white/5 overflow-hidden">
              <SettingItem icon={User} title="Личные сообщения" showChevron={false} rightElement={<ToggleSwitch active={notifSettings.private} onClick={() => updateNotifSetting('private')} />} />
              <SettingItem icon={Users} title="Группы" showChevron={false} rightElement={<ToggleSwitch active={notifSettings.groups} onClick={() => updateNotifSetting('groups')} />} />
              <SettingItem icon={Hash} title="Каналы" showChevron={false} rightElement={<ToggleSwitch active={notifSettings.channels} onClick={() => updateNotifSetting('channels')} />} />
           </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'data') {
    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
        {renderHeader('Данные и память')}
        <div className="max-w-2xl mx-auto w-full p-6 space-y-8">
           <SectionTitle>Автозагрузка медиа</SectionTitle>
           <div className="bg-white/2 rounded-[28px] border border-white/5 overflow-hidden shadow-xl">
              <SettingItem icon={Smartphone} title="Через мобильную сеть" showChevron={false} rightElement={<ToggleSwitch active={dataSettings.autoDownloadMobile} onClick={() => updateDataSetting('autoDownloadMobile')} />} />
              <SettingItem icon={Globe} title="Через Wi-Fi" showChevron={false} rightElement={<ToggleSwitch active={dataSettings.autoDownloadWifi} onClick={() => updateDataSetting('autoDownloadWifi')} />} />
           </div>
           
           <SectionTitle>Сервис</SectionTitle>
           <div className="bg-white/2 rounded-[28px] border border-white/5 overflow-hidden shadow-xl">
              <SettingItem icon={Server} title="Использовать прокси" showChevron={false} rightElement={<ToggleSwitch active={dataSettings.useProxy} onClick={() => updateDataSetting('useProxy')} />} />
              <SettingItem icon={Database} title="Использование памяти" onClick={() => setActiveTab('usage')} />
           </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'password') {
    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
        {renderHeader('Изменение пароля')}
        <div className="max-w-md mx-auto w-full p-6">
           <PasswordChange onChangePassword={handleChangePassword} />
        </div>
      </div>
    );
  }

  if (activeTab === '2fa') {
    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
        {renderHeader('2FA Защита')}
        <div className="max-w-md mx-auto w-full p-6">
           <TwoFactorSetup onSetup={handleSetup2FA} onEnable={handleEnable2FA} onClose={() => setActiveTab('security')} />
        </div>
      </div>
    );
  }

  if (activeTab === 'passcode') {
    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
        {renderHeader('Код-пароль')}
        <div className="max-w-md mx-auto w-full p-6 py-12">
           <PasscodeSetup 
              onSave={(code) => {
                 localStorage.setItem('app_passcode', btoa(code));
                 setIsPasscodeActive(true);
                 setActiveTab('security');
                 toast.success('Защита установлена');
              }}
              onClose={() => setActiveTab('security')}
           />
        </div>
      </div>
    );
  }

  if (activeTab === 'blocklist') {
     return (
       <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
         {renderHeader('Черный список')}
         <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
            {blockedUsers.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-white/20 italic py-20">Список пуст</div>
            ) : (
              blockedUsers.map(user => (
                <div key={user.id} className="p-5 bg-white/2 border border-white/5 rounded-[28px] flex items-center justify-between group hover:bg-white/5 transition-all">
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-400 font-bold uppercase">{user.username[0]}</div>
                      <div>
                         <p className="font-bold text-white">{user.username}</p>
                         <p className="text-xs text-white/30">{user.phoneNumber}</p>
                      </div>
                   </div>
                   <button onClick={() => handleUnblockUser(user.id)} className="px-4 py-2 bg-rose-500/10 text-rose-400 text-[10px] font-black uppercase rounded-xl hover:bg-rose-500 hover:text-white transition-all">Разблокировать</button>
                </div>
              ))
            )}
         </div>
       </div>
     );
  }

  if (activeTab === 'set_phone') return (
    <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
      {renderHeader('Номер телефона')}
      <div className="max-w-2xl mx-auto w-full p-6">
        <PrivacySelector title="Кто может видеть мой номер?" current={currentUser.phoneVisibility || 'everybody'} onSelect={(v) => handleUpdatePrivacy('phoneVisibility', v)} />
      </div>
    </div>
  );

  if (activeTab === 'set_lastseen') return (
    <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
      {renderHeader('Время в сети')}
      <div className="max-w-2xl mx-auto w-full p-6">
        <PrivacySelector title="Кто видит время моего захода?" current={currentUser.lastSeenVisibility || 'everybody'} onSelect={(v) => handleUpdatePrivacy('lastSeenVisibility', v)} />
      </div>
    </div>
  );

  if (activeTab === 'set_avatar') return (
    <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
      {renderHeader('Фото профиля')}
      <div className="max-w-2xl mx-auto w-full p-6">
        <PrivacySelector title="Кто может видеть моё фото?" current={currentUser.avatarVisibility || 'everybody'} onSelect={(v) => handleUpdatePrivacy('avatarVisibility', v)} />
      </div>
    </div>
  );

  if (activeTab === 'updates') {
    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-500">
        {renderHeader('Центр обновлений')}
        <div className="max-w-2xl mx-auto w-full p-8 space-y-10 overflow-y-auto custom-scrollbar">
          
          <div className="relative p-1 bg-gradient-to-br from-purple-500/20 via-pink-500/20 to-blue-500/20 rounded-[40px] shadow-2xl overflow-hidden group">
            <div className="absolute inset-0 bg-[#0a0a0a]/80 backdrop-blur-3xl rounded-[40px]" />
            <div className="relative p-10 flex flex-col items-center text-center space-y-6">
              <div className="relative">
                <div className={`absolute inset-0 blur-3xl rounded-full animate-pulse ${updateInfo.status === 'found' ? 'bg-amber-500/20' : 'bg-purple-500/20'}`} />
                <div className="w-24 h-24 bg-white/5 rounded-3xl flex items-center justify-center border border-white/10 relative overflow-hidden group-hover:rotate-3 transition-transform duration-500">
                  <Smartphone size={48} className="text-white z-10" />
                  <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/10 to-transparent" />
                </div>
                <div className={`absolute -bottom-2 -right-2 w-8 h-8 rounded-full border-4 border-[#0a0a0a] flex items-center justify-center ${updateInfo.status === 'found' ? 'bg-amber-500 animate-bounce' : 'bg-green-500'}`}>
                  {updateInfo.status === 'found' ? <AlertCircle size={16} className="text-white" /> : <Check size={16} className="text-white" />}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-3xl font-black text-white tracking-tighter uppercase">
                  {updateInfo.status === 'found' ? 'Доступно обновление' : updateInfo.status === 'checking' ? 'Проверка...' : 'Система актуальна'}
                </h3>
                <p className="text-sm text-white/40 font-medium max-w-sm mx-auto leading-relaxed">
                  {updateInfo.status === 'found' 
                    ? `Найдена новая версия ${updateInfo.version}. Рекомендуется установка.`
                    : 'Ваше приложение использует последнюю стабильную сборку. Целостность подтверждена.'}
                </p>
              </div>

              <div className="flex gap-3">
                <div className="px-4 py-1.5 bg-white/5 rounded-2xl border border-white/5 flex items-center gap-2">
                  <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest">v0.1.0-STABLE</span>
                </div>
                {updateInfo.status === 'found' && (
                   <div className="px-4 py-1.5 bg-amber-500/20 rounded-2xl border border-amber-500/20 flex items-center gap-2">
                     <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">New: {updateInfo.version}</span>
                   </div>
                )}
              </div>
            </div>
          </div>

          {updateInfo.status === 'found' && updateInfo.notes && (
             <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
               <SectionTitle className="mt-0">Список изменений</SectionTitle>
               <div className="bg-amber-500/5 border border-amber-500/10 rounded-[32px] p-6">
                 <p className="text-sm text-white/80 leading-relaxed whitespace-pre-line">{updateInfo.notes}</p>
               </div>
             </div>
          )}

          <div className="space-y-4">
            <SectionTitle className="mt-0">Состав текущей сборки</SectionTitle>
            <div className="bg-white/2 border border-white/5 rounded-[32px] p-6 space-y-4 shadow-xl">
              {[
                { icon: ShieldCheck, title: "Crypto Engine", desc: "Double Ratchet + X3DH Operational" },
                { icon: Ghost, title: "Privacy Layer", desc: "Tor-ready relay headers active" },
                { icon: Database, title: "Storage", desc: "Encrypted IndexedDB sync enabled" }
              ].map((item, i) => (
                <div key={i} className="flex gap-4 p-4 rounded-2xl hover:bg-white/5 transition-colors group">
                  <div className="p-3 bg-purple-500/10 rounded-xl text-purple-400 group-hover:scale-110 transition-transform">
                    <item.icon size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{item.title}</p>
                    <p className="text-xs text-white/40">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white/2 border border-white/5 rounded-[32px] p-6 space-y-6 shadow-xl">
            <div className="flex items-center justify-between px-2">
              <div className="space-y-1">
                <p className="text-sm font-black text-white uppercase tracking-tight">Автоматические обновления</p>
                <p className="text-[11px] text-white/30">Загружать патчи в фоне через GitHub</p>
              </div>
              <ToggleSwitch active={true} onClick={() => {}} />
            </div>
            
            <div className="h-px bg-white/5 mx-2" />

            <button 
              onClick={updateInfo.status === 'found' ? () => window.open('https://github.com/DemonestoriCat/Catlover/releases', '_blank') : checkUpdates}
              disabled={updateInfo.status === 'checking'}
              className={`w-full py-5 text-white font-black uppercase tracking-[0.2em] rounded-2xl shadow-lg transition-all active:scale-[0.98] text-sm flex items-center justify-center gap-3 ${
                updateInfo.status === 'found' 
                ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-500/20' 
                : 'bg-purple-600 hover:bg-purple-500 shadow-purple-500/20'
              }`}
            >
              {updateInfo.status === 'checking' ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : updateInfo.status === 'found' ? (
                <>
                  <Download size={18} />
                  Установить обновление
                </>
              ) : (
                'Проверить сейчас'
              )}
            </button>
          </div>

          <p className="text-center text-[10px] text-white/20 font-medium uppercase tracking-[0.3em]">
            Digital Signature: 0x77A...F92 (Verified Official Node)
          </p>

        </div>
      </div>
    );
  }

  if (activeTab === 'telegram') {
    const linkCode = currentUser.id; // Using User UUID as the link code
    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-500">
        {renderHeader('Telegram Импорт')}
        <div className="max-w-2xl mx-auto w-full p-8 space-y-8 overflow-y-auto custom-scrollbar">
          
          <div className="text-center space-y-4 py-6">
            <div className="w-24 h-24 bg-[#0088cc]/10 rounded-[32px] flex items-center justify-center mx-auto border border-[#0088cc]/20 shadow-2xl">
              <Send size={48} className="text-[#0088cc]" />
            </div>
            <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Импорт стикеров</h3>
            <p className="text-sm text-white/40 font-medium px-8">Перенесите свои любимые стикерпаки и премиум-эмодзи из Telegram в Catlover Messenger за пару кликов.</p>
          </div>

          <div className="bg-white/2 border border-white/5 rounded-[32px] overflow-hidden shadow-xl">
            <div className="p-6 border-b border-white/5 bg-white/2">
              <h4 className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-4">Как это работает?</h4>
              <div className="space-y-6">
                {[
                  { step: 1, text: 'Перейдите в наш Telegram-бот', sub: '@testingo0_bot', action: () => window.open('https://t.me/testingo0_bot', '_blank') },
                  { step: 2, text: 'Привяжите аккаунт', sub: `/start ${linkCode}`, copy: true },
                  { step: 3, text: 'Шлите стикеры!', sub: 'Они появятся в мессенджере автоматически' }
                ].map((item, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-[10px] font-black text-purple-400 shrink-0">{item.step}</div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-bold text-white leading-tight">{item.text}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-white/30 font-mono break-all">{item.sub}</p>
                        {item.copy && (
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(item.sub);
                              toast.success('Скопировано!');
                            }}
                            className="p-1 hover:bg-white/10 rounded transition-all"
                          >
                            <Hash size={12} className="text-purple-400" />
                          </button>
                        )}
                        {item.action && (
                          <button 
                            onClick={item.action}
                            className="text-[10px] font-black text-purple-400 uppercase tracking-widest hover:underline"
                          >
                            Открыть
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="p-6 bg-purple-500/5">
              <p className="text-[10px] text-white/40 text-center uppercase tracking-[0.2em] font-medium leading-relaxed">
                Стикеры сохраняются в вашем облаке и доступны на всех устройствах.
              </p>
            </div>
          </div>

          <div className="bg-rose-500/5 border border-rose-500/10 rounded-2xl p-4 flex gap-4 items-start">
             <AlertCircle className="text-rose-400 shrink-0" size={20} />
             <p className="text-xs text-rose-400/80 leading-relaxed font-medium">
               Мы не получаем доступ к вашему аккаунту Telegram. Бот только принимает файлы, которые вы ему отправляете.
             </p>
          </div>

        </div>
      </div>
    );
  }

  if (activeTab === 'sync_contacts') {
    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
        {renderHeader('Синхронизация')}
        <div className="max-w-md mx-auto w-full p-6 text-center space-y-8 py-20">
          <div className="w-32 h-32 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto border border-purple-500/20 shadow-2xl">
            <Users size={60} className="text-purple-400" strokeWidth={1.5} />
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Найдите друзей</h3>
            <p className="text-sm text-white/40 font-medium px-4">Мы проверим контакты в вашей телефонной книге и найдем тех, кто уже использует Catlover.</p>
          </div>
          <button
            onClick={handleSyncContacts}
            disabled={isSyncing}
            className={`w-full py-5 rounded-[24px] font-black uppercase tracking-[0.2em] transition-all text-sm shadow-xl ${isSyncing ? 'bg-white/10 text-white/20' : 'bg-purple-600 hover:bg-purple-500 text-white active:scale-95'}`}
          >
            {isSyncing ? 'Синхронизация...' : 'Синхронизировать контакты'}
          </button>
          
          <ContactSyncModal 
            isOpen={showSyncModal}
            onClose={() => setShowSyncModal(false)}
            results={syncResults}
            onStartChat={(user) => onStartChat && onStartChat(user)}
          />
        </div>
      </div>
    );
  }

  if (activeTab === 'server') {
    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
        {renderHeader('Настройки сервера')}
        <div className="max-w-2xl mx-auto w-full p-6 space-y-8">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-[24px] p-4 flex gap-4">
            <AlertCircle className="text-amber-500 shrink-0" size={20} />
            <p className="text-xs text-amber-500/80 leading-relaxed">
              Изменение адреса сервера может привести к потере доступа к текущему аккаунту. 
              Используйте это только если вы знаете, что делаете.
            </p>
          </div>
          
          <div className="space-y-4">
            <SectionTitle className="mt-0">Адрес API</SectionTitle>
            <div className="space-y-2">
              <input 
                type="text" 
                placeholder="https://your-server.com/api"
                defaultValue={localStorage.getItem('custom_api_url') || ''}
                id="api-url-input"
                className="w-full p-4 bg-white/5 border border-white/10 rounded-[20px] text-white font-mono text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all"
              />
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    const input = document.getElementById('api-url-input') as HTMLInputElement;
                    const val = input.value.trim();
                    if (val) {
                      localStorage.setItem('custom_api_url', val);
                      toast.success('Сервер обновлен. Перезапустите приложение.');
                      setTimeout(() => window.location.reload(), 1500);
                    }
                  }}
                  className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl transition-all"
                >
                  Сохранить
                </button>
                <button 
                  onClick={() => {
                    localStorage.removeItem('custom_api_url');
                    toast.success('Настройки сброшены');
                    setTimeout(() => window.location.reload(), 1000);
                  }}
                  className="px-4 py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-all"
                >
                  Сброс
                </button>
              </div>
            </div>
            <p className="text-[10px] text-white/30 px-4">
              Пример: https://api.myserver.com/api<br/>
              По умолчанию: /api
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
       {renderHeader('Загрузка...')}
       <div className="flex-1 flex items-center justify-center">
         <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
       </div>
    </div>
  );
}
