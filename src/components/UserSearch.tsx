import { useState, useEffect } from 'react';
import { User } from '../types';
import toast from 'react-hot-toast';

interface UserSearchProps {
  onAddContact: (userId: string) => Promise<boolean>;
  onClose: () => void;
}

export const UserSearch: React.FC<UserSearchProps> = ({ onAddContact, onClose }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout>();

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    // Debounce search
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        // This would be implemented with real API call
        // For now, mock search results
        const mockResults = [
          {
            id: '1',
            username: 'John Doe',
            email: 'john@example.com',
            status: 'online',
            twoFactorEnabled: false,
            createdAt: new Date(),
            name: 'John Doe',
            phoneNumber: '+1234567890',
            publicKey: { kty: 'RSA', e: 'AQAB', n: 'test' },
            online: true,
            lastSeen: new Date(),
            verified: true,
          },
          {
            id: '2',
            username: 'Jane Smith',
            email: 'jane@example.com',
            status: 'offline',
            twoFactorEnabled: false,
            createdAt: new Date(),
            name: 'Jane Smith',
            phoneNumber: '+0987654321',
            publicKey: { kty: 'RSA', e: 'AQAB', n: 'test' },
            online: false,
            lastSeen: new Date(Date.now() - 3600000),
            verified: true,
          },
        ].filter(user => 
          user.name.toLowerCase().includes(query.toLowerCase()) ||
          user.phoneNumber.includes(query)
        );

        setResults(mockResults as any);
      } catch (error) {
        console.error('Search error:', error);
        toast.error('Ошибка поиска');
      } finally {
        setLoading(false);
      }
    }, 300);

    setSearchTimeout(timeout);

    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [query]);

  const handleAddContact = async (userId: string, userName: string) => {
    const success = await onAddContact(userId);
    if (success) {
      setResults(results.filter(user => user.id !== userId));
      toast.success(`${userName} добавлен в контакты!`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-2xl border border-white/20 w-full max-w-md max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="text-lg font-bold text-white">Поиск пользователей</h3>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Search Input */}
        <div className="p-4">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Введите имя или номер телефона..."
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              autoFocus
            />
            {loading && (
              <div className="absolute right-3 top-3.5">
                <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {query.length < 2 && (
            <div className="p-8 text-center text-white/60">
              <div className="text-4xl mb-2">🔍</div>
              <p>Введите минимум 2 символа для поиска</p>
            </div>
          )}

          {query.length >= 2 && !loading && results.length === 0 && (
            <div className="p-8 text-center text-white/60">
              <div className="text-4xl mb-2">😔</div>
              <p>Пользователи не найдены</p>
            </div>
          )}

          {results.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between p-3 bg-white/10 rounded-lg hover:bg-white/20 cursor-pointer transition-all"
              onClick={() => handleAddContact(user.id, (user as any).name || user.username)}
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
                  {(user as any).name?.charAt(0).toUpperCase() || user.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-bold text-white">{(user as any).name || user.username}</div>
                  <div className="text-sm text-white/60">{(user as any).phoneNumber || 'Нет телефона'}</div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {(user as any).online && (
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                )}
                <button className="px-3 py-1 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors">
                  Добавить
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-white/5">
          <p className="text-xs text-white/60 text-center">
            Найдите пользователей по имени или номеру телефона
          </p>
        </div>
      </div>
    </div>
  );
};
