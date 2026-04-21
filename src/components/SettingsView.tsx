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
    
    // Optimistic UI update
    setNotifSettings(prev => ({ ...prev, [key]: newVal }));

    try {
      const response = await apiRequest('/auth/notifications', {
        method: 'POST',
        body: JSON.stringify({ [backendKey]: newVal })
      });
      if (response.ok) {
        toast.success('Настройка сохранена');
      } else {
        // Rollback on error
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
      <p className="px-6 text-[11px] text-white/20 font-medium italic">
        Эта настройка определяет, кто сможет видеть данную информацию в вашем профиле.
      </p>
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

  if (activeTab === 'security') {
    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
        {renderHeader('Безопасность')}
        <div className="max-w-2xl mx-auto w-full p-6 overflow-y-auto custom-scrollbar">
          <SectionTitle>Защита доступа</SectionTitle>
          <div className="bg-white/2 rounded-[28px] border border-white/5 overflow-hidden shadow-xl mb-6">
            <SettingItem icon={KeyRound} title="Двухэтапная аутентификация" subtitle={currentUser.totp_enabled ? "Активирована" : "Настроить защиту"} onClick={() => setActiveTab('2fa')} />
            <SettingItem icon={SmartphoneNfc} title="Код-пароль" subtitle={isPasscodeActive ? "Включен" : "Выключен"} onClick={() => setActiveTab('passcode')} />
            <SettingItem icon={Lock} title="Изменить пароль" subtitle="Безопасность аккаунта" onClick={() => setActiveTab('password')} />
          </div>
          <SectionTitle>Сеансы</SectionTitle>
          <div className="bg-white/2 rounded-[28px] border border-white/5 overflow-hidden shadow-xl mb-6">
            <SettingItem icon={Smartphone} title="Активные устройства" subtitle="Управление сессиями и отпечатками" onClick={() => setActiveTab('devices')} />
          </div>
          <SectionTitle>Автоматизация</SectionTitle>
          <div className="bg-white/2 rounded-[28px] border border-white/5 overflow-hidden shadow-xl">
            <SettingItem icon={Trash2} title="Удалить аккаунт" subtitle="Если я не захожу: 6 месяцев" danger={true} onClick={() => toast('Настройка автоудаления')} />
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'password') {
    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
        {renderHeader('Смена пароля')}
        <div className="max-w-md mx-auto w-full p-6">
          <PasswordChange onChangePassword={handleChangePassword} />
        </div>
      </div>
    );
  }

  if (activeTab === 'passcode') {
    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
        {renderHeader('Код-пароль')}
        <div className="max-w-md mx-auto w-full p-6 py-12">
          {isPasscodeActive ? (
            <div className="space-y-6">
              <div className="bg-rose-500/10 border border-rose-500/20 p-6 rounded-[32px] text-center">
                <p className="text-rose-400 font-bold mb-4">Код-пароль активен</p>
                <button 
                  onClick={() => {
                    localStorage.removeItem('app_passcode');
                    setIsPasscodeActive(false);
                    toast.success('Код-пароль отключен');
                    setActiveTab('security');
                  }}
                  className="w-full py-4 bg-rose-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px]"
                >
                  Отключить защиту
                </button>
              </div>
            </div>
          ) : (
            <PasscodeSetup 
              onSave={(code) => {
                localStorage.setItem('app_passcode', btoa(code));
                setIsPasscodeActive(true);
                setActiveTab('security');
              }} 
              onClose={() => setActiveTab('security')} 
            />
          )}
        </div>
      </div>
    );
  }

  if (activeTab === '2fa') {
    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
        {renderHeader('2FA Защита')}
        <div className="max-w-md mx-auto w-full p-6">
          <TwoFactorSetup 
            onSetup={handleSetup2FA} 
            onEnable={handleEnable2FA} 
            onClose={() => setActiveTab('security')} 
          />
        </div>
      </div>
    );
  }

  if (activeTab === 'devices') {
    const currentDevice = devices.find(d => d.fingerprint === currentFingerprint);
    const otherDevices = devices.filter(d => d.fingerprint !== currentFingerprint);
    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
        {renderHeader('Активные сеансы')}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          <div className="space-y-4">
            <SectionTitle>Это устройство</SectionTitle>
            {currentDevice ? (
              <div className={`border p-5 rounded-[32px] flex items-center gap-4 relative group shadow-2xl ${currentDevice.trusted ? 'bg-purple-600/10 border-purple-500/20' : 'bg-rose-600/10 border-rose-500/20'}`}>
                <div className={`p-4 rounded-2xl shadow-inner ${currentDevice.trusted ? 'bg-purple-500/20 text-purple-400' : 'bg-rose-500/20 text-rose-400'}`}>
                  {currentDevice.trusted ? <ShieldCheck size={28} /> : <AlertCircle size={28} />}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-white text-lg">
                    {currentDevice.device_name} 
                    <span className={`text-[10px] text-white px-2 py-0.5 rounded-full ml-2 align-middle ${currentDevice.trusted ? 'bg-green-500' : 'bg-rose-500'}`}>
                      {currentDevice.trusted ? 'TRUSTED' : 'UNTRUSTED'}
                    </span>
                  </p>
                  <p className="text-xs text-white/30 font-mono mt-0.5">{currentDevice.platform} • {currentDevice.ip_address}</p>
                </div>
                {!currentDevice.trusted && (
                  <button onClick={() => handleTrustDevice(currentDevice.id)} className="px-4 py-2 bg-purple-600 text-white text-[10px] font-black uppercase rounded-xl hover:bg-purple-500 transition-all">
                    Доверять
                  </button>
                )}
                {currentDevice.trusted && <CheckCircle2 className="text-purple-400" size={24} />}
              </div>
            ) : (
              <div className="bg-white/2 border border-white/5 p-6 rounded-[32px] animate-pulse flex items-center gap-4">
                <div className="w-14 h-14 bg-white/5 rounded-2xl"></div>
                <div className="flex-1 space-y-2"><div className="h-4 bg-white/5 w-1/3 rounded"></div><div className="h-3 bg-white/5 w-1/2 rounded"></div></div>
              </div>
            )}
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-center px-4">
              <SectionTitle className="px-0 mt-0">Другие сеансы</SectionTitle>
              {otherDevices.length > 0 && <button className="text-[10px] font-black text-rose-400 hover:text-rose-300 transition-colors uppercase tracking-widest" onClick={handleTerminateOthers}>Завершить все остальные</button>}
            </div>
            {otherDevices.length === 0 ? (
              <div className="text-center py-12 bg-white/1 rounded-[32px] border border-white/5 border-dashed"><p className="text-white/20 text-sm font-medium">Активных сеансов не обнаружено</p></div>
            ) : (
              otherDevices.map(device => (
                <div key={device.id} className="bg-white/2 border border-white/5 p-5 rounded-[32px] flex items-center gap-4 group hover:bg-white/5 transition-all shadow-lg">
                  <div className="p-4 bg-white/5 rounded-2xl text-white/30 group-hover:text-purple-400 transition-colors"><Globe size={28} /></div>
                  <div className="flex-1">
                    <p className="font-bold text-white">{device.device_name}</p>
                    <p className="text-xs text-white/30 font-mono">{device.platform} • {device.ip_address}</p>
                  </div>
                  <button onClick={() => handleRevokeDevice(device.id, false)} className="p-3 text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-500/10 rounded-2xl"><Trash2 size={20} /></button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'privacy') {
    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
        {renderHeader('Конфиденциальность')}
        <div className="max-w-2xl mx-auto w-full p-6 overflow-y-auto custom-scrollbar">
          <SectionTitle>Видимость</SectionTitle>
          <div className="bg-white/2 rounded-[28px] border border-white/5 overflow-hidden shadow-xl mb-6">
            <SettingItem icon={Phone} title="Номер телефона" subtitle={`Кто видит: ${getVisibilityLabel(currentUser.phoneVisibility)}`} onClick={() => setActiveTab('set_phone')} />
            <SettingItem icon={Ghost} title="Последняя активность" subtitle={`Кто видит: ${getVisibilityLabel(currentUser.lastSeenVisibility)}`} onClick={() => setActiveTab('set_lastseen')} />
            <SettingItem icon={Camera} title="Фотографии профиля" subtitle={`Кто видит: ${getVisibilityLabel(currentUser.avatarVisibility)}`} onClick={() => setActiveTab('set_avatar')} />
          </div>
          <SectionTitle>Пользователи</SectionTitle>
          <div className="bg-white/2 rounded-[28px] border border-white/5 overflow-hidden shadow-xl">
            <SettingItem icon={UserX} title="Черный список" subtitle={`${blockedUsers.length} заблокированных`} onClick={() => setActiveTab('blocklist')} />
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'set_phone') {
    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
        {renderHeader('Номер телефона')}
        <div className="max-w-2xl mx-auto w-full p-6">
          <PrivacySelector 
            title="Кто может видеть мой номер?" 
            current={currentUser.phoneVisibility || 'everybody'} 
            onSelect={(v) => handleUpdatePrivacy('phoneVisibility', v)} 
          />
        </div>
      </div>
    );
  }

  if (activeTab === 'set_lastseen') {
    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
        {renderHeader('Время входа')}
        <div className="max-w-2xl mx-auto w-full p-6">
          <PrivacySelector 
            title="Кто может видеть время моего входа?" 
            current={currentUser.lastSeenVisibility || 'everybody'} 
            onSelect={(v) => handleUpdatePrivacy('lastSeenVisibility', v)} 
          />
        </div>
      </div>
    );
  }

  if (activeTab === 'set_avatar') {
    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
        {renderHeader('Фотография профиля')}
        <div className="max-w-2xl mx-auto w-full p-6">
          <PrivacySelector 
            title="Кто может видеть моё фото?" 
            current={currentUser.avatarVisibility || 'everybody'} 
            onSelect={(v) => handleUpdatePrivacy('avatarVisibility', v)} 
          />
        </div>
      </div>
    );
  }

  if (activeTab === 'blocklist') {
    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
        {renderHeader('Черный список')}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {blockedUsers.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center py-20">
              <div className="w-32 h-32 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/5 shadow-inner">
                <UserX size={60} className="text-white/20" strokeWidth={1.5} />
              </div>
              <p className="font-black uppercase tracking-[0.3em] text-sm text-white/30">Список пуст</p>
              <p className="text-[11px] text-white/10 font-medium mt-2 max-w-[200px] text-center italic">Здесь будут отображаться пользователи, которым вы ограничили доступ.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {blockedUsers.map((user) => (
                <div key={user.id} className="flex items-center justify-between p-5 bg-white/2 rounded-[28px] border border-white/5 group hover:bg-white/5 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center font-black text-white/30 uppercase">
                      {user.username?.[0] || '?'}
                    </div>
                    <div>
                      <p className="font-bold text-white">{user.username}</p>
                      <p className="text-xs text-white/30 font-mono">{user.phoneNumber}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnblockUser(user.id)}
                    className="px-5 py-2 text-[10px] font-black text-purple-400 hover:bg-purple-500/10 rounded-full border border-purple-500/20 transition-all uppercase tracking-widest"
                  >
                    Разблокировать
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (activeTab === 'data') {
    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
        {renderHeader('Данные и память')}
        <div className="max-w-2xl mx-auto w-full p-6 space-y-8">
           <SectionTitle>Сеть</SectionTitle>
           <div className="bg-white/2 rounded-[28px] border border-white/5 overflow-hidden shadow-xl">
             <SettingItem 
               icon={Server} 
               title="Использовать прокси" 
               subtitle="В разработке 🛠" 
               showChevron={false}
               rightElement={<ToggleSwitch active={false} onClick={() => toast('Скоро появится!')} />}
               onClick={() => toast('Функция в разработке')}
             />
             <SettingItem icon={Database} title="Использование сети" subtitle="Статистика переданных данных" onClick={() => setActiveTab('usage')} />
           </div>
           
           <SectionTitle>Автозагрузка</SectionTitle>
           <div className="bg-white/2 rounded-[28px] border border-white/5 overflow-hidden shadow-xl">
             <SettingItem 
               icon={Globe} 
               title="Через мобильную сеть" 
               subtitle={dataSettings.autoDownloadMobile ? "ВКЛ (Фото, Видео)" : "ОТКЛ"} 
               showChevron={false}
               rightElement={<ToggleSwitch active={dataSettings.autoDownloadMobile} onClick={() => updateDataSetting('autoDownloadMobile')} />}
               onClick={() => updateDataSetting('autoDownloadMobile')}
             />
             <SettingItem 
               icon={Monitor} 
               title="Через Wi-Fi" 
               subtitle={dataSettings.autoDownloadWifi ? "ВКЛ (Все файлы)" : "ОТКЛ"} 
               showChevron={false}
               rightElement={<ToggleSwitch active={dataSettings.autoDownloadWifi} onClick={() => updateDataSetting('autoDownloadWifi')} />}
               onClick={() => updateDataSetting('autoDownloadWifi')}
             />
           </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'notifications') {
    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
        {renderHeader('Уведомления и звуки')}
        <div className="max-w-2xl mx-auto w-full p-6 space-y-6 overflow-y-auto custom-scrollbar">
           <SectionTitle>Системные пуши</SectionTitle>
           <div className="bg-white/2 rounded-[28px] border border-white/5 overflow-hidden shadow-xl p-6">
              <div className="flex items-center justify-between">
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-purple-500/20 flex items-center justify-center text-purple-400 shadow-inner">
                       <Bell size={24} />
                    </div>
                    <div>
                       <p className="font-bold text-white">Push-уведомления</p>
                       <p className="text-[11px] text-white/30 font-medium leading-tight">Получать уведомления, когда приложение закрыто</p>
                    </div>
                 </div>
                 <button 
                   onClick={handleEnablePush}
                   disabled={pushEnabled || !pushSupported}
                   className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${pushEnabled ? 'bg-green-500/20 text-green-400' : 'bg-purple-600 hover:bg-purple-500 text-white'}`}
                 >
                   {pushEnabled ? 'Включено' : (pushSupported ? 'Включить' : 'Не поддерживается')}
                 </button>
              </div>
           </div>

           <SectionTitle>Уведомления о сообщениях</SectionTitle>
           <div className="bg-white/2 rounded-[28px] border border-white/5 overflow-hidden shadow-xl">
             <SettingItem 
               icon={User} 
               title="Личные чаты" 
               subtitle={notifSettings.private ? "Включены" : "Выключены"} 
               showChevron={false}
               rightElement={<ToggleSwitch active={notifSettings.private} onClick={() => updateNotifSetting('private')} />}
               onClick={() => updateNotifSetting('private')}
             />
             <SettingItem 
               icon={Users} 
               title="Группы" 
               subtitle={notifSettings.groups ? "Включены" : "Выключены"} 
               showChevron={false}
               rightElement={<ToggleSwitch active={notifSettings.groups} onClick={() => updateNotifSetting('groups')} />}
               onClick={() => updateNotifSetting('groups')}
             />
             <SettingItem 
               icon={Hash} 
               title="Каналы" 
               subtitle={notifSettings.channels ? "Включены" : "Выключены"} 
               showChevron={false}
               rightElement={<ToggleSwitch active={notifSettings.channels} onClick={() => updateNotifSetting('channels')} />}
               onClick={() => updateNotifSetting('channels')}
             />
           </div>

           <SectionTitle>Виджет на иконке</SectionTitle>
           <div className="bg-white/2 rounded-[28px] border border-white/5 overflow-hidden shadow-xl">
             <SettingItem 
               icon={Circle} 
               title="Показывать количество" 
               subtitle="Число непрочитанных на иконке" 
               showChevron={false}
               rightElement={<ToggleSwitch active={notifSettings.badges} onClick={() => updateNotifSetting('badges')} />}
               onClick={() => updateNotifSetting('badges')}
             />
           </div>

           <SectionTitle>Внутри приложения</SectionTitle>
           <div className="bg-white/2 rounded-[28px] border border-white/5 overflow-hidden shadow-xl">
             <SettingItem 
               icon={Volume2} 
               title="Звуки" 
               subtitle={notifSettings.sounds ? "Включены" : "Выключены"} 
               showChevron={false}
               rightElement={<ToggleSwitch active={notifSettings.sounds} onClick={() => updateNotifSetting('sounds')} />}
               onClick={() => updateNotifSetting('sounds')}
             />
             <SettingItem 
               icon={Heart} 
               title="Реакции" 
               subtitle={notifSettings.reactions ? "Уведомлять о реакциях" : "Не уведомлять"} 
               showChevron={false}
               rightElement={<ToggleSwitch active={notifSettings.reactions} onClick={() => updateNotifSetting('reactions')} />}
               onClick={() => updateNotifSetting('reactions')}
             />
           </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'usage') {
    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
        {renderHeader('Использование сети')}
        <div className="max-w-2xl mx-auto w-full p-6 space-y-6 overflow-y-auto custom-scrollbar">
           <div className="flex flex-col items-center py-10">
              <div className="w-24 h-24 bg-purple-500/10 rounded-full flex items-center justify-center text-purple-400 mb-4 border border-purple-500/20 shadow-2xl">
                <Database size={48} />
              </div>
              <h3 className="text-3xl font-black text-white">0 Б</h3>
              <p className="text-white/20 text-[10px] font-black uppercase tracking-[0.2em] mt-2">Всего передано данных</p>
           </div>

           <SectionTitle>Статистика сообщений</SectionTitle>
           <div className="bg-white/2 rounded-[28px] border border-white/5 overflow-hidden shadow-xl">
              <SettingItem icon={Globe} title="Отправлено" subtitle="0 сообщений" showChevron={false} />
              <SettingItem icon={Bell} title="Получено" subtitle="0 сообщений" showChevron={false} />
           </div>

           <SectionTitle>Медиа и файлы</SectionTitle>
           <div className="bg-white/2 rounded-[28px] border border-white/5 overflow-hidden shadow-xl">
              <SettingItem icon={Camera} title="Фотографии" subtitle="0 Б" showChevron={false} />
              <SettingItem icon={Server} title="Файлы" subtitle="0 Б" showChevron={false} />
           </div>

           <button 
             onClick={() => toast('Статистика сброшена')}
             className="w-full py-4 text-rose-500 font-black uppercase tracking-widest text-[10px] bg-rose-500/5 rounded-2xl hover:bg-rose-500/10 transition-all border border-rose-500/10 mt-8"
           >
             Сбросить статистику
           </button>
        </div>
      </div>
    );
  }

  if (activeTab === 'profile') {
    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
        {renderHeader('Мой профиль')}
        <div className="max-w-2xl mx-auto w-full p-6 space-y-8 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col items-center mb-4">
             <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
               {renderAvatar("w-32 h-32", "text-5xl", avatarPreview)}
               <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Camera size={40} className="text-white" /></div>
             </div>
             <input 
               type="file" 
               ref={fileInputRef} 
               className="hidden" 
               accept="image/*" 
               onChange={handleFileChange} 
             />
             <p className="mt-4 text-purple-400 font-black text-[10px] uppercase tracking-widest bg-purple-500/10 px-4 py-1.5 rounded-full border border-purple-500/20">Нажмите, чтобы изменить</p>
          </div>
          <div className="bg-white/2 p-8 rounded-[32px] border border-white/5 space-y-8 shadow-2xl">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-purple-400 uppercase tracking-[0.2em] ml-2">Имя пользователя</label>
              <input 
                type="text" 
                value={newUsername} 
                onChange={(e) => setNewUsername(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-[20px] p-5 text-white font-bold focus:ring-2 focus:ring-purple-500 outline-none transition-all shadow-inner" 
              />
            </div>
            <button 
              onClick={handleSaveProfile}
              className="w-full py-5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-[24px] font-black uppercase tracking-widest hover:scale-[1.02] transition-all shadow-xl shadow-purple-900/40 active:scale-95"
            >
              Сохранить изменения
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'sync_contacts') {
    const syncEnabled = localStorage.getItem('contacts_sync_enabled') === 'true';

    const handleSync = async () => {
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

    return (
      <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in slide-in-from-right duration-300">
        <ContactSyncModal 
          isOpen={showSyncModal} 
          onClose={() => setShowSyncModal(false)} 
          results={syncResults} 
          onStartChat={onStartChat || (() => {})} 
        />
        {renderHeader('Друзья и контакты')}
        <div className="max-w-2xl mx-auto w-full p-6 space-y-8 overflow-y-auto custom-scrollbar">
           <div className="flex flex-col items-center py-10 text-center">
              <div className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center text-green-400 mb-6 border border-green-500/20 shadow-2xl relative">
                <Users size={48} />
                <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white border-4 border-[#0a0a0a]">
                  <Check size={16} />
                </div>
              </div>
              <h3 className="text-2xl font-black text-white">Найди своих</h3>
              <p className="text-white/40 text-xs font-medium max-w-xs mt-3 leading-relaxed">
                Разрешите доступ к контактам, чтобы автоматически найти друзей, которые уже используют SecureNet.
              </p>
           </div>

           <div className="bg-white/2 rounded-[32px] border border-white/5 overflow-hidden shadow-xl p-6">
              <div className="flex items-center justify-between gap-4 mb-6">
                 <div>
                    <p className="font-bold text-white">Автосинхронизация</p>
                    <p className="text-[11px] text-white/30 font-medium">Периодически проверять новые контакты</p>
                 </div>
                 <ToggleSwitch active={syncEnabled} onClick={() => {
                   const next = !syncEnabled;
                   localStorage.setItem('contacts_sync_enabled', String(next));
                   toast.success(next ? 'Автосинхронизация включена' : 'Автосинхронизация выключена');
                 }} />
              </div>
              
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="w-full py-5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-black rounded-[24px] transition-all shadow-xl shadow-green-900/20 active:scale-95 flex items-center justify-center gap-3"
              >
                {isSyncing ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <>
                    <SmartphoneNfc size={20} />
                    Синхронизировать сейчас
                  </>
                )}
              </button>
           </div>

           <p className="px-6 text-[10px] text-white/20 font-medium text-center italic">
             Ваши контактные данные зашифрованы и используются только для поиска друзей. Мы не храним вашу телефонную книгу в открытом виде.
           </p>
        </div>
      </div>
    );
  }

  return null;
}
