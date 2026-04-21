import React, { useState } from 'react';

interface BlockedUser {
  id: string;
  username: string;
  phoneNumber: string;
  blockedAt: Date;
  reason?: string;
}

interface BlockListProps {
  blockedUsers: BlockedUser[];
  onUnblock: (userId: string) => void;
  privacySettings: {
    blockUnknown: boolean;
    blockByDefault: boolean;
    allowContactsOnly: boolean;
  };
  onUpdatePrivacy: (settings: BlockListProps['privacySettings']) => void;
}

export const BlockList: React.FC<BlockListProps> = ({
  blockedUsers,
  onUnblock,
  privacySettings,
  onUpdatePrivacy,
}) => {
  const [activeTab, setActiveTab] = useState<'blocked' | 'settings'>('blocked');
  const [showUnblockConfirm, setShowUnblockConfirm] = useState<string | null>(null);

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="bg-white/5 rounded-xl border border-white/20">
      {/* Tabs */}
      <div className="flex border-b border-white/10">
        <button
          onClick={() => setActiveTab('blocked')}
          className={`flex-1 py-3 px-4 text-sm font-bold transition-colors ${
            activeTab === 'blocked'
              ? 'text-white border-b-2 border-purple-500'
              : 'text-purple-300 hover:text-white'
          }`}
        >
          🚫 Заблокированные
          {blockedUsers.length > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-red-500/20 text-red-300 rounded-full text-xs">
              {blockedUsers.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 py-3 px-4 text-sm font-bold transition-colors ${
            activeTab === 'settings'
              ? 'text-white border-b-2 border-purple-500'
              : 'text-purple-300 hover:text-white'
          }`}
        >
          🔒 Настройки приватности
        </button>
      </div>

      {/* Blocked Users Tab */}
      {activeTab === 'blocked' && (
        <div className="p-4">
          {blockedUsers.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">✅</div>
              <div className="text-white font-bold mb-2">Нет заблокированных пользователей</div>
              <div className="text-purple-300 text-sm">
                Все ваши контакты могут писать вам сообщения
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {blockedUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-lg">
                      🚫
                    </div>
                    <div>
                      <div className="font-bold text-white">{user.username}</div>
                      <div className="text-sm text-purple-300">{user.phoneNumber}</div>
                      <div className="text-xs text-purple-400">
                        Заблокирован {formatDate(user.blockedAt)}
                        {user.reason && ` • ${user.reason}`}
                      </div>
                    </div>
                  </div>

                  {showUnblockConfirm === user.id ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowUnblockConfirm(null)}
                        className="px-3 py-1.5 text-sm text-purple-300 hover:text-white transition-colors"
                      >
                        Отмена
                      </button>
                      <button
                        onClick={() => {
                          onUnblock(user.id);
                          setShowUnblockConfirm(null);
                        }}
                        className="px-3 py-1.5 text-sm bg-green-500 hover:bg-green-600 text-white rounded transition-colors"
                      >
                        Разблокировать
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowUnblockConfirm(user.id)}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm"
                    >
                      Разблокировать
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {blockedUsers.length > 0 && (
            <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <div className="text-sm text-yellow-300">
                <span className="font-bold">💡 Примечание:</span> Заблокированные пользователи не могут:
                <ul className="mt-1 ml-4 space-y-0.5 text-yellow-200">
                  <li>• Отправлять вам сообщения</li>
                  <li>• Видеть ваш онлайн-статус</li>
                  <li>• Звонить вам</li>
                  <li>• Добавлять вас в группы</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Privacy Settings Tab */}
      {activeTab === 'settings' && (
        <div className="p-4 space-y-4">
          <div className="bg-purple-500/10 rounded-lg p-4 border border-purple-500/30">
            <h4 className="font-bold text-white mb-3">🔐 Контроль входящих сообщений</h4>
            
            <div className="space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={privacySettings.blockUnknown}
                  onChange={(e) =>
                    onUpdatePrivacy({ ...privacySettings, blockUnknown: e.target.checked })
                  }
                  className="mt-1 w-4 h-4 accent-purple-500"
                />
                <div>
                  <div className="font-bold text-white">Блокировать незнакомцев</div>
                  <div className="text-sm text-purple-300">
                    Не принимать сообщения от пользователей, которых нет в ваших контактах
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={privacySettings.blockByDefault}
                  onChange={(e) =>
                    onUpdatePrivacy({ ...privacySettings, blockByDefault: e.target.checked })
                  }
                  className="mt-1 w-4 h-4 accent-purple-500"
                />
                <div>
                  <div className="font-bold text-white">Тихая блокировка по умолчанию</div>
                  <div className="text-sm text-purple-300">
                    Новые контакты автоматически блокируются до вашего подтверждения
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={privacySettings.allowContactsOnly}
                  onChange={(e) =>
                    onUpdatePrivacy({ ...privacySettings, allowContactsOnly: e.target.checked })
                  }
                  className="mt-1 w-4 h-4 accent-purple-500"
                />
                <div>
                  <div className="font-bold text-white">Только избранные контакты</div>
                  <div className="text-sm text-purple-300">
                    Только контакты из избранного могут писать вам
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div className="bg-red-500/10 rounded-lg p-4 border border-red-500/30">
            <h4 className="font-bold text-red-300 mb-2 flex items-center gap-2">
              <span>⚠️</span>
              Внимание
            </h4>
            <p className="text-red-200 text-sm">
              При включении строгих настроек приватности вы можете пропустить важные сообщения 
              от новых контактов. Рекомендуется регулярно проверять запросы на добавление.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

// Quick block button component for chat
interface QuickBlockButtonProps {
  userId: string;
  username: string;
  onBlock: (userId: string, reason?: string) => void;
  isBlocked: boolean;
}

export const QuickBlockButton: React.FC<QuickBlockButtonProps> = ({
  userId,
  username,
  onBlock,
  isBlocked,
}) => {
  const [showConfirm, setShowConfirm] = useState(false);
  const [reason, setReason] = useState('');

  if (isBlocked) {
    return (
      <button
        disabled
        className="px-3 py-1.5 bg-red-500/20 text-red-300 rounded-lg text-sm opacity-50 cursor-not-allowed"
      >
        🚫 Заблокирован
      </button>
    );
  }

  if (showConfirm) {
    return (
      <div className="absolute right-0 top-8 bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-3 z-50 w-64">
        <div className="text-white font-bold mb-2">Заблокировать {username}?</div>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Причина (необязательно)"
          className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm mb-2 placeholder-purple-400"
        />
        <div className="flex gap-2">
          <button
            onClick={() => setShowConfirm(false)}
            className="flex-1 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm"
          >
            Отмена
          </button>
          <button
            onClick={() => {
              onBlock(userId, reason || undefined);
              setShowConfirm(false);
            }}
            className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm"
          >
            Заблокировать
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setShowConfirm(true)}
      className="px-3 py-1.5 bg-white/10 hover:bg-red-500/20 text-white hover:text-red-300 rounded-lg text-sm transition-colors"
    >
      🚫 Заблокировать
    </button>
  );
};
