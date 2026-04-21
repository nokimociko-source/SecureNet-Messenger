import React, { useState } from 'react';
import { Moderator } from '../types/roles';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface ModeratorManagementProps {
  moderators: Moderator[];
  adminName: string;
  onAssignModerator: (userId: string, username: string, email: string) => void;
  onRemoveModerator: (moderatorId: string, username: string) => void;
}

export const ModeratorManagement: React.FC<ModeratorManagementProps> = ({
  moderators,
  adminName,
  onAssignModerator,
  onRemoveModerator,
}) => {
  const [newModeratorEmail, setNewModeratorEmail] = useState('');
  const [newModeratorUsername, setNewModeratorUsername] = useState('');
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const handleAssign = (e: React.FormEvent) => {
    e.preventDefault();
    if (newModeratorEmail && newModeratorUsername) {
      onAssignModerator(
        `mod-${Date.now()}`,
        newModeratorUsername,
        newModeratorEmail
      );
      setNewModeratorEmail('');
      setNewModeratorUsername('');
      setShowAssignForm(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <svg className="w-6 h-6 text-purple-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
          </svg>
          <div>
            <h3 className="font-bold text-purple-900">Управление модераторами</h3>
            <p className="text-sm text-purple-700">
              Только администратор ({adminName}) может назначать и удалять модераторов.
              Модераторы имеют ограниченные права и не могут просматривать аналитику или аудит-логи.
            </p>
          </div>
        </div>
      </div>

      {/* Add moderator button */}
      <div className="flex justify-between items-center">
        <div>
          <span className="text-gray-600">Всего модераторов: </span>
          <span className="font-bold text-gray-900">{moderators.length}</span>
        </div>
        <button
          onClick={() => setShowAssignForm(!showAssignForm)}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Назначить модератора
        </button>
      </div>

      {/* Assign form */}
      {showAssignForm && (
        <form onSubmit={handleAssign} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <h4 className="font-semibold text-gray-900 mb-3">Новый модератор</h4>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                type="text"
                value={newModeratorUsername}
                onChange={(e) => setNewModeratorUsername(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                placeholder="@username"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={newModeratorEmail}
                onChange={(e) => setNewModeratorEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                placeholder="email@example.com"
                required
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              Назначить
            </button>
            <button
              type="button"
              onClick={() => setShowAssignForm(false)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Отмена
            </button>
          </div>
        </form>
      )}

      {/* Moderators list */}
      <div className="space-y-3">
        <h4 className="font-semibold text-gray-900">Активные модераторы</h4>
        
        {moderators.length === 0 ? (
          <div className="p-8 text-center text-gray-500 bg-gray-50 rounded-lg">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p>У вас пока нет назначенных модераторов</p>
          </div>
        ) : (
          moderators.map((mod) => (
            <div key={mod.id} className="p-4 border border-gray-200 rounded-lg hover:border-purple-300 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-lg">
                    {mod.avatar || '👤'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h5 className="font-semibold text-gray-900">@{mod.username}</h5>
                      {mod.isActive ? (
                        <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded">Активен</span>
                      ) : (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-800 text-xs rounded">Неактивен</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">{mod.email}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Назначен: {format(mod.assignedAt, 'dd.MM.yyyy', { locale: ru })} • 
                      Назначил: {mod.assignedBy}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm text-gray-600">
                    Обработано: <span className="font-semibold">{mod.moderationStats.reportsProcessed}</span>
                  </div>
                  <div className="text-xs text-gray-400">
                    Блокировок: {mod.moderationStats.usersBlocked} • 
                    Предупреждений: {mod.moderationStats.usersWarned}
                  </div>
                  
                  {confirmRemove === mod.id ? (
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => {
                          onRemoveModerator(mod.id, mod.username);
                          setConfirmRemove(null);
                        }}
                        className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
                      >
                        Подтвердить
                      </button>
                      <button
                        onClick={() => setConfirmRemove(null)}
                        className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 transition-colors"
                      >
                        Отмена
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmRemove(mod.id)}
                      className="mt-2 text-red-600 hover:text-red-800 text-sm font-medium"
                    >
                      Удалить права
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Moderator permissions info */}
      <div className="p-4 bg-blue-50 rounded-lg">
        <h5 className="font-semibold text-blue-900 mb-2">Права модераторов:</h5>
        <div className="grid grid-cols-2 gap-2 text-sm text-blue-800">
          <div className="flex items-center gap-1">
            <span className="text-green-600">✓</span> Просмотр жалоб
          </div>
          <div className="flex items-center gap-1">
            <span className="text-green-600">✓</span> Обработка репортов
          </div>
          <div className="flex items-center gap-1">
            <span className="text-green-600">✓</span> Временная блокировка (24ч)
          </div>
          <div className="flex items-center gap-1">
            <span className="text-green-600">✓</span> Выдача предупреждений
          </div>
          <div className="flex items-center gap-1">
            <span className="text-red-600">✗</span> Просмотр аналитики
          </div>
          <div className="flex items-center gap-1">
            <span className="text-red-600">✗</span> Управление модераторами
          </div>
          <div className="flex items-center gap-1">
            <span className="text-red-600">✗</span> Перманентные блокировки
          </div>
          <div className="flex items-center gap-1">
            <span className="text-red-600">✗</span> Просмотр аудит-логов
          </div>
        </div>
      </div>
    </div>
  );
};
