import { Users, MessageCircle, X, Smartphone } from 'lucide-react';
import { SyncedContact } from '../services/ContactSyncService';

interface ContactSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  results: SyncedContact[];
  onStartChat: (user: any) => void;
}

export default function ContactSyncModal({ isOpen, onClose, results, onStartChat }: ContactSyncModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="glass w-full max-w-md rounded-[40px] overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-300 border border-white/10">
        {/* Header */}
        <div className="p-8 bg-gradient-to-br from-green-500/20 to-emerald-600/20 border-b border-white/5 relative">
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 p-2 hover:bg-white/10 rounded-full transition-colors text-white/40"
          >
            <X size={20} />
          </button>
          
          <div className="w-16 h-16 bg-green-500 rounded-3xl flex items-center justify-center text-white mb-4 shadow-lg shadow-green-900/40">
            <Users size={32} />
          </div>
          <h3 className="text-2xl font-black text-white tracking-tight">Друзья найдены!</h3>
          <p className="text-white/40 text-xs font-medium mt-1 uppercase tracking-widest">Результаты синхронизации</p>
        </div>

        {/* Content */}
        <div className="max-h-[400px] overflow-y-auto p-6 custom-scrollbar space-y-3">
          {results.length === 0 ? (
            <div className="py-12 text-center">
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/5">
                <Smartphone size={24} className="text-white/20" />
              </div>
              <p className="text-white/40 font-bold text-sm">Новых контактов не найдено</p>
            </div>
          ) : (
            results.map(user => (
              <div key={user.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 group hover:bg-white/10 transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-green-500 to-emerald-600 flex items-center justify-center font-bold text-white shadow-lg">
                    {user.username?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <p className="font-bold text-white text-sm">{user.username}</p>
                    <p className="text-[10px] text-white/30 font-mono">{user.phoneNumber}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    onStartChat(user);
                    onClose();
                  }}
                  className="p-3 bg-green-500 text-white rounded-xl hover:scale-110 active:scale-95 transition-all shadow-lg shadow-green-900/20"
                >
                  <MessageCircle size={18} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-white/2 border-t border-white/5">
          <button
            onClick={onClose}
            className="w-full py-4 bg-white/5 hover:bg-white/10 text-white font-black rounded-2xl transition-all uppercase tracking-widest text-[10px] border border-white/5"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
