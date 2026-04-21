import { useState, useEffect } from 'react';
import { Smile, Sticker, Search, History, Cloud, Plus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';

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
    name: 'Fluent 3D ✨',
    stickers: [
      'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Smiling%20face%20with%20heart-eyes/3D/smiling_face_with_heart-eyes_3d.png',
      'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Heart%20with%20ribbon/3D/heart_with_ribbon_3d.png',
      'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Partying%20face/3D/partying_face_3d.png',
      'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Rocket/3D/rocket_3d.png',
      'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Fire/3D/fire_3d.png',
      'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Alien/3D/alien_3d.png',
      'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Robot/3D/robot_3d.png',
      'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Sparkles/3D/sparkles_3d.png',
    ]
  },
  {
    name: 'Animals 🐾',
    stickers: [
      'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Fox/3D/fox_3d.png',
      'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Cat%20face/3D/cat_face_3d.png',
      'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Dog%20face/3D/dog_face_3d.png',
      'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Rabbit%20face/3D/rabbit_face_3d.png',
      'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Panda/3D/panda_3d.png',
      'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Bear/3D/bear_3d.png',
      'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Tiger%20face/3D/tiger_face_3d.png',
      'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Lion/3D/lion_3d.png',
    ]
  },
  {
    name: 'Food & Drink 🍕',
    stickers: [
      'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Pizza/3D/pizza_3d.png',
      'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Hamburger/3D/hamburger_3d.png',
      'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Taco/3D/taco_3d.png',
      'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Doughnut/3D/doughnut_3d.png',
      'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Cookie/3D/cookie_3d.png',
      'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Ice%20cream/3D/ice_cream_3d.png',
      'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Hot%20beverage/3D/hot_beverage_3d.png',
      'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Beer%20mug/3D/beer_mug_3d.png',
    ]
  }
];

export default function EmojiStickerPicker({ onEmojiSelect, onStickerSelect, isOpen, onClose }: EmojiStickerPickerProps) {
  const { apiRequest } = useAuth();
  const [activeTab, setActiveTab] = useState<'emoji' | 'sticker'>('emoji');
  const [searchQuery, setSearchQuery] = useState('');
  const [myStickers, setMyStickers] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen && activeTab === 'sticker') {
      fetchMyStickers();
    }
  }, [isOpen, activeTab]);

  const fetchMyStickers = async () => {
    try {
      const resp = await apiRequest('/stickers/my');
      if (resp.ok) {
        const data = await resp.json();
        // Construct URLs for each sticker (using relative path to work with proxy)
        const urls = (data || []).map((m: any) => `/uploads/${m.uploaderId}/${m.fileName}`);
        setMyStickers(urls);
      }
    } catch (err) {
      console.error('Failed to fetch stickers:', err);
    }
  };

  const [importPackName, setImportPackName] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const handleImportPack = async () => {
    if (!importPackName) return;
    setIsImporting(true);
    try {
      // Extract pack name from link if needed (handles trailing slashes and full URLs)
      let name = importPackName.trim();
      if (name.endsWith('/')) name = name.slice(0, -1);
      name = name.split('/').pop() || name;
      name = name.split('set=').pop() || name;

      const resp = await apiRequest('/stickers/import-set', {
        method: 'POST',
        body: JSON.stringify({ packName: name })
      });
      if (resp.ok) {
        toast.success('Импорт запущен! Загляните через пару секунд.');
        setImportPackName('');
        setTimeout(fetchMyStickers, 3000);
      } else {
        toast.error('Пак не найден');
      }
    } catch (err) {
      toast.error('Ошибка импорта');
    } finally {
      setIsImporting(false);
    }
  };

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
            {/* Import Input */}
            <div className="space-y-3 bg-white/5 p-4 rounded-2xl border border-white/5">
              <h4 className="text-[9px] font-black text-purple-400 uppercase tracking-widest">Импорт из Telegram</h4>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ссылка на пак или название"
                  value={importPackName}
                  onChange={(e) => setImportPackName(e.target.value)}
                  className="flex-1 bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-[10px] text-white focus:ring-1 focus:ring-purple-500 outline-none"
                />
                <button
                  onClick={handleImportPack}
                  disabled={isImporting}
                  className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white p-2 rounded-xl transition-all"
                >
                  {isImporting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus size={16} />}
                </button>
              </div>
            </div>

            {myStickers.length > 0 && (
              <div className="space-y-4">
                <h4 className="text-[9px] font-black text-purple-400 uppercase tracking-[0.2em] px-1 flex items-center gap-2">
                   <Cloud size={10} />
                   My Stickers (TG Import)
                </h4>
                <div className="grid grid-cols-4 gap-2">
                  {myStickers.map((url, idx) => (
                    <button
                      key={`my-${idx}`}
                      onClick={() => onStickerSelect(url)}
                      className="aspect-square relative group active:scale-90 transition-transform"
                    >
                      <img 
                        src={url} 
                        alt="My Sticker" 
                        className="w-full h-full object-contain group-hover:drop-shadow-[0_0_10px_rgba(168,85,247,0.5)] transition-all"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
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
