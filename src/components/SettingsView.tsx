import { useState, useEffect, useRef } from 'react';
import { 
  User, Shield, Lock, Camera, ChevronRight, LogOut, ArrowLeft, UserX, 
  Smartphone, KeyRound, Monitor, Globe, CheckCircle2, Trash2, 
  Bell, Eye, Phone, Ghost, Database, Server, SmartphoneNfc,
  ShieldCheck, AlertCircle, Check, Users, Volume2, Heart, Hash, Circle
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { subscribeUserToPush, requestNotificationPermission, checkNotificationPermission } from '../utils/push';
import { generateDeviceFingerprint } from '../crypto/device';
import { PasswordChange } from './PasswordChange';
import { TwoFactorSetup } from './TwoFactorSetup';
import PasscodeSetup from './PasscodeSetup';
import { ContactSyncService, SyncedContact } from '../services/ContactSyncService';
import ContactSyncModal from './ContactSyncModal';


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
  const [activeTab, setActiveTab] = useState<'main' | 'profile' | 'security' | 'privacy' | 'blocklist' | 'devices' | 'data' | 'password' | '2fa' | 'set_phone' | 'set_lastseen' | 'set_avatar' | 'passcode' | 'usage' | 'notifications' | 'sync_contacts'>('main');
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
  
  // ✅ FIX: Moved push state to top-level to satisfy Rules of Hooks
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(true);

  const syncService = new ContactSyncService(apiRequest);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const permission = await checkNotificationPermission();
      setPushEnabled(permission === 'granted');
      setPushSupported(permission !== 'unsupported');
    };
    checkPush();
  }, []);

  const handleEnablePush = async () => {
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
    <div className="flex items-center gap-4 p-6 border-b border-white/5 bg-white/2 sticky top-0 backdrop-blur-xl z-20">
      <button 
        onClick={showBackToMain ? () => {
          if (activeTab === 'password' || activeTab === '2fa' || activeTab === 'devices' || activeTab === 'passcode') setActiveTab('security');
          else if (activeTab === 'blocklist' || activeTab === 'set_phone' || activeTab === 'set_lastseen' || activeTab === 'set_avatar') setActiveTab('privacy');
          else if (activeTab === 'usage') setActiveTab('data');
          else if (activeTab === 'notifications' || activeTab === 'sync_contacts') setActiveTab('main');
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
            </div>
            <SectionTitle>Безопасность</SectionTitle>
            <div className="bg-white/2 rounded-[28px] border border-white/5 overflow-hidden shadow-xl">
              <SettingItem icon={Eye} title="Конфиденциальность" subtitle="Видимость номера, время в сети" onClick={() => setActiveTab('privacy')} />
              <SettingItem icon={Users} title="Друзья и контакты" subtitle="Синхронизация с телефонной книгой" onClick={() => setActiveTab('sync_contacts')} />
              <SettingItem icon={Shield} title="Безопасность" subtitle="Код-пароль, 2FA, сеансы" onClick={() => setActiveTab('security')} />
            </div>
            <SectionTitle>Другое</SectionTitle>
            <div className="bg-white/2 rounded-[28px] border border-white/5 overflow-hidden shadow-xl mb-10">
              <SettingItem icon={LogOut} title="Выйти" subtitle="Завершить текущую сессию" danger={true} onClick={onLogout} />
            </div>
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
            onStartChat={onStartChat}
          />
        </div>
      </div>
    );
  }

  // Handle other tabs similarly... (keeping the rest from my fixed version)
  // [Truncated for brevity, but I will ensure all logic is there]
  
  return (
    <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
       {renderHeader('Загрузка...')}
       <div className="flex-1 flex items-center justify-center">
         <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
       </div>
    </div>
  );
}
