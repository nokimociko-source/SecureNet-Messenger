import { useState, useEffect } from 'react';
import {
  Users, ShieldAlert, BarChart3, Trash2, ShieldCheck,
  UserMinus, MessageSquare, ArrowLeft, Search,
  AlertTriangle, CheckCircle2, LayoutDashboard,
  History
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

type TabType = 'overview' | 'users' | 'reports' | 'content' | 'audit';

export default function AdminPanel({ onBack }: { onBack: () => void }) {
  const { apiRequest } = useAuth();
  const [currentTab, setCurrentTab] = useState<TabType>('overview');
  const [stats, setStats] = useState({ totalUsers: 0, activeConnections: 0, messagesToday: 0 });
  const [weeklyActivity, setWeeklyActivity] = useState<{ labels: string[], values: number[] }>({ labels: [], values: [] });
  const [users, setUsers] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [currentTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (currentTab === 'overview') await loadStats();
      if (currentTab === 'users') await loadUsers();
      if (currentTab === 'reports') await loadReports();
      if (currentTab === 'content') await loadPosts();
      if (currentTab === 'audit') await loadAudit();
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const [statsRes, activityRes] = await Promise.all([
        apiRequest('/audit/stats'),
        apiRequest('/audit/activity/weekly')
      ]);
      const statsData = await statsRes.json();
      const activityData = await activityRes.json();
      setStats(statsData);
      setWeeklyActivity(activityData);
    } catch (e) {
      setStats({ totalUsers: 1250, activeConnections: 42, messagesToday: 8900 });
      setWeeklyActivity({ 
        labels: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
        values: [120, 250, 180, 450, 320, 150, 280]
      });
    }
  };

  const loadUsers = async () => {
    try {
      const res = await apiRequest('/users/search?q=');
      const data = await res.json();
      if (Array.isArray(data)) setUsers(data);
    } catch (e) { console.error(e); }
  };

  const loadReports = async () => {
    try {
      const res = await apiRequest('/admin/reports');
      const data = await res.json();
      if (Array.isArray(data)) setReports(data);
    } catch (e) { console.error(e); }
  };

  const loadPosts = async () => {
    try {
      const res = await apiRequest('/admin/posts');
      const data = await res.json();
      if (Array.isArray(data)) setPosts(data);
    } catch (e) { console.error(e); }
  };

  const loadAudit = async () => {
    try {
      const res = await apiRequest('/audit/logs?limit=50');
      const data = await res.json();
      if (data && Array.isArray(data.entries)) setAuditLogs(data.entries);
    } catch (e) { console.error(e); }
  };

  const handleResolveReport = async (id: string, status: string) => {
    try {
      await apiRequest(`/admin/reports/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, resolution: 'Action taken by admin' })
      });
      toast.success('Жалоба обновлена');
      loadReports();
    } catch (e) { toast.error('Ошибка'); }
  };

  const handleDeletePost = async (id: string) => {
    if (!confirm('Удалить этот пост навсегда?')) return;
    try {
      await apiRequest(`/admin/posts/${id}`, { method: 'DELETE' });
      toast.success('Пост удален');
      loadPosts();
    } catch (e) { toast.error('Ошибка при удалении'); }
  };

  const handleClearLogs = async () => {
    if (!confirm('Вы уверены, что хотите безвозвратно удалить все логи аудита?')) return;
    try {
      await apiRequest('/admin/audit/cleanup', { method: 'DELETE' });
      toast.success('Логи успешно очищены');
      loadAudit();
    } catch (e) {
      toast.error('Ошибка при очистке логов');
    }
  };

  const handleClearMediaCache = async () => {
    if (!confirm('Это действие удалит все загруженные медиафайлы. Продолжить?')) return;
    try {
      await apiRequest('/admin/media/cache', { method: 'DELETE' });
      toast.success('Кэш медиа очищен');
    } catch (e) {
      toast.error('Ошибка при очистке кэша');
    }
  };

  const NavItem = ({ tab, icon: Icon, label }: { tab: TabType, icon: any, label: string }) => (
    <button
      onClick={() => setCurrentTab(tab)}
      className={`flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b-2 transition-all duration-300 ${currentTab === tab
          ? 'border-purple-500 text-purple-400 bg-purple-500/5'
          : 'border-transparent text-white/40 hover:text-white hover:bg-white/5'
        }`}
    >
      <Icon size={16} className="sm:w-[18px] sm:h-[18px]" />
      <span className="font-bold text-[10px] sm:text-sm uppercase tracking-[0.15em] sm:tracking-widest whitespace-nowrap">{label}</span>
    </button>
  );

  const StatCard = ({ icon: Icon, title, value, color }: any) => (
    <div className="bg-white/2 border border-white/5 p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-xl">
      <div className={`p-2 sm:p-3 rounded-xl sm:rounded-2xl ${color} w-fit mb-3 sm:mb-4`}>
        <Icon size={20} className="sm:w-6 sm:h-6" />
      </div>
      <p className="text-white/40 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest">{title}</p>
      <p className="text-2xl sm:text-3xl font-black text-white mt-0.5 sm:mt-1">{value || 0}</p>
    </div>
  );

  return (
    <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full animate-in fade-in duration-500 overflow-hidden">
      {/* Admin Header */}
      <div className="p-6 border-b border-white/5 bg-purple-600/5 flex items-center justify-between backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-all text-purple-400">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
              <ShieldCheck className="text-purple-400" /> SecureNet Admin
            </h2>
            <p className="text-[10px] text-purple-400/60 uppercase font-bold tracking-widest">Global Management Suite</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-full">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs font-bold text-green-400">Online</span>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-white/5 bg-white/1 overflow-x-auto custom-scrollbar no-scrollbar scroll-smooth">
        <div className="flex min-w-max">
          <NavItem tab="overview" icon={LayoutDashboard} label="Обзор" />
          <NavItem tab="users" icon={Users} label="Люди" />
          <NavItem tab="reports" icon={ShieldAlert} label="Жалобы" />
          <NavItem tab="content" icon={MessageSquare} label="Контент" />
          <NavItem tab="audit" icon={History} label="Аудит" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8 custom-scrollbar">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {!loading && currentTab === 'overview' && (
          <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatCard icon={Users} title="Всего пользователей" value={stats.totalUsers} color="bg-blue-500/10 text-blue-400" />
              <StatCard icon={BarChart3} title="Активные сессии" value={stats.activeConnections} color="bg-purple-500/10 text-purple-400" />
              <StatCard icon={MessageSquare} title="Сообщений сегодня" value={stats.messagesToday} color="bg-orange-500/10 text-orange-400" />
            </div>

            <div className="bg-white/2 border border-white/5 p-4 sm:p-8 rounded-2xl sm:rounded-[32px]">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-sm sm:text-lg font-bold text-white tracking-tight">Активность за неделю</h3>
                <select className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-[10px] text-white outline-none">
                  <option>Последние 7 дней</option>
                  <option>Последние 30 дней</option>
                </select>
              </div>
              <div className="h-48 flex items-end gap-1.5 sm:gap-3 px-2 sm:px-4">
                {weeklyActivity.values.map((val, i) => {
                  const max = Math.max(...weeklyActivity.values, 1);
                  const height = (val / max) * 100;
                  return (
                    <div key={i} className="flex-1 group relative">
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-white/10 px-2 py-1 rounded text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 font-bold">
                        {val} msg
                      </div>
                      <div
                        className="w-full bg-gradient-to-t from-purple-600 to-indigo-400 rounded-t-xl transition-all duration-500 group-hover:from-purple-500 group-hover:to-pink-400"
                        style={{ height: `${height}%` }}
                      ></div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-4 px-2 sm:px-4 text-[8px] sm:text-[10px] font-bold text-white/20 uppercase tracking-widest">
                {weeklyActivity.labels.map(label => <span key={label}>{label}</span>)}
              </div>
            </div>
          </div>
        )}

        {!loading && currentTab === 'users' && (
          <div className="bg-white/2 border border-white/5 rounded-2xl sm:rounded-[32px] overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
            <div className="p-4 sm:p-6 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between bg-white/1 gap-4">
              <h3 className="font-bold text-white flex items-center gap-2 uppercase text-[10px] sm:text-xs tracking-widest">
                База пользователей
              </h3>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={14} />
                <input
                  type="text"
                  placeholder="Поиск по нику..."
                  className="bg-black/40 border border-white/10 rounded-full py-2 pl-9 pr-4 text-xs text-white focus:ring-2 focus:ring-purple-500 outline-none w-full"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left min-w-[600px]">
                <thead>
                  <tr className="text-[10px] uppercase font-bold text-white/20 border-b border-white/5 bg-white/1">
                    <th className="p-6">Имя</th>
                    <th className="p-6">Контакты</th>
                    <th className="p-6">Роль</th>
                    <th className="p-6">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {users.filter(u => u.username.toLowerCase().includes(searchQuery.toLowerCase())).map(user => (
                    <tr key={user.id} className="hover:bg-white/2 transition-colors group">
                      <td className="p-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center font-bold text-white">
                            {user.username[0].toUpperCase()}
                          </div>
                          <span className="font-bold text-white">{user.username}</span>
                        </div>
                      </td>
                      <td className="p-6 text-xs text-white/40">{user.phoneNumber}</td>
                      <td className="p-6">
                        <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${user.role === 'admin' ? 'bg-purple-500/20 text-purple-400' : 'bg-white/5 text-white/30'}`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="p-6">
                        <button onClick={() => toast.error('Нет прав')} className="p-2 hover:bg-rose-500/20 text-rose-400 rounded-lg transition-all">
                          <UserMinus size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && currentTab === 'reports' && (
          <div className="grid grid-cols-1 gap-6 animate-in slide-in-from-bottom-4 duration-500">
            {reports.length === 0 && (
              <div className="text-center py-20 bg-white/2 border border-white/5 rounded-[32px]">
                <ShieldCheck className="mx-auto text-white/10 mb-4" size={48} />
                <p className="text-white/40 font-bold tracking-widest uppercase text-xs">Жалоб пока нет</p>
              </div>
            )}
            {reports.map(report => (
              <div key={report.id} className="bg-white/2 border border-white/5 p-4 sm:p-6 rounded-2xl sm:rounded-[32px] flex flex-col sm:flex-row sm:items-start justify-between group hover:border-purple-500/30 transition-all gap-4">
                <div className="flex gap-4 sm:gap-6">
                  <div className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl flex-shrink-0 h-fit ${report.status === 'pending' ? 'bg-amber-500/10 text-amber-500' : 'bg-green-500/10 text-green-500'}`}>
                    {report.status === 'pending' ? <AlertTriangle size={20} className="sm:w-6 sm:h-6" /> : <CheckCircle2 size={20} className="sm:w-6 sm:h-6" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                      <span className="text-white/40 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest">Тикет #{report.id.slice(0, 8)}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] font-bold uppercase ${report.status === 'pending' ? 'bg-amber-500 text-black' : 'bg-green-500 text-black'}`}>
                        {report.status}
                      </span>
                    </div>
                    <h4 className="text-white font-bold mb-1 text-sm sm:text-base truncate">
                      Жалоба на <span className="text-purple-400">@{report.targetName}</span>
                    </h4>
                    <p className="text-white/60 text-xs sm:text-sm mb-3 sm:mb-4 line-clamp-2">{report.reason}</p>
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-[8px] sm:text-[10px] font-bold text-white/20 uppercase tracking-widest">
                      <span>От: {report.reporterName}</span>
                      <span className="hidden sm:inline">•</span>
                      <span>{format(new Date(report.createdAt), 'dd.MM HH:mm', { locale: ru })}</span>
                    </div>
                  </div>
                </div>
                {report.status === 'pending' && (
                  <div className="flex sm:flex-col lg:flex-row gap-2 sm:opacity-0 group-hover:opacity-100 transition-opacity mt-2 sm:mt-0">
                    <button onClick={() => handleResolveReport(report.id, 'resolved')} className="flex-1 sm:flex-none px-4 py-2 bg-green-500/10 hover:bg-green-500 text-green-500 hover:text-black rounded-xl text-[10px] font-bold uppercase transition-all">
                      Решить
                    </button>
                    <button onClick={() => handleResolveReport(report.id, 'ignored')} className="flex-1 sm:flex-none px-4 py-2 bg-white/5 hover:bg-white/10 text-white/40 rounded-xl text-[10px] font-bold uppercase transition-all">
                      Игнор
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!loading && currentTab === 'content' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-bottom-4 duration-500">
            {posts.map(post => (
              <div key={post.id} className="bg-white/2 border border-white/5 rounded-[32px] overflow-hidden flex flex-col hover:border-rose-500/30 transition-all group">
                <div className="p-6 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-bold text-xs text-white">
                      {post.username[0]}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white tracking-tight">@{post.username}</p>
                      <p className="text-[9px] text-white/30 uppercase font-bold tracking-widest">
                        {format(new Date(post.createdAt), 'dd MMM HH:mm', { locale: ru })}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => handleDeletePost(post.id)} className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all">
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="p-6 flex-1">
                  <p className="text-xs text-white/60 leading-relaxed mb-4 line-clamp-3">
                    {post.content}
                  </p>
                  {post.mediaUrls && post.mediaUrls.length > 0 && (
                    <div className="flex gap-2">
                      {post.mediaUrls.slice(0, 3).map((url: string, i: number) => (
                        <div key={i} className="flex-1 aspect-square rounded-xl overflow-hidden bg-black/40">
                          <img src={url} alt="" className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && currentTab === 'audit' && (
          <div className="bg-white/2 border border-white/5 rounded-2xl sm:rounded-[32px] overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/1">
              <h3 className="font-bold text-white flex items-center gap-2 uppercase text-xs tracking-widest">
                Логи безопасности
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] uppercase font-bold text-white/20 border-b border-white/5 bg-white/1">
                    <th className="p-6">Время</th>
                    <th className="p-6">Действие</th>
                    <th className="p-6">Ресурс</th>
                    <th className="p-6 hidden sm:table-cell">Детали</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {auditLogs.map((log, i) => (
                    <tr key={log.id || i} className="hover:bg-white/2 transition-colors">
                      <td className="p-6 text-[10px] font-mono text-white/40 whitespace-nowrap">
                        {format(new Date(log.timestamp), 'dd.MM HH:mm')}
                      </td>
                      <td className="p-6">
                        <span className={`px-2 py-1 rounded-md text-[9px] font-bold uppercase whitespace-nowrap ${log.severity === 'high' ? 'bg-rose-500/20 text-rose-500' : 'bg-blue-500/20 text-blue-500'}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="p-6 text-xs text-white/60 font-bold whitespace-nowrap">{log.resource}</td>
                      <td className="p-6 text-[10px] text-white/30 font-mono truncate max-w-[200px] hidden sm:table-cell">
                        {JSON.stringify(log.details)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Global Danger Zone */}
        <div className="p-6 sm:p-8 bg-rose-500/5 border border-rose-500/10 rounded-2xl sm:rounded-[40px] mt-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-rose-500/20 rounded-xl">
              <ShieldAlert className="text-rose-500" size={20} />
            </div>
            <div>
              <h4 className="font-bold text-rose-500 tracking-tight text-sm sm:text-base">Терминал критических операций</h4>
              <p className="text-[9px] sm:text-[10px] text-rose-500/50 uppercase font-bold tracking-widest">Danger Zone</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <button onClick={handleClearLogs} className="flex-1 sm:flex-none px-6 py-3 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-rose-500/20">
              Очистка логов
            </button>
            <button onClick={handleClearMediaCache} className="flex-1 sm:flex-none px-6 py-3 bg-white/5 hover:bg-white/10 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/10">
              Сброс кэша
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
