import React, { useState } from 'react';

interface PasswordChangeProps {
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
}

export const PasswordChange: React.FC<PasswordChangeProps> = ({ onChangePassword }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const checkPasswordStrength = (password: string): { score: number; text: string; color: string } => {
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    const levels = [
      { text: 'Очень слабый', color: 'text-red-500' },
      { text: 'Слабый', color: 'text-orange-500' },
      { text: 'Средний', color: 'text-yellow-500' },
      { text: 'Хороший', color: 'text-blue-400' },
      { text: 'Отличный', color: 'text-green-400' },
      { text: 'Превосходный', color: 'text-green-400' },
    ];

    return { score, ...levels[Math.min(score, 5)] };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    // Validation
    if (!currentPassword) {
      setError('Введите текущий пароль');
      return;
    }

    if (newPassword.length < 8) {
      setError('Новый пароль должен быть минимум 8 символов');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    const strength = checkPasswordStrength(newPassword);
    if (strength.score < 2) {
      setError('Пароль слишком слабый. Добавьте заглавные буквы, цифры и символы.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await onChangePassword(currentPassword, newPassword);
      if (result) {
        setSuccess(true);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setError('Текущий пароль неверный');
      }
    } catch {
      setError('Ошибка при смене пароля');
    } finally {
      setIsLoading(false);
    }
  };

  const strength = checkPasswordStrength(newPassword);

  if (success) {
    return (
      <div className="bg-green-500/10 rounded-xl p-6 border border-green-500/30 text-center">
        <div className="text-4xl mb-4">✅</div>
        <h3 className="text-lg font-bold text-green-300 mb-2">Пароль изменён!</h3>
        <p className="text-green-200 text-sm mb-4">
          Ваш пароль успешно обновлён. Используйте новый пароль при следующем входе.
        </p>
        <button
          onClick={() => setSuccess(false)}
          className="px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
        >
          Закрыть
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white/5 rounded-xl p-6 border border-white/20">
      <h3 className="text-lg font-bold text-white mb-4">🔑 Смена пароля</h3>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-purple-300 text-sm mb-2">Текущий пароль</label>
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="Введите текущий пароль"
          />
        </div>

        <div>
          <label className="block text-purple-300 text-sm mb-2">Новый пароль</label>
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="Минимум 8 символов"
          />
          
          {newPassword && (
            <div className="mt-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      strength.score <= 1 ? 'bg-red-500 w-1/5' :
                      strength.score === 2 ? 'bg-orange-500 w-2/5' :
                      strength.score === 3 ? 'bg-yellow-500 w-3/5' :
                      strength.score === 4 ? 'bg-blue-400 w-4/5' :
                      'bg-green-400 w-full'
                    }`}
                  />
                </div>
                <span className={`text-sm ${strength.color}`}>{strength.text}</span>
              </div>
              <ul className="mt-2 text-xs text-purple-300 space-y-1">
                <li className={newPassword.length >= 8 ? 'text-green-400' : ''}>
                  {newPassword.length >= 8 ? '✓' : '○'} Минимум 8 символов
                </li>
                <li className={/[A-Z]/.test(newPassword) ? 'text-green-400' : ''}>
                  {/[A-Z]/.test(newPassword) ? '✓' : '○'} Заглавная буква
                </li>
                <li className={/[a-z]/.test(newPassword) ? 'text-green-400' : ''}>
                  {/[a-z]/.test(newPassword) ? '✓' : '○'} Строчная буква
                </li>
                <li className={/[0-9]/.test(newPassword) ? 'text-green-400' : ''}>
                  {/[0-9]/.test(newPassword) ? '✓' : '○'} Цифра
                </li>
                <li className={/[^A-Za-z0-9]/.test(newPassword) ? 'text-green-400' : ''}>
                  {/[^A-Za-z0-9]/.test(newPassword) ? '✓' : '○'} Специальный символ
                </li>
              </ul>
            </div>
          )}
        </div>

        <div>
          <label className="block text-purple-300 text-sm mb-2">Подтвердите новый пароль</label>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="Повторите новый пароль"
          />
          {confirmPassword && newPassword !== confirmPassword && (
            <div className="text-red-400 text-sm mt-2">Пароли не совпадают</div>
          )}
        </div>

        {error && (
          <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50"
        >
          {isLoading ? '⏳ Смена пароля...' : '🔐 Изменить пароль'}
        </button>
      </form>
    </div>
  );
};
