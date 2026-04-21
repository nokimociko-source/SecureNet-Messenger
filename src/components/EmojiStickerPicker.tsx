import { useState } from 'react';
import { Smile, Sticker, Search, History } from 'lucide-react';

interface EmojiStickerPickerProps {
  onEmojiSelect: (emoji: string) => void;
  onStickerSelect: (stickerUrl: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

const EMOJI_CATEGORIES = {
  'Recently': ['😊', '😂', '❤️', '👍', '🔥', '✨', '🤔', '👀'],
  'Smileys': ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖'],
  'Gestures': ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪'],
  'Hearts': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟']
};

const STICKER_PACKS = [
  {
    name: 'Catlover 3D',
    stickers: [
      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f600/512.webp',
      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f607/512.webp',
      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f60d/512.webp',
      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f929/512.webp',
      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f618/512.webp',
      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f60b/512.webp',
      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f61b/512.webp',
      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f911/512.webp',
      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f917/512.webp',
      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f92d/512.webp',
      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f92b/512.webp',
      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f914/512.webp',
      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f610/512.webp',
      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f634/512.webp',
      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f975/512.webp',
      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f976/512.webp',
      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f92e/512.webp',
      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f92f/512.webp',
      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f60e/512.webp',
      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f9d0/512.webp'
    ]
  },
  {
    name: 'Animals',
    stickers: [
      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f431/512.webp',
      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f436/512.webp',
      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f98a/512.webp',
      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f984/512.webp',
      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f430/512.webp',
      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f43c/512.webp'
    ]
  }
];

export default function EmojiStickerPicker({ onEmojiSelect, onStickerSelect, isOpen, onClose }: EmojiStickerPickerProps) {
  const [activeTab, setActiveTab] = useState<'emoji' | 'sticker'>('emoji');
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  return (
    <div className="absolute bottom-full right-0 mb-4 w-72 sm:w-80 h-[400px] glass rounded-[32px] border border-white/10 shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-300 z-50">
      {/* Search & Tabs */}
      <div className="p-4 border-b border-white/5 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={14} />
          <input
            type="text"
            placeholder="Поиск..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-9 pr-4 text-xs text-white placeholder-white/20 focus:ring-1 focus:ring-purple-500 outline-none transition-all"
          />
        </div>
        
        <div className="flex bg-white/5 rounded-xl p-1">
          <button
            onClick={() => setActiveTab('emoji')}
            className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'emoji' ? 'bg-white/10 text-white shadow-sm' : 'text-white/30 hover:text-white/50'}`}
          >
            <Smile size={14} />
            Emoji
          </button>
          <button
            onClick={() => setActiveTab('sticker')}
            className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'sticker' ? 'bg-white/10 text-white shadow-sm' : 'text-white/30 hover:text-white/50'}`}
          >
            <Sticker size={14} />
            Stickers
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {activeTab === 'emoji' ? (
          <div className="space-y-6">
            {Object.entries(EMOJI_CATEGORIES).map(([category, emojis]) => (
              <div key={category} className="space-y-3">
                <h4 className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] px-1 flex items-center gap-2">
                  {category === 'Recently' && <History size={10} />}
                  {category}
                </h4>
                <div className="grid grid-cols-7 sm:grid-cols-8 gap-1">
                  {emojis.map((emoji, idx) => (
                    <button
                      key={idx}
                      onClick={() => onEmojiSelect(emoji)}
                      className="aspect-square flex items-center justify-center text-xl hover:bg-white/10 rounded-lg transition-colors active:scale-90"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            {STICKER_PACKS.map((pack) => (
              <div key={pack.name} className="space-y-4">
                <h4 className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] px-1">{pack.name}</h4>
                <div className="grid grid-cols-4 gap-2">
                  {pack.stickers.map((url, idx) => (
                    <button
                      key={idx}
                      onClick={() => onStickerSelect(url)}
                      className="aspect-square relative group active:scale-90 transition-transform"
                    >
                      <img 
                        src={url} 
                        alt="Sticker" 
                        className="w-full h-full object-contain group-hover:drop-shadow-[0_0_10px_rgba(168,85,247,0.5)] transition-all"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Backdrop for closing */}
      <div className="fixed inset-0 -z-10" onClick={onClose} />
    </div>
  );
}
