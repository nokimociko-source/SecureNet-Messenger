import { useState, useEffect } from 'react';
import { Delete, ShieldEllipsis } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function PasscodeSetup({
  onSave,
  onClose
}: {
  onSave: (passcode: string) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');

  const handleNumber = (num: string) => {
    if (step === 'enter') {
      if (passcode.length < 4) setPasscode(prev => prev + num);
    } else {
      if (confirmPasscode.length < 4) setConfirmPasscode(prev => prev + num);
    }
  };

  const handleDelete = () => {
    if (step === 'enter') setPasscode(prev => prev.slice(0, -1));
    else setConfirmPasscode(prev => prev.slice(0, -1));
  };

  useEffect(() => {
    if (passcode.length === 4 && step === 'enter') {
      setStep('confirm');
    }
    if (confirmPasscode.length === 4 && step === 'confirm') {
      if (passcode === confirmPasscode) {
        onSave(passcode);
        toast.success('Код-пароль установлен');
      } else {
        toast.error('Коды не совпадают');
        setConfirmPasscode('');
        setStep('enter');
        setPasscode('');
      }
    }
  }, [passcode, confirmPasscode, step]);

  const PinDots = ({ value }: { value: string }) => (
    <div className="flex gap-4 justify-center my-8">
      {[1, 2, 3, 4].map(i => (
        <div 
          key={i} 
          className={`w-4 h-4 rounded-full border-2 transition-all duration-300 ${
            value.length >= i 
              ? 'bg-purple-500 border-purple-500 scale-125 shadow-[0_0_15px_rgba(168,85,247,0.5)]' 
              : 'border-white/20 scale-100'
          }`}
        />
      ))}
    </div>
  );

  return (
    <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
      <div className="w-16 h-16 bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-400 mb-6 border border-purple-500/20 shadow-xl">
        <ShieldEllipsis size={32} />
      </div>
      
      <h3 className="text-xl font-black text-white uppercase tracking-widest mb-2">
        {step === 'enter' ? 'Установите код' : 'Повторите код'}
      </h3>
      <p className="text-white/40 text-xs font-medium mb-4">Для защиты ваших переписок</p>

      <PinDots value={step === 'enter' ? passcode : confirmPasscode} />

      <div className="grid grid-cols-3 gap-4 w-full max-w-[280px]">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
          <button
            key={num}
            onClick={() => handleNumber(num)}
            className="w-16 h-16 rounded-2xl bg-white/5 hover:bg-white/10 text-white text-2xl font-bold transition-all active:scale-90 flex items-center justify-center border border-white/5"
          >
            {num}
          </button>
        ))}
        <div />
        <button
          onClick={() => handleNumber('0')}
          className="w-16 h-16 rounded-2xl bg-white/5 hover:bg-white/10 text-white text-2xl font-bold transition-all active:scale-90 flex items-center justify-center border border-white/5"
        >
          0
        </button>
        <button
          onClick={handleDelete}
          className="w-16 h-16 rounded-2xl bg-white/5 hover:bg-rose-500/20 text-rose-400 transition-all active:scale-90 flex items-center justify-center border border-white/5"
        >
          <Delete size={24} />
        </button>
      </div>

      <button
        onClick={onClose}
        className="mt-10 text-[10px] font-black text-white/20 uppercase tracking-widest hover:text-white/50 transition-colors"
      >
        Отмена
      </button>
    </div>
  );
}
