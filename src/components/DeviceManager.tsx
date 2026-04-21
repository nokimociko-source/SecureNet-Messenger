/**
 * DEVICE MANAGER COMPONENT
 * Shows registered devices, allows revoking access, marks trusted devices.
 */

import { useState, useEffect } from 'react';

interface DeviceManagerProps {
  apiRequest: (url: string, options?: RequestInit) => Promise<Response>;
  onClose: () => void;
}

interface Device {
  id: string;
  deviceName: string;
  fingerprint: string;
  platform: string;
  userAgent: string;
  ipAddress: string;
  trusted: boolean;
  lastUsedAt: string;
  createdAt: string;
}

export function DeviceManager({ apiRequest, onClose }: DeviceManagerProps) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = async () => {
    try {
      const response = await apiRequest('/devices');
      const data = await response.json();
      setDevices(data || []);
    } catch (err) {
      console.error('Failed to load devices:', err);
    } finally {
      setLoading(false);
    }
  };

  const revokeDevice = async (deviceId: string) => {
    setRevoking(deviceId);
    try {
      await apiRequest(`/devices/${deviceId}`, { method: 'DELETE' });
      setDevices(prev => prev.filter(d => d.id !== deviceId));
    } catch (err) {
      console.error('Failed to revoke device:', err);
    } finally {
      setRevoking(null);
    }
  };

  const getPlatformIcon = (platform: string): string => {
    switch (platform.toLowerCase()) {
      case 'windows': return '🖥️';
      case 'android': return '📱';
      case 'ios': return '📱';
      case 'macos': return '💻';
      case 'linux': return '🐧';
      default: return '🌐';
    }
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Только что';
    if (diffMins < 60) return `${diffMins} мин. назад`;
    if (diffHours < 24) return `${diffHours} ч. назад`;
    if (diffDays < 7) return `${diffDays} дн. назад`;
    return date.toLocaleDateString('ru-RU');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fadeIn">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      ></div>
      
      {/* Modal Content */}
      <div className="relative w-full max-w-lg glass rounded-[32px] border border-white/10 shadow-2xl overflow-hidden animate-scaleIn flex flex-col max-h-[85vh]">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-pink-500"></div>
        
        {/* Header */}
        <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              🔐 Привязанные устройства
            </h2>
            <p className="text-white/40 text-xs mt-1">
              Управляйте доступом к вашему аккаунту
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-xl text-white/40 hover:text-white/60 transition-all"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Scrollable List */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-3 custom-scrollbar">
          {loading ? (
            <div className="py-20 text-center animate-pulse">
              <div className="text-purple-400 font-bold tracking-widest text-xs uppercase">Загрузка данных...</div>
            </div>
          ) : devices.length === 0 ? (
            <div className="py-20 text-center space-y-4 opacity-30">
              <div className="text-5xl">📱</div>
              <div className="text-sm font-bold uppercase tracking-widest">Нет привязанных устройств</div>
            </div>
          ) : (
            devices.map((device, index) => (
              <div
                key={device.id}
                className={`flex items-center gap-4 p-4 rounded-2xl transition-all border ${
                  index === 0 
                    ? 'bg-green-500/10 border-green-500/20 shadow-lg shadow-green-500/5' 
                    : 'bg-white/3 border-white/5 hover:bg-white/5'
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-2xl shadow-inner">
                  {getPlatformIcon(device.platform)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-bold text-white/90 truncate text-sm">
                      {device.deviceName}
                    </span>
                    {index === 0 && (
                      <span className="bg-green-500/20 text-green-400 text-[9px] px-1.5 py-0.5 rounded-md font-black uppercase tracking-tighter">ТЕКУЩЕЕ</span>
                    )}
                    {device.trusted && (
                      <span className="bg-blue-500/20 text-blue-400 text-[9px] px-1.5 py-0.5 rounded-md font-black uppercase tracking-tighter">ДОВЕРЕННОЕ</span>
                    )}
                  </div>
                  <div className="text-[11px] text-white/40 flex items-center gap-2">
                    <span className="font-medium text-white/60">{device.platform}</span>
                    <span className="opacity-20">•</span>
                    <span>IP: {device.ipAddress || 'N/A'}</span>
                  </div>
                  <div className="text-[10px] text-white/20 mt-1">
                    Активность: {formatDate(device.lastUsedAt)}
                  </div>
                </div>

                {index !== 0 && (
                  <button
                    onClick={() => revokeDevice(device.id)}
                    disabled={revoking === device.id}
                    className="p-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition-all border border-red-500/20 active:scale-90 disabled:opacity-30"
                  >
                    {revoking === device.id ? (
                      <div className="w-5 h-5 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    )}
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-white/5 bg-white/2">
          <p className="text-[10px] text-white/30 text-center uppercase tracking-widest font-bold">
            🔒 Отзовите доступ для любого устройства, которое вы не узнаёте
          </p>
        </div>
      </div>
    </div>
  );
}

export default DeviceManager;
