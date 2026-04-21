/**
 * GROUP CHAT MANAGEMENT COMPONENT
 * Create groups, manage members, update group info.
 */

import { useState } from 'react';

interface GroupChatProps {
  apiRequest: (url: string, options?: RequestInit) => Promise<Response>;
  contacts: { id: string; name: string; phoneNumber: string }[];
  onGroupCreated: (group: GroupInfo) => void;
  onClose: () => void;
}

export interface GroupInfo {
  id: string;
  name: string;
  type: string;
  participants: { userId: string; username: string; role: string; online: boolean }[];
}

export function CreateGroupChat({ apiRequest, contacts, onGroupCreated, onClose }: GroupChatProps) {
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phoneNumber.includes(searchQuery)
  );

  const toggleMember = (id: string) => {
    setSelectedMembers(prev =>
      prev.includes(id)
        ? prev.filter(m => m !== id)
        : [...prev, id]
    );
  };

  const handleCreate = async () => {
    if (!groupName.trim()) {
      setError('Введите название группы');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const response = await apiRequest('/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: groupName.trim(),
          participantIds: selectedMembers,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Ошибка создания группы');
      }

      const group = await response.json();
      onGroupCreated(group);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fadeIn">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      ></div>
      
      {/* Modal Content */}
      <div className="relative w-full max-w-md glass rounded-[32px] border border-white/10 shadow-2xl overflow-hidden animate-scaleIn flex flex-col max-h-[85vh]">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-pink-500"></div>
        
        {/* Header */}
        <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white tracking-tight">
            👥 Создать группу
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-xl text-white/40 hover:text-white/60 transition-all"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6 custom-scrollbar">
          {/* Group Name */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-purple-400 uppercase tracking-widest ml-1">Название группы</label>
            <input
              type="text"
              placeholder="Напр: Любители котов 🐾"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              className="w-full px-5 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/20 focus:ring-2 focus:ring-purple-500/50 outline-none transition-all"
              maxLength={100}
            />
          </div>

          {/* Search */}
          <div className="space-y-4">
            <div className="flex items-center justify-between ml-1">
              <label className="text-xs font-bold text-purple-400 uppercase tracking-widest">Участники</label>
              {selectedMembers.length > 0 && (
                <span className="text-xs font-bold text-indigo-400">Выбрано: {selectedMembers.length}</span>
              )}
            </div>
            
            <div className="relative">
              <input
                type="text"
                placeholder="🔍 Поиск контакта..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full px-5 py-3.5 rounded-2xl bg-white/3 border border-white/5 text-white/80 placeholder-white/10 text-sm focus:border-purple-500/30 outline-none transition-all"
              />
            </div>

            <div className="space-y-1 pr-2">
              {filteredContacts.map(contact => {
                const isSelected = selectedMembers.includes(contact.id);
                return (
                  <div
                    key={contact.id}
                    onClick={() => toggleMember(contact.id)}
                    className={`flex items-center gap-4 p-3 rounded-2xl cursor-pointer transition-all ${
                      isSelected ? 'bg-purple-500/20 shadow-lg shadow-purple-500/5 border border-purple-500/20' : 'hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <div className="relative flex-shrink-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm shadow-md">
                        {contact.name.charAt(0).toUpperCase()}
                      </div>
                      {isSelected && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 border-2 border-[#1a142e] rounded-full flex items-center justify-center text-[10px]">✓</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-white/90 truncate">{contact.name}</div>
                      <div className="text-[11px] text-white/40">{contact.phoneNumber}</div>
                    </div>
                  </div>
                );
              })}

              {filteredContacts.length === 0 && (
                <div className="py-10 text-center space-y-2 opacity-30">
                  <div className="text-3xl">🏜️</div>
                  <div className="text-xs font-medium uppercase tracking-tighter">Контакты не найдены</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-6 border-t border-white/5 space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3 text-red-400 text-xs animate-shake">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}
          
          <div className="flex gap-3">
            <button
              onClick={handleCreate}
              disabled={creating || !groupName.trim()}
              className="flex-[2] py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold rounded-2xl transition-all shadow-xl active:scale-95 text-sm"
            >
              {creating ? '⏳ Создание...' : '✓ Создать группу'}
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-4 hover:bg-white/5 text-white/40 font-bold rounded-2xl transition-all text-sm border border-transparent hover:border-white/10"
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CreateGroupChat;
