import React, { useState } from 'react';
import { Key, ShieldCheck, ArrowLeft } from 'lucide-react';

interface TwoFactorVerifyProps {
  onVerify: (code: string) => Promise<boolean>;
  onCancel: () => void;
}

export const TwoFactorVerify: React.FC<TwoFactorVerifyProps> = ({ onVerify, onCancel }) => {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;

    setIsLoading(true);
    setError(null);
    try {
      const success = await onVerify(code);
      if (!success) {
        setError('Неверный код. Попробуйте еще раз.');
      }
    } catch (err) {
      setError('Произошла ошибка при проверке.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0a1e] flex items-center justify-center p-6 animate-in fade-in duration-500">
      <div className="absolute inset-0 bg-gradient-to-tr from-purple-900/20 to-indigo-900/20 pointer-events-none" />
      
      <div className="w-full max-w-md glass rounded-[40px] border border-white/10 p-8 shadow-2xl relative z-10">
        <button 
          onClick={onCancel}
          className="absolute top-6 left-6 p-2 text-white/40 hover:text-white transition-colors"
        >
          <ArrowLeft size={24} />
        </button>

        <div className="text-center space-y-6 mt-4">
          <div className="w-20 h-20 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto shadow-xl shadow-purple-500/10">
            <ShieldCheck size={40} className="text-purple-400" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-3xl font-black text-white tracking-tight">Подтверждение входа</h2>
            <p className="text-white/40 text-sm">Введите 6-значный код из вашего приложения для аутентификации.</p>
          </div>

          <form onSubmit={handleVerify} className="space-y-6">
            <div className="space-y-4">
              <input
                type="text"
                maxLength={6}
                value={code}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setCode(val);
                  if (val.length === 6 && !isLoading) {
                    // Auto-submit on 6 digits
                    // (optional: can trigger handleVerify here if needed)
                  }
                }}
                placeholder="000000"
                className={`w-full bg-black/40 border-2 ${error ? 'border-red-500/50' : 'border-white/10'} rounded-2xl p-4 text-center text-3xl font-black tracking-[0.5em] text-white focus:border-purple-500 outline-none transition-all shadow-inner`}
                autoFocus
              />
              {error && (
                <p className="text-red-400 text-xs font-bold animate-shake">{error}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading || code.length !== 6}
              className="w-full py-4 bg-purple-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-purple-500 transition-all shadow-xl shadow-purple-900/40 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Key size={20} />
                  Войти
                </>
              )}
            </button>
          </form>

          <p className="text-[10px] text-white/20 font-bold uppercase tracking-widest">
            Если у вас нет доступа к приложению, воспользуйтесь резервным кодом
          </p>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-shake { animation: shake 0.2s ease-in-out 0s 2; }
      `}</style>
    </div>
  );
};
