// User roles and permissions
export type UserRole = 'user' | 'moderator' | 'admin';

export interface UserWithRole {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  avatar?: string;
  status: 'online' | 'offline' | 'away';
  twoFactorEnabled: boolean;
  createdAt: Date;
  // Moderator specific
  assignedBy?: string;        // Who made this user a moderator
  assignedAt?: Date;          // When they became moderator
  moderationCount?: number;   // How many reports they processed
  // Admin specific
  isOwner?: boolean;          // Original creator (cannot be removed)
}

// Moderator management
export interface Moderator {
  id: string;
  userId: string;
  username: string;
  email: string;
  avatar?: string;
  assignedBy: string;
  assignedAt: Date;
  isActive: boolean;
  moderationStats: {
    reportsProcessed: number;
    usersBlocked: number;
    usersWarned: number;
  };
}

// Admin actions audit
export interface AdminAction {
  id: string;
  adminId: string;
  adminUsername: string;
  action: 'assign_moderator' | 'remove_moderator' | 'system_setting' | 'view_analytics';
  targetId?: string;
  targetUsername?: string;
  details: string;
  timestamp: Date;
}

// Moderator permissions (what they CAN do)
export const MODERATOR_PERMISSIONS = [
  'view_reports',
  'process_reports',
  'block_users_temp',
  'warn_users',
  'view_users_list',
] as const;

// Admin permissions (what only admin CAN do)
export const ADMIN_PERMISSIONS = [
  ...MODERATOR_PERMISSIONS,
  'assign_moderators',
  'remove_moderators',
  'view_analytics',
  'view_audit_log',
  'block_users_permanent',
  'system_settings',
  'delete_messages_any',
  'view_all_logs',
] as const;

export type ModeratorPermission = typeof MODERATOR_PERMISSIONS[number];
export type AdminPermission = typeof ADMIN_PERMISSIONS[number];
