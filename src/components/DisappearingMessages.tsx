import React, { useState } from 'react';

interface DisappearingMessagesProps {
  currentSetting: number; // seconds, 0 = off
  onChange: (seconds: number) => void;
}

const TIME_OPTIONS = [
  { value: 0, label: 'Выключено', description: 'Сообщения не удаляются' },
  { value: 5, label: '5 секунд', description: 'Тестовый режим' },
  { value: 60, label: '1 минута', description: 'Быстрое удаление' },
  { value: 300, label: '5 минут', description: 'Краткосрочные сообщения' },
  { value: 3600, label: '1 час', description: 'Для важных разговоров' },
  { value: 86400, label: '1 день', description: 'Стандартное удаление' },
  { value: 604800, label: '1 неделя', description: 'Долгосрочное хранение' },
];

export const DisappearingMessages: React.FC<DisappearingMessagesProps> = ({
  currentSetting,
  onChange,
}) => {
  const [selectedValue, setSelectedValue] = useState(currentSetting);
  const [showSaved, setShowSaved] = useState(false);

  const handleSave = () => {
    onChange(selectedValue);
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
  };

  const formatTime = (seconds: number): string => {
    const option = TIME_OPTIONS.find(o => o.value === seconds);
    return option?.label || 'Выключено';
  };

  return (
    <div className="bg-white/5 rounded-xl p-6 border border-white/20">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-3xl">⏳</span>
        <div>
          <h3 className="text-lg font-bold text-white">Исчезающие сообщения</h3>
          <p className="text-purple-300 text-sm">
            Текущая настройка: <span className="text-white font-bold">{formatTime(currentSetting)}</span>
          </p>
        </div>
      </div>

      <p className="text-purple-300 text-sm mb-4">
        Сообщения будут автоматически удаляться через выбранное время после прочтения.
        Эта настройка применяется ко всем новым сообщениям в чате.
      </p>

      <div className="space-y-2 mb-6">
        {TIME_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
              selectedValue === option.value
                ? 'bg-purple-500/20 border border-purple-500/50'
                : 'bg-white/5 border border-white/10 hover:bg-white/10'
            }`}
          >
            <input
              type="radio"
              name="disappearing"
              value={option.value}
              checked={selectedValue === option.value}
              onChange={() => setSelectedValue(option.value)}
              className="w-4 h-4 accent-purple-500"
            />
            <div className="flex-1">
              <div className="font-bold text-white">{option.label}</div>
              <div className="text-sm text-purple-300">{option.description}</div>
            </div>
            {selectedValue === option.value && (
              <span className="text-purple-400">✓</span>
            )}
          </label>
        ))}
      </div>

      {selectedValue > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4">
          <div className="flex items-start gap-2">
            <span className="text-yellow-400">⚠️</span>
            <div className="text-sm text-yellow-300">
              <div className="font-bold mb-1">Важно:</div>
              <ul className="space-y-1 text-yellow-200">
                <li>• Получатель может сделать скриншот</li>
                <li>• Удаление синхронизируется между устройствами</li>
                <li>• Отправитель не может удалить сообщение раньше времени</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={selectedValue === currentSetting}
        className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {showSaved ? '✅ Сохранено!' : '💾 Сохранить настройку'}
      </button>
    </div>
  );
};

// Timer component for individual messages
interface MessageTimerProps {
  expiresAt: number; // timestamp
  onExpire: () => void;
}

export const MessageTimer: React.FC<MessageTimerProps> = ({ expiresAt, onExpire }) => {
  const [timeLeft, setTimeLeft] = useState(Math.max(0, expiresAt - Date.now()));

  React.useEffect(() => {
    if (timeLeft <= 0) {
      onExpire();
      return;
    }

    const interval = setInterval(() => {
      const remaining = Math.max(0, expiresAt - Date.now());
      setTimeLeft(remaining);
      
      if (remaining <= 0) {
        clearInterval(interval);
        onExpire();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, onExpire, timeLeft]);

  const formatTimeLeft = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}д ${hours % 24}ч`;
    if (hours > 0) return `${hours}ч ${minutes % 60}м`;
    if (minutes > 0) return `${minutes}м ${seconds % 60}с`;
    return `${seconds}с`;
  };

  return (
    <span className="text-xs text-purple-300 flex items-center gap-1">
      ⏳ {formatTimeLeft(timeLeft)}
    </span>
  );
};
