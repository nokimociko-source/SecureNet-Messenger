import { useState, useEffect } from 'react';
import { Search, UserPlus, MessageCircle, Users, Smartphone } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';

interface ContactsViewProps {
  contacts: any[];
  onStartChat: (user: any) => void;
  onCreateGroup: () => void;
}

export default function ContactsView({ contacts, onStartChat, onCreateGroup }: ContactsViewProps) {
  const { apiRequest } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Global search for new users
  useEffect(() => {
    const delayDebounce = setTimeout(async () => {
      if (searchQuery.length < 3) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const res = await apiRequest(`/users/search?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          // Filter out users who are already in contacts
          const contactIds = contacts.map(c => c.id);
          setSearchResults(data.filter((u: any) => !contactIds.includes(u.id)));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, contacts, apiRequest]);

  const handleAddContact = async (user: any) => {
    try {
      const res = await apiRequest('/contacts', {
        method: 'POST',
        body: JSON.stringify({ contactId: user.id })
      });
      if (res.ok) {
        toast.success(`${user.username} добавлен в контакты`);
        onStartChat(user);
      }
    } catch (e) {
      toast.error('Ошибка при добавлении');
    }
  };

  const filteredContacts = contacts.filter(c =>
    c.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phoneNumber?.includes(searchQuery)
  );

  return (
    <div className="flex-1 flex flex-col bg-[#0f0a1e] animate-in fade-in duration-300">
      {/* Header */}
      <div className="glass px-8 py-6 flex items-center justify-between border-b border-white/5">
        <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
          <Users className="text-purple-400" size={28} />
          Друзья
        </h2>
        <button
          onClick={onCreateGroup}
          className="flex items-center gap-2 px-5 py-2.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 rounded-xl font-bold text-sm transition-all border border-purple-500/20"
        >
          <UserPlus size={18} />
          Создать группу
        </button>
      </div>

      {/* Search Bar */}
      <div className="p-6">
        <div className="relative group">
          <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-white/20 group-focus-within:text-purple-400 transition-colors">
            <Search size={20} />
          </div>
          <input
            type="text"
            placeholder="Поиск по друзьям или глобально по @username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-14 pr-6 text-white placeholder-white/20 focus:ring-2 focus:ring-purple-500/50 outline-none transition-all shadow-inner"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-24 custom-scrollbar space-y-8">
        {/* Search Results (Global) */}
        {searchResults.length > 0 && (
          <div className="space-y-4 animate-in slide-in-from-top-4 duration-300">
            <h3 className="text-[10px] font-black text-purple-400/50 uppercase tracking-[0.2em] px-2">Глобальный поиск</h3>
            <div className="grid gap-2">
              {searchResults.map(user => (
                <div key={user.id} className="flex items-center justify-between p-4 bg-purple-500/5 rounded-2xl border border-purple-500/10 group hover:bg-purple-500/10 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-600 flex items-center justify-center font-bold text-white shadow-lg">
                      {user.username?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <p className="font-bold text-white">{user.username}</p>
                      <p className="text-[11px] text-white/40 font-mono">@{user.username.toLowerCase()}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleAddContact(user)}
                    className="p-3 bg-purple-500 text-white rounded-xl hover:scale-110 active:scale-95 transition-all shadow-lg shadow-purple-900/40"
                  >
                    <UserPlus size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {isSearching && (
          <div className="flex items-center justify-center py-10 opacity-30 animate-pulse">
            <p className="text-xs font-black uppercase tracking-[0.3em]">Ищем в сети...</p>
          </div>
        )}

        {/* Local Contacts */}
        <div className="space-y-4">
          <h3 className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] px-2">Мои друзья ({filteredContacts.length})</h3>
          {filteredContacts.length === 0 && !isSearching && searchResults.length === 0 && (
            <div className="py-20 text-center opacity-20">
              <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/5 shadow-inner">
                <Smartphone size={32} />
              </div>
              <p className="text-sm font-bold uppercase tracking-widest">Никого не нашли</p>
            </div>
          )}
          
          <div className="grid gap-2">
            {filteredContacts.map(contact => (
              <div
                key={contact.id}
                onClick={() => onStartChat(contact)}
                className="flex items-center justify-between p-4 bg-white/2 rounded-2xl border border-white/5 group hover:bg-white/5 cursor-pointer transition-all hover:border-purple-500/20"
              >
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-xl font-bold text-white shadow-xl group-hover:scale-105 transition-transform">
                      {contact.username?.[0] || '?'}
                    </div>
                    <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 border-4 border-[#0f0a1e] rounded-full"></div>
                  </div>
                  <div>
                    <p className="font-bold text-white text-lg group-hover:text-purple-400 transition-colors">{contact.username}</p>
                    <p className="text-xs text-white/30 font-mono">{contact.phoneNumber}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-3 bg-white/5 text-white/40 rounded-xl hover:bg-purple-500/20 hover:text-purple-400 transition-all">
                    <MessageCircle size={20} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
