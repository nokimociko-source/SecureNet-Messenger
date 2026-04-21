import React, { useState } from 'react';
import { UserSearch } from './UserSearch';
import { User } from '../types';


interface ContactsPanelProps {
  contacts: User[];
  onSelectContact?: (contact: User) => void;
  onAddContact?: () => void;
  onSearchUsers?: (query: string) => Promise<User[]>;
  onAddContactFromSearch?: (userId: string) => Promise<boolean>;
}

export const ContactsPanel: React.FC<ContactsPanelProps> = ({ 
  contacts,
  onSelectContact,
  onAddContact,
  onAddContactFromSearch,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'online' | 'verified'>('all');
  const [showUserSearch, setShowUserSearch] = useState(false);

  const filteredContacts = contacts.filter((contact) => {
    const matchesSearch = contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         contact.phoneNumber.includes(searchQuery);
    
    if (filter === 'online') return matchesSearch && contact.online;
    if (filter === 'verified') return matchesSearch && contact.verified;
    return matchesSearch;
  });

  const formatLastSeen = (timestamp?: number): string => {
    if (!timestamp) return 'Неизвестно';
    const minutes = Math.floor((Date.now() - timestamp) / 60000);
    if (minutes < 1) return 'Только что';
    if (minutes < 60) return `${minutes} мин назад`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ч назад`;
    return `${Math.floor(hours / 24)} дн назад`;
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-slate-900 to-purple-900 text-white">
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <h2 className="text-xl font-bold mb-4">📇 Контакты</h2>
        
        {/* Search */}
        <div className="relative mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по имени или телефону..."
            className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <span className="absolute left-3 top-2.5 text-purple-400">🔍</span>
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === 'all' 
                ? 'bg-purple-500 text-white' 
                : 'bg-white/10 text-purple-300 hover:bg-white/20'
            }`}
          >
            Все ({contacts.length})
          </button>
          <button
            onClick={() => setFilter('online')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === 'online' 
                ? 'bg-green-500 text-white' 
                : 'bg-white/10 text-purple-300 hover:bg-white/20'
            }`}
          >
            🟢 Онлайн ({contacts.filter((c) => c.online).length})
          </button>
          <button
            onClick={() => setFilter('verified')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === 'verified' 
                ? 'bg-blue-500 text-white' 
                : 'bg-white/10 text-purple-300 hover:bg-white/20'
            }`}
          >
            🔒 Верифицированные ({contacts.filter((c) => c.verified).length})
          </button>
          <button
            onClick={() => setShowUserSearch(true)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-500 text-white hover:bg-purple-600 transition-colors"
          >
            🔍 Найти пользователей
          </button>
        </div>
      </div>

      {/* Contact List */}
      <div className="flex-1 overflow-y-auto">
        {filteredContacts.map((contact) => (
          <div
            key={contact.id}
            onClick={() => onSelectContact?.(contact)}
            className="p-4 border-b border-white/10 hover:bg-white/5 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              {/* Avatar */}
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-lg font-bold">
                  {contact.name[0]}
                </div>
                {/* Online indicator */}
                <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 border-2 border-slate-900 rounded-full ${
                  contact.online ? 'bg-green-500' : 'bg-gray-500'
                }`}></div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="font-semibold text-white truncate">
                    {contact.name}
                  </h3>
                  {contact.verified && (
                    <span className="text-blue-400" title="Верифицирован">✓</span>
                  )}
                </div>
                <p className="text-sm text-purple-300 truncate">
                  {contact.phoneNumber}
                </p>
                <p className="text-xs text-purple-400">
                  {contact.online ? (
                    <span className="text-green-400">🟢 В сети</span>
                  ) : (
                    `Был ${formatLastSeen(contact.lastSeen)}`
                  )}
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-1">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectContact?.(contact);
                  }}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors" 
                  title="Написать"
                >
                  <span className="text-xl">💬</span>
                </button>
              </div>
            </div>
          </div>
        ))}

        {filteredContacts.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-purple-300">
            <span className="text-5xl mb-4">📭</span>
            <p className="text-lg font-medium">Контакты не найдены</p>
            <p className="text-sm text-purple-400 mt-2">
              {searchQuery ? 'Попробуйте другой поисковый запрос' : 'Добавьте первый контакт'}
            </p>
          </div>
        )}
      </div>

      {/* Add Button */}
      <div className="p-4 border-t border-white/10">
        <button 
          onClick={onAddContact}
          className="w-full py-3 px-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all font-bold"
        >
          + Добавить контакт
        </button>
      </div>

      {/* User Search Modal */}
      {showUserSearch && onAddContactFromSearch && (
        <UserSearch
          onAddContact={onAddContactFromSearch}
          onClose={() => setShowUserSearch(false)}
        />
      )}
    </div>
  );
}
