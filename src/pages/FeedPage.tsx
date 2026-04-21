import React, { useState, useEffect, useMemo } from 'react';
import { SocialPost } from '../components/SocialPost';
import { User } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import ForwardModal from '../components/ForwardModal';

interface FeedPageProps {
  currentUser: User;
  contacts: User[];
  onSign: (data: any) => Promise<string>;
}

export const FeedPage: React.FC<FeedPageProps> = ({ currentUser, contacts, onSign }) => {
  const { apiRequest } = useAuth();
  const [activeFilter, setActiveFilter] = useState<'all' | 'friends'>('all');
  const [posts, setPosts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newPostContent, setNewPostContent] = useState('');
  const [forwardingPost, setForwardingPost] = useState<any | null>(null);

  useEffect(() => {
    loadFeed();
  }, []);

  const loadFeed = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest('/social/feed');
      const data = await response.json();
      const postsArray = Array.isArray(data) ? data : data.posts;
      if (Array.isArray(postsArray)) {
        setPosts(postsArray);
      }
    } catch (error) {
      console.error('Failed to load feed', error);
      toast.error('Не удалось загрузить ленту');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreatePost = async () => {
    if (!newPostContent.trim()) return;
    
    try {
      // ✍️ Sign the post content
      const signature = await onSign(newPostContent);
      
      const response = await apiRequest('/social/posts', {
        method: 'POST',
        body: JSON.stringify({ 
          content: newPostContent,
          signature: signature
        }),
      });
      
      if (response.ok) {
        toast.success('Пост опубликован!');
        setNewPostContent('');
        loadFeed(); // Reload to see the new post
      }
    } catch (error) {
      toast.error('Ошибка публикации');
    }
  };

  const handleReport = async (targetId: string) => {
    const reason = prompt('Укажите причину жалобы:');
    if (!reason) return;
    
    try {
      await apiRequest('/reports', {
        method: 'POST',
        body: JSON.stringify({ targetId, reason })
      });
      toast.success('Жалоба отправлена модераторам');
    } catch (e) {
      toast.error('Не удалось отправить жалобу');
    }
  };

  const handleForward = async (chatId: string) => {
    if (!forwardingPost) return;
    try {
      await apiRequest(`/chats/${chatId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          content: `📢 Пересланный пост от @${forwardingPost.authorName}:\n\n${forwardingPost.content}\n\n🔗 ${window.location.origin}/posts/${forwardingPost.id}`,
          type: 'text'
        })
      });
    } catch (e) {
      throw e;
    }
  };

  const handleRepost = async () => {
    if (!forwardingPost) return;
    try {
      const response = await apiRequest('/social/posts', {
        method: 'POST',
        body: JSON.stringify({ 
          content: `🔄 Репост от @${forwardingPost.authorName}:\n\n${forwardingPost.content}`,
          mediaUrls: forwardingPost.mediaUrls
        })
      });
      if (response.ok) {
        loadFeed();
      } else {
        throw new Error();
      }
    } catch (e) {
      throw e;
    }
  };

  const filteredPosts = useMemo(() => {
    let result = posts;
    if (activeFilter === 'friends') {
      const friendIds = contacts.map(c => c.id);
      result = posts.filter(p => p.isSystem || friendIds.includes(p.authorId) || p.authorId === currentUser.id);
    }
    return [...result].sort((a, b) => (b.isSystem ? 1 : 0) - (a.isSystem ? 1 : 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [posts, activeFilter, contacts, currentUser]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 pb-24 animate-in fade-in duration-500">
      {/* Filter Tabs */}
      <div className="flex gap-4 mb-8">
        <button
          onClick={() => setActiveFilter('all')}
          className={`flex-1 py-3 rounded-2xl font-bold transition-all shadow-lg ${
            activeFilter === 'all' 
              ? 'bg-purple-600 text-white' 
              : 'glass text-white/50 hover:text-white'
          }`}
        >
          🌐 Весь мир
        </button>
        <button
          onClick={() => setActiveFilter('friends')}
          className={`flex-1 py-3 rounded-2xl font-bold transition-all shadow-lg ${
            activeFilter === 'friends' 
              ? 'bg-purple-600 text-white' 
              : 'glass text-white/50 hover:text-white'
          }`}
        >
          👥 Только друзья
        </button>
      </div>

      {/* Create Post Area */}
      <div className="glass rounded-[32px] p-6 mb-8 shadow-2xl border border-white/5">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
          <span className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-lg">✍️</span>
          Поделись мыслями
        </h2>
        
        <textarea
          className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white placeholder-white/20 focus:ring-2 focus:ring-purple-500/50 transition-all outline-none resize-none"
          placeholder="Что у тебя на уме?"
          rows={3}
          value={newPostContent}
          onChange={(e) => setNewPostContent(e.target.value)}
        />
        
        <div className="flex justify-end mt-4">
          <button
            onClick={handleCreatePost}
            disabled={!newPostContent.trim()}
            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white px-8 py-3 rounded-2xl font-bold shadow-xl shadow-purple-900/20 transition-all active:scale-95"
          >
            Опубликовать
          </button>
        </div>
      </div>

      {/* Feed */}
      <div className="space-y-6">
        {isLoading ? (
          <div className="flex flex-col items-center py-20 opacity-20 animate-pulse">
            <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mb-4"></div>
            <p>Загрузка ленты...</p>
          </div>
        ) : (
          filteredPosts.map(post => {
            const isFriend = contacts.some(c => c.id === post.authorId);
            return (
              <div key={post.id} className={post.isSystem ? 'border-2 border-purple-500/30 rounded-[34px] p-0.5' : ''}>
                <SocialPost 
                  onReport={handleReport}
                  onForward={(p) => setForwardingPost(p)}
                  post={{
                    ...post,
                    isFriend,
                    authorName: post.authorName || 'Аноним',
                    createdAt: new Date(post.createdAt).getTime()
                  }} 
                />
              </div>
            );
          })
        )}
        
        {!isLoading && filteredPosts.length === 0 && (
          <div className="text-center py-20">
             <div className="text-6xl mb-4 opacity-20">🤫</div>
             <p className="text-white/30 font-bold">Здесь пока тихо. Будь первым!</p>
          </div>
        )}
      </div>

      <ForwardModal 
        isOpen={!!forwardingPost}
        onClose={() => setForwardingPost(null)}
        onForward={handleForward}
        onRepost={handleRepost}
        contacts={contacts}
      />
    </div>
  );
};
