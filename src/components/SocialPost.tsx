import React, { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { AlertTriangle, Send, Heart, MessageCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import * as crypto from '../crypto/webcrypto';

interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  createdAt: string;
}

interface PostProps {
  post: {
    id: string;
    authorId: string;
    authorName: string;
    authorAvatar?: string;
    content: string;
    mediaUrls: string[];
    likeCount: number;
    commentCount: number;
    isLiked: boolean;
    createdAt: string | number;
    isSystem?: boolean;
    isFriend?: boolean;
    signature?: string;
    authorPublicKey?: string;
  };
  onReport?: (targetId: string) => void;
  onForward?: (post: any) => void;
}

export const SocialPost: React.FC<PostProps> = ({ post: initialPost, onReport, onForward }) => {
  const { apiRequest } = useAuth();
  const [post, setPost] = useState(initialPost);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isLiking, setIsLiking] = useState(false);
  const [isVerified, setIsVerified] = useState<boolean | null>(null);

  React.useEffect(() => {
    const verify = async () => {
      if (!post.signature || !post.authorPublicKey) {
        setIsVerified(false);
        return;
      }
      try {
        const pubKey = await crypto.importECDHPublicKey(JSON.parse(post.authorPublicKey));
        const sig = crypto.base64ToArray(post.signature);
        const data = new TextEncoder().encode(post.content);
        const valid = await crypto.verifyECDSA(data, sig, pubKey);
        setIsVerified(valid);
      } catch (e) {
        console.error('Signature verification error:', e);
        setIsVerified(false);
      }
    };
    verify();
  }, [post.id, post.content, post.signature, post.authorPublicKey]);

  const handleLike = async () => {
    if (isLiking) return;
    setIsLiking(true);
    try {
      const method = post.isLiked ? 'DELETE' : 'POST';
      const res = await apiRequest(`/social/posts/${post.id}/like`, { method });
      if (res.ok) {
        setPost({
          ...post,
          isLiked: !post.isLiked,
          likeCount: post.isLiked ? post.likeCount - 1 : post.likeCount + 1
        });
      }
    } catch (e) {
      toast.error('Ошибка');
    } finally {
      setIsLiking(false);
    }
  };

  const loadComments = async () => {
    try {
      const res = await apiRequest(`/social/posts/${post.id}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleComments = () => {
    if (!showComments) {
      loadComments();
    }
    setShowComments(!showComments);
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    try {
      const res = await apiRequest(`/social/posts/${post.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: newComment })
      });
      if (res.ok) {
        const comment = await res.json();
        setComments([...comments, comment]);
        setNewComment('');
        setPost({ ...post, commentCount: post.commentCount + 1 });
        toast.success('Комментарий добавлен');
      }
    } catch (e) {
      toast.error('Ошибка при отправке');
    }
  };

  return (
    <div className={`glass rounded-[32px] backdrop-blur-xl transition-all duration-300 hover:shadow-2xl hover:shadow-purple-900/10 ${post.isSystem ? 'bg-purple-600/10 border-purple-500/30' : 'hover:border-white/20'}`}>
      <div className="sticky top-0 z-30 bg-white/10 backdrop-blur-3xl border-b border-white/5 px-6 py-4 flex items-center justify-between rounded-t-[32px]">
        <div className="flex items-center">
          {post.authorAvatar ? (
            <img src={post.authorAvatar} alt="" className="w-12 h-12 rounded-full mr-4 shadow-xl object-cover border-2 border-purple-500/20" />
          ) : (
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-black mr-4 shadow-xl ${post.isSystem ? 'bg-gradient-to-tr from-yellow-400 to-orange-500 text-slate-900' : 'bg-gradient-to-tr from-indigo-500 to-purple-600'}`}>
              {post.isSystem ? '👑' : (post.authorName?.[0] || '?')}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className={`font-black tracking-tight ${post.isSystem ? 'text-purple-300' : 'text-white'}`}>
                {post.authorName || 'Аноним'}
              </span>
              {isVerified && <span title="Подпись подтверждена"><CheckCircle size={14} className="text-blue-400" /></span>}
              {!isVerified && isVerified !== null && <span title="Подпись не верна!"><AlertTriangle size={14} className="text-red-400" /></span>}
              {post.isSystem && <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest border border-purple-500/30">Официально</span>}
              {post.isFriend && <span className="w-1.5 h-1.5 bg-green-500 rounded-full" title="Ваш контакт"></span>}
            </div>
            <div className="text-[11px] font-bold text-white/30 uppercase tracking-widest">
              {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: ru })}
            </div>
          </div>
        </div>
        
        <div className="relative group/menu">
          <button className="text-white/40 hover:text-white transition-all p-2.5 rounded-2xl hover:bg-white/10 active:scale-95">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
            </svg>
          </button>
          <div className="absolute right-0 top-full pt-2 w-56 opacity-0 translate-y-4 pointer-events-none group-hover/menu:opacity-100 group-hover/menu:translate-y-0 group-hover/menu:pointer-events-auto transition-all duration-300 z-50">
            <div className="bg-[#1a1a2e]/95 backdrop-blur-3xl border border-white/20 rounded-[24px] p-2 shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/posts/${post.id}`);
                  toast.success('Ссылка скопирована');
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-[13px] font-bold text-white/70 hover:text-white hover:bg-white/10 rounded-[18px] transition-all group/item"
              >
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover/item:bg-blue-500 group-hover/item:text-white transition-all">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                </div>
                Копировать ссылку
              </button>
            <button 
              onClick={() => {
                onForward?.(post);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-[13px] font-bold text-white/70 hover:text-white hover:bg-white/10 rounded-[18px] transition-all group/item"
            >
              <div className="w-8 h-8 rounded-xl bg-green-500/10 flex items-center justify-center text-green-400 group-hover/item:bg-green-500 group-hover/item:text-white transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg>
              </div>
              Переслать
            </button>
            <button 
              onClick={() => {
                toast.success('Сохранено в избранное');
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-[13px] font-bold text-white/70 hover:text-white hover:bg-white/10 rounded-[18px] transition-all group/item"
            >
              <div className="w-8 h-8 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 group-hover/item:bg-purple-500 group-hover/item:text-white transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
              </div>
              В закладки
            </button>
            
            {onReport && (
              <button 
                onClick={() => onReport(post.authorId)}
                className="w-full flex items-center gap-3 px-4 py-3 text-[13px] font-bold text-amber-400/70 hover:text-amber-400 hover:bg-amber-500/10 rounded-[18px] transition-all group/item"
              >
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 group-hover/item:bg-amber-500 group-hover/item:text-white transition-all">
                  <AlertTriangle size={16} />
                </div>
                Пожаловаться
              </button>
            )}

            {(post.authorId !== useAuth().user?.id) && (
              <button 
                onClick={async () => {
                  try {
                    const res = await apiRequest('/social/subscribe', {
                      method: 'POST',
                      body: JSON.stringify({ targetId: post.authorId, targetType: 'user' })
                    });
                    if (res.ok) toast.success('Вы подписались на автора');
                  } catch (e) { toast.error('Ошибка подписки'); }
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-[13px] font-bold text-purple-400/70 hover:text-purple-400 hover:bg-purple-500/10 rounded-[18px] transition-all group/item"
              >
                <div className="w-8 h-8 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 group-hover/item:bg-purple-500 group-hover/item:text-white transition-all">
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"/></svg>
                </div>
                Подписаться
              </button>
            )}

            {/* Delete button only for author */}
            {(post.authorId === useAuth().user?.id) && (
               <div className="mt-1 pt-1 border-t border-white/10">
                  <button 
                    onClick={async () => {
                      if (!confirm('Удалить этот пост?')) return;
                      try {
                        const res = await apiRequest(`/social/posts/${post.id}`, { method: 'DELETE' });
                        if (res.ok) {
                          toast.success('Пост удален');
                          window.location.reload();
                        }
                      } catch (e) { toast.error('Ошибка'); }
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-[13px] font-bold text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10 rounded-[18px] transition-all group/item"
                  >
                    <div className="w-8 h-8 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-400 group-hover/item:bg-rose-500 group-hover/item:text-white transition-all">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </div>
                    Удалить пост
                  </button>
               </div>
            )}
            </div>
          </div>
        </div>
      </div>
      
      <div className="p-6">
        <p className="text-[15px] text-white/90 mb-5 whitespace-pre-wrap leading-relaxed font-medium">
          {post.content}
        </p>

        {post.mediaUrls && post.mediaUrls.length > 0 && (
          <div className="space-y-4 mb-5">
            {post.mediaUrls.map((url, idx) => {
              const ext = url.split('.').pop()?.toLowerCase();
              
              // Images
              if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
                return (
                  <div key={idx} className="rounded-3xl overflow-hidden shadow-2xl bg-black/20 border border-white/5">
                    <img src={url} alt="post media" className="w-full object-cover max-h-[500px] transition-transform duration-700 hover:scale-105" />
                  </div>
                );
              }
              
              // Videos (and Circles)
              if (['mp4', 'mov', 'webm'].includes(ext || '')) {
                const isCircle = url.includes('circle') || url.includes('round');
                if (isCircle) {
                  return (
                    <div key={idx} className="flex justify-center py-2">
                      <div className="relative w-64 h-64 rounded-full overflow-hidden border-4 border-purple-500/30 shadow-2xl group bg-black/40">
                        <video src={url} loop muted autoPlay playsInline className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-purple-900/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-4">
                          <span className="text-[9px] text-white font-black uppercase tracking-[0.2em]">Видеосообщение</span>
                        </div>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={idx} className="rounded-3xl overflow-hidden shadow-2xl bg-black border border-white/5">
                    <video src={url} controls className="w-full max-h-[500px]" />
                  </div>
                );
              }
              
              // Audio (Voice messages)
              if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext || '')) {
                return (
                  <div key={idx} className="p-5 bg-white/5 rounded-3xl border border-white/10 flex items-center gap-5 backdrop-blur-md">
                    <div className="w-12 h-12 rounded-2xl bg-purple-500/20 flex items-center justify-center text-purple-400 shadow-inner">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="text-[10px] text-white/30 uppercase font-bold tracking-widest mb-2">Голосовое сообщение</div>
                      <audio src={url} controls className="w-full h-8 opacity-40 hover:opacity-100 transition-all filter invert" />
                    </div>
                  </div>
                );
              }
              
              return null;
            })}
          </div>
        )}

        <div className="flex items-center gap-6 pt-4 border-t border-white/5">
          <button 
            onClick={handleLike}
            className={`flex items-center gap-2 transition-all duration-300 group ${post.isLiked ? 'text-rose-500' : 'text-white/40 hover:text-rose-400'}`}
          >
            <div className={`p-2.5 rounded-xl transition-all ${post.isLiked ? 'bg-rose-500/10' : 'group-hover:bg-rose-500/10'}`}>
              <Heart size={20} fill={post.isLiked ? 'currentColor' : 'none'} strokeWidth={2.5} />
            </div>
            <span className="font-bold text-sm">{post.likeCount}</span>
          </button>
          
          <button 
            onClick={toggleComments}
            className={`flex items-center gap-2 transition-all duration-300 group ${showComments ? 'text-purple-400' : 'text-white/40 hover:text-purple-400'}`}
          >
            <div className={`p-2.5 rounded-xl transition-all ${showComments ? 'bg-purple-500/10' : 'group-hover:bg-purple-500/10'}`}>
              <MessageCircle size={20} strokeWidth={2.5} />
            </div>
            <span className="font-bold text-sm">{post.commentCount > 0 ? post.commentCount : 'Обсудить'}</span>
          </button>

          {onReport && (
            <button 
              onClick={() => onReport(post.authorId)}
              className="flex items-center gap-2 text-white/20 hover:text-amber-500 transition-all duration-300 group ml-auto"
            >
              <div className="p-2.5 rounded-xl group-hover:bg-amber-500/10 transition-all">
                <AlertTriangle size={18} />
              </div>
              <span className="font-bold text-[10px] uppercase tracking-widest opacity-0 group-hover:opacity-100">Жалоба</span>
            </button>
          )}
        </div>

        {showComments && (
          <div className="mt-6 pt-6 border-t border-white/5 space-y-6 animate-in slide-in-from-top duration-300">
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 no-scrollbar">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-4">
                  {comment.authorAvatar ? (
                    <img src={comment.authorAvatar} alt="" className="w-8 h-8 rounded-full object-cover shadow-lg" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 text-[10px] font-black">
                      {comment.authorName?.[0] || '?'}
                    </div>
                  )}
                  <div className="flex-1 bg-white/5 p-4 rounded-2xl rounded-tl-none group/comment relative">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-black text-purple-300">{comment.authorName}</span>
                      <span className="text-[9px] text-white/20 font-bold uppercase">
                        {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true, locale: ru })}
                      </span>
                    </div>
                    <p className="text-sm text-white/80 pr-6">{comment.content}</p>
                    
                    {/* Delete comment button */}
                    {(comment.authorId === useAuth().user?.id || post.authorId === useAuth().user?.id) && (
                      <button 
                        onClick={async () => {
                          if (!confirm('Удалить этот комментарий?')) return;
                          try {
                            const res = await apiRequest(`/social/posts/${post.id}/comments/${comment.id}`, { method: 'DELETE' });
                            if (res.ok) {
                              setComments(comments.filter(c => c.id !== comment.id));
                              setPost({ ...post, commentCount: post.commentCount - 1 });
                              toast.success('Удалено');
                            }
                          } catch (e) { toast.error('Ошибка'); }
                        }}
                        className="absolute right-2 bottom-2 text-white/0 group-hover/comment:text-rose-500/40 hover:!text-rose-500 transition-all p-1"
                        title="Удалить комментарий"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {comments.length === 0 && (
                <div className="text-center py-4 text-white/20 text-xs font-bold uppercase tracking-widest">
                  Пока нет комментариев. Будьте первыми!
                </div>
              )}
            </div>

            <form onSubmit={handleAddComment} className="relative">
              <input 
                type="text" 
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Напишите комментарий..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm text-white focus:ring-2 focus:ring-purple-500 outline-none pr-14 transition-all"
              />
              <button 
                type="submit"
                className="absolute right-3 top-3 p-2 text-purple-400 hover:text-white transition-colors"
              >
                <Send size={18} />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
