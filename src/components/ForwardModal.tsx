import { useState } from 'react';
import { User } from '../types';
import toast from 'react-hot-toast';

interface ForwardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onForward: (chatId: string) => Promise<void>;
  onRepost: () => Promise<void>;
  contacts: User[];
}

export default function ForwardModal({ isOpen, onClose, onForward, onRepost, contacts }: ForwardModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sending, setSending] = useState<string | null>(null);
  const [reposting, setReposting] = useState(false);

  if (!isOpen) return null;

  const filteredContacts = contacts.filter(c =>
    c.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-fadeIn">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={onClose}
      ></div>
      
      {/* Modal Content */}
      <div className="relative w-full max-w-md glass rounded-[32px] border border-white/10 shadow-2xl overflow-hidden animate-scaleIn flex flex-col max-h-[80vh]">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-500 to-emerald-500"></div>
        
        {/* Header */}
        <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white tracking-tight">
            📤 Поделиться постом
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-xl text-white/40 hover:text-white/60 transition-all"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 custom-scrollbar">
          {/* Repost Option */}
          <button
            onClick={async () => {
              setReposting(true);
              await onRepost();
              setReposting(false);
              onClose();
            }}
            disabled={reposting}
            className="w-full group relative overflow-hidden p-5 bg-gradient-to-br from-purple-500/10 to-indigo-500/10 hover:from-purple-500/20 hover:to-indigo-500/20 rounded-3xl border border-white/5 transition-all text-left"
          >
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/20">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              </div>
              <div>
                <div className="font-black text-white tracking-tight">Опубликовать в ленте</div>
                <div className="text-[11px] text-white/40 font-bold uppercase tracking-widest mt-0.5">Репост от вашего имени</div>
              </div>
            </div>
            {reposting && <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px] flex items-center justify-center">⏳</div>}
          </button>

          <div className="h-px bg-white/5"></div>

          {/* Forward to Chat */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <label className="text-xs font-black text-white/30 uppercase tracking-[0.2em]">Переслать в чат</label>
            </div>
            
            <div className="relative">
              <input
                type="text"
                placeholder="Поиск контакта..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full px-5 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-white/80 placeholder-white/10 text-sm focus:border-green-500/30 outline-none transition-all"
              />
            </div>

            <div className="space-y-1">
              {filteredContacts.map(contact => (
                <div
                  key={contact.id}
                  className="flex items-center gap-4 p-3 rounded-2xl hover:bg-white/5 transition-all group"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-green-500 to-emerald-500 flex items-center justify-center text-white font-bold text-sm shadow-md">
                    {contact.username?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white/90 truncate">{contact.username || 'Аноним'}</div>
                  </div>
                  <button
                    onClick={async () => {
                      setSending(contact.id);
                      await onForward(contact.id);
                      setSending(null);
                      toast.success(`Отправлено ${contact.username || 'пользователю'}`);
                    }}
                    disabled={!!sending}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-black text-white/60 hover:text-green-400 transition-all active:scale-95 disabled:opacity-30"
                  >
                    {sending === contact.id ? '⏳' : 'Отправить'}
                  </button>
                </div>
              ))}

              {filteredContacts.length === 0 && (
                <div className="py-10 text-center opacity-20">
                  <div className="text-xs font-bold uppercase tracking-widest">Никого не найдено</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-6 border-t border-white/5">
          <button
            onClick={onClose}
            className="w-full py-4 rounded-2xl font-bold text-white/40 hover:text-white/60 hover:bg-white/5 transition-all text-sm border border-white/5"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
