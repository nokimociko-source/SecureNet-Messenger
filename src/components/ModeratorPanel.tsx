import { useState } from 'react';
import { Report } from '../types';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface ModeratorPanelProps {
  reports: Report[];
  moderatorName: string;
}

export const ModeratorPanel: React.FC<ModeratorPanelProps> = ({ reports, moderatorName: _moderatorName }) => {
  const [activeTab, setActiveTab] = useState<'reports' | 'my-work'>('reports');
  const [filterStatus, setFilterStatus] = useState<Report['status'] | 'all'>('all');
  const [myProcessedCount, setMyProcessedCount] = useState(0);

  const filteredReports = filterStatus === 'all' 
    ? reports 
    : reports.filter(r => r.status === filterStatus);

  const myReports = reports.filter(r => 
    r.status !== 'pending' && r.status !== 'dismissed'
  );

  const getStatusBadge = (status: Report['status']) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded">На рассмотрении</span>;
      case 'reviewed':
        return <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">В работе</span>;
      case 'resolved':
        return <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">Решено</span>;
      case 'dismissed':
        return <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded">Отклонено</span>;
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Панель модератора</h2>
            <p className="text-sm text-gray-500">Ограниченный доступ • Назначен администратором</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-lg">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
              <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
            </svg>
            <span className="font-semibold">Модератор</span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="p-3 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{myProcessedCount}</div>
            <div className="text-sm text-blue-700">Обработано вами</div>
          </div>
          <div className="p-3 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">{reports.filter(r => r.status === 'pending').length}</div>
            <div className="text-sm text-yellow-700">Ожидают</div>
          </div>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('reports')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'reports' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Жалобы ({reports.filter(r => r.status === 'pending').length})
          </button>
          <button
            onClick={() => setActiveTab('my-work')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'my-work' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Мои действия ({myReports.length})
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'reports' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setFilterStatus('all')}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  filterStatus === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Все ({reports.length})
              </button>
              <button
                onClick={() => setFilterStatus('pending')}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  filterStatus === 'pending' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Новые ({reports.filter(r => r.status === 'pending').length})
              </button>
              <button
                onClick={() => setFilterStatus('reviewed')}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  filterStatus === 'reviewed' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                В работе ({reports.filter(r => r.status === 'reviewed').length})
              </button>
            </div>

            {/* Reports list */}
            {filteredReports.map((report) => (
              <div key={report.id} className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900">@{report.reportedUsername}</h3>
                      {getStatusBadge(report.status)}
                    </div>
                    <p className="text-sm text-gray-600">
                      Причина: <span className="font-medium text-red-600">{report.reason}</span>
                    </p>
                  </div>
                  <span className="text-xs text-gray-500">
                    {format(report.createdAt, 'dd.MM.yyyy HH:mm', { locale: ru })}
                  </span>
                </div>

                <div className="mb-3 p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-700">{report.description}</p>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    Отправитель: <span className="font-medium">ID {report.reporterId}</span>
                  </span>

                  {report.status === 'pending' && (
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setMyProcessedCount(c => c + 1)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                      >
                        Взять в работу
                      </button>
                      <button className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium">
                        Отклонить
                      </button>
                    </div>
                  )}

                  {report.status === 'reviewed' && (
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setMyProcessedCount(c => c + 1)}
                        className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors font-medium"
                      >
                        ⚠️ Предупреждение
                      </button>
                      <button 
                        onClick={() => setMyProcessedCount(c => c + 1)}
                        className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium"
                      >
                        🚫 Временный бан (24ч)
                      </button>
                      <button 
                        onClick={() => setMyProcessedCount(c => c + 1)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                      >
                        ✅ Решено
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {filteredReports.length === 0 && (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-lg font-medium">Нет жалоб в этой категории</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'my-work' && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-700">
                Здесь отображаются жалобы, которые вы взяли в работу или обработали.
                Перманентные блокировки и серьёзные нарушения требуют подтверждения администратора.
              </p>
            </div>

            {myReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-lg font-medium">Вы пока не обработали ни одной жалобы</p>
                <p className="text-sm">Начните с вкладки "Жалобы"</p>
              </div>
            ) : (
              myReports.map((report) => (
                <div key={report.id} className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900">@{report.reportedUsername}</h3>
                        {getStatusBadge(report.status)}
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600">{report.reason}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer warning */}
      <div className="p-3 bg-yellow-50 border-t border-yellow-200">
        <p className="text-xs text-yellow-700 text-center">
          ⚠️ Ограниченные права: Вы не можете просматривать аналитику, аудит-логи и управлять другими модераторами. 
          Перманентные блокировки требуют подтверждения администратора.
        </p>
      </div>
    </div>
  );
};
