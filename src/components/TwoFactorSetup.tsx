import React, { useState } from 'react';
import { Shield, Key, Copy, Check, AlertTriangle, Download } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface TwoFactorSetupProps {
  onSetup: () => Promise<{ secret: string; qrCode: string; backupCodes: string[] } | null>;
  onEnable: (code: string) => Promise<boolean>;
  onClose: () => void;
}

export const TwoFactorSetup: React.FC<TwoFactorSetupProps> = ({ onSetup, onEnable, onClose }) => {
  const [step, setStep] = useState<'start' | 'setup' | 'verify' | 'success'>('start');
  const [data, setData] = useState<{ secret: string; qrCode: string; backupCodes: string[] } | null>(null);
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const handleStart = async () => {
    setIsLoading(true);
    try {
      const result = await onSetup();
      if (result) {
        setData(result);
        setStep('setup');
      }
    } catch (err) {
      toast.error('Не удалось инициализировать 2FA');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopySecret = () => {
    if (!data) return;
    navigator.clipboard.writeText(data.secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
    toast.success('Секретный ключ скопирован');
  };

  const handleEnable = async () => {
    if (code.length !== 6) {
      toast.error('Введите 6-значный код');
      return;
    }
    setIsLoading(true);
    try {
      const success = await onEnable(code);
      if (success) {
        setStep('success');
        toast.success('2FA успешно включена!');
      } else {
        toast.error('Неверный код подтверждения');
      }
    } catch (err) {
      toast.error('Ошибка активации 2FA');
    } finally {
      setIsLoading(false);
    }
  };

  const downloadBackupCodes = () => {
    if (!data) return;
    const content = `SecureNet Backup Codes\nKeep these in a safe place!\n\n${data.backupCodes.join('\n')}`;
    const element = document.createElement("a");
    const file = new Blob([content], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = "securenet-backup-codes.txt";
    document.body.appendChild(element);
    element.click();
  };

  return (
    <div className="bg-white/5 rounded-[32px] border border-white/10 overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300">
      <div className="p-8">
        {step === 'start' && (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto">
              <Shield size={40} className="text-purple-400" />
            </div>
            <h3 className="text-2xl font-black text-white tracking-tight">Двухэтапная аутентификация</h3>
            <p className="text-white/60 text-sm leading-relaxed max-w-xs mx-auto">
              Добавьте дополнительный уровень защиты для вашего аккаунта. Для входа потребуется код из приложения-аутентификатора.
            </p>
            <button
              onClick={handleStart}
              disabled={isLoading}
              className="w-full py-4 bg-purple-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-purple-500 transition-all shadow-xl shadow-purple-900/40 active:scale-95 disabled:opacity-50"
            >
              {isLoading ? 'Загрузка...' : 'Настроить сейчас'}
            </button>
          </div>
        )}

        {step === 'setup' && data && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-white text-center">Настройка аутентификатора</h3>
            
            <div className="bg-white p-4 rounded-2xl w-48 h-48 mx-auto flex items-center justify-center">
              {/* In a real app, use a QR code library. Here we'll show a placeholder or the secret */}
              <div className="text-center">
                <div className="bg-black/5 p-2 rounded-lg mb-2">
                   <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(data.qrCode)}`} alt="QR Code" />
                </div>
                <p className="text-[10px] text-black/40 font-bold uppercase">Сканируйте в приложении</p>
              </div>
            </div>

            <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
              <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1 block">Или введите ключ вручную</label>
              <div className="flex items-center gap-3">
                <code className="flex-1 bg-black/40 p-2 rounded-lg text-white font-mono text-sm tracking-widest">{data.secret}</code>
                <button onClick={handleCopySecret} className="p-2 hover:bg-white/10 rounded-lg text-purple-400">
                  {copiedSecret ? <Check size={18} /> : <Copy size={18} />}
                </button>
              </div>
            </div>

            <div className="bg-rose-500/10 p-4 rounded-2xl border border-rose-500/20 flex gap-3">
              <AlertTriangle className="text-rose-400 flex-shrink-0" size={20} />
              <p className="text-[11px] text-rose-300 font-medium">
                Обязательно сохраните резервные коды! Они помогут вернуть доступ, если вы потеряете телефон.
              </p>
            </div>

            <button
              onClick={() => setStep('verify')}
              className="w-full py-4 bg-white/10 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-white/20 transition-all border border-white/10"
            >
              Я сохранил, далее
            </button>
          </div>
        )}

        {step === 'verify' && (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto">
              <Key size={40} className="text-purple-400" />
            </div>
            <h3 className="text-xl font-bold text-white">Введите код</h3>
            <p className="text-white/40 text-sm">Введите 6-значный код из вашего приложения для подтверждения.</p>
            
            <input
              type="text"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-full bg-black/40 border-2 border-white/10 rounded-2xl p-4 text-center text-3xl font-black tracking-[0.5em] text-white focus:border-purple-500 outline-none transition-all"
            />

            <div className="flex gap-4">
              <button
                onClick={() => setStep('setup')}
                className="flex-1 py-4 bg-white/5 text-white/40 rounded-2xl font-bold hover:bg-white/10 transition-all"
              >
                Назад
              </button>
              <button
                onClick={handleEnable}
                disabled={isLoading || code.length !== 6}
                className="flex-2 py-4 bg-purple-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-purple-500 transition-all disabled:opacity-50"
              >
                {isLoading ? 'Проверка...' : 'Подтвердить'}
              </button>
            </div>
          </div>
        )}

        {step === 'success' && data && (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
              <Check size={40} className="text-green-400" />
            </div>
            <h3 className="text-2xl font-black text-white">Готово!</h3>
            <p className="text-white/60 text-sm">Двухэтапная аутентификация активирована.</p>
            
            <div className="bg-white/5 p-6 rounded-[24px] border border-white/10 space-y-4">
              <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Ваши резервные коды</p>
              <div className="grid grid-cols-2 gap-2">
                {data.backupCodes.map((c, i) => (
                  <code key={i} className="bg-black/40 p-1.5 rounded-lg text-white font-mono text-xs">{c}</code>
                ))}
              </div>
              <button onClick={downloadBackupCodes} className="flex items-center gap-2 text-purple-400 text-xs font-bold mx-auto hover:text-purple-300">
                <Download size={14} /> Скачать как .txt
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-full py-4 bg-purple-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-purple-500 transition-all"
            >
              Завершить
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
