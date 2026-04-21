import { useState, useEffect } from 'react';
import { Lock, Delete, ShieldAlert, Fingerprint } from 'lucide-react';

export default function PasscodeUnlock({
  onUnlock,
  hashedPasscode
}: {
  onUnlock: () => void;
  hashedPasscode: string;
}) {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState(false);

  const handleNumber = (num: string) => {
    if (passcode.length < 4) {
      setPasscode(prev => prev + num);
      setError(false);
    }
  };

  const handleDelete = () => {
    setPasscode(prev => prev.slice(0, -1));
    setError(false);
  };

  useEffect(() => {
    if (passcode.length === 4) {
      // Simple hash check for now (in production we use webcrypto pbkdf2)
      if (btoa(passcode) === hashedPasscode) {
        onUnlock();
      } else {
        setError(true);
        setTimeout(() => setPasscode(''), 500);
      }
    }
  }, [passcode, hashedPasscode]);

  return (
    <div className="fixed inset-0 z-[9999] bg-[#0a0a0a] flex flex-col items-center justify-center p-6 backdrop-blur-3xl">
      <div className={`w-20 h-20 rounded-[28px] flex items-center justify-center mb-8 transition-all duration-300 ${error ? 'bg-rose-500/20 text-rose-500 animate-shake' : 'bg-purple-500/10 text-purple-400 border border-purple-500/20 shadow-2xl shadow-purple-500/10'}`}>
        {error ? <ShieldAlert size={40} /> : <Lock size={40} />}
      </div>

      <h2 className="text-2xl font-black text-white tracking-tighter mb-2 uppercase">Введите код</h2>
      <p className={`text-xs font-bold uppercase tracking-widest transition-colors ${error ? 'text-rose-500' : 'text-white/20'}`}>
        {error ? 'Неверный код' : 'Приложение заблокировано'}
      </p>

      <div className="flex gap-6 my-12">
        {[1, 2, 3, 4].map(i => (
          <div 
            key={i} 
            className={`w-5 h-5 rounded-full border-2 transition-all duration-200 ${
              passcode.length >= i 
                ? 'bg-white border-white scale-110 shadow-[0_0_20px_rgba(255,255,255,0.4)]' 
                : 'border-white/10'
            } ${error ? 'border-rose-500 bg-rose-500' : ''}`}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6 w-full max-w-[320px]">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
          <button
            key={num}
            onClick={() => handleNumber(num)}
            className="w-20 h-20 rounded-3xl bg-white/5 hover:bg-white/10 text-white text-3xl font-black transition-all active:scale-90 flex items-center justify-center border border-white/5 shadow-xl"
          >
            {num}
          </button>
        ))}
        <div className="flex items-center justify-center text-white/10">
          <Fingerprint size={32} />
        </div>
        <button
          onClick={() => handleNumber('0')}
          className="w-20 h-20 rounded-3xl bg-white/5 hover:bg-white/10 text-white text-3xl font-black transition-all active:scale-90 flex items-center justify-center border border-white/5 shadow-xl"
        >
          0
        </button>
        <button
          onClick={handleDelete}
          className="w-20 h-20 rounded-3xl bg-white/5 hover:bg-rose-500/20 text-rose-400 transition-all active:scale-90 flex items-center justify-center border border-white/5"
        >
          <Delete size={32} />
        </button>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
        .animate-shake { animation: shake 0.2s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
