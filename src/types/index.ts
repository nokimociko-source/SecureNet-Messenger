import { UserRole } from './roles';

// User types
export interface User {
  id: string;
  name: string;      
  username?: string;  
  email?: string;
  phoneNumber: string; 
  phone?: string;     
  avatar?: string;
  publicKey: any;     
  signPublicKey?: any; 
  status?: 'online' | 'offline' | 'away';
  online: boolean;    
  lastSeen?: number; // Catlover uses number (timestamp)
  twoFactorEnabled?: boolean;
  role?: UserRole | string;
  createdAt?: Date | number;
  verified: boolean;
  phoneVisibility?: 'everybody' | 'contacts' | 'nobody';
  lastSeenVisibility?: 'everybody' | 'contacts' | 'nobody';
  avatarVisibility?: 'everybody' | 'contacts' | 'nobody';
  totp_enabled?: boolean;
}

// Message types
export interface Message {
  id: string;
  sessionId: string; 
  chatId?: string;   
  senderId: string;
  content: string;
  timestamp: number; 
  createdAt?: Date;  
  type: 'text' | 'image' | 'file' | 'audio' | 'video' | 'sticker';
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  encrypted: boolean;
  fileUrl?: string;
  fileName?: string;
  mediaId?: string;
  replyTo?: string;
  reactions?: Record<string, string[]>; // Match ChatView expectations
  edited?: boolean;
  deleted?: boolean;
}

// Chat / Session types
export interface Session {
  id: string;
  contactId: string;
  contactName: string;
  sharedKey?: any;
  ratchetState?: any;
  lastMessage?: Message;
  lastMessageAt?: number;
  unreadCount: number;
  muted: boolean;
  pinned: boolean;
  verified: boolean;
  isGroup?: boolean;
  isBlocked?: boolean;
  participants?: any[];
}

// Keeping other existing types...
export interface Reaction {
  emoji: string;
  userId: string;
  username: string;
}

export interface Chat {
  id: string;
  type: 'direct' | 'group';
  name?: string;
  avatar?: string;
  participants: string[];
  lastMessage?: Message;
  unreadCount: number;
  isTyping?: string[];
  isMuted: boolean;
  isPinned: boolean;
  createdAt: Date;
}

export interface DeviceSession {
  id: string;
  deviceName: string;
  deviceType: 'web' | 'android' | 'windows' | 'ios';
  location: string;
  ipAddress: string;
  lastActive: Date;
  isCurrent: boolean;
}

export interface SecurityEvent {
  id: string;
  type: 'login' | 'logout' | 'password_change' | 'suspicious_activity' | '2fa_enabled' | '2fa_disabled';
  description: string;
  location: string;
  ipAddress: string;
  timestamp: Date;
  risk: 'low' | 'medium' | 'high';
}

export interface Report {
  id: string;
  reportedUserId: string;
  reportedUsername: string;
  reporterId: string;
  reason: string;
  description: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  createdAt: Date;
  resolvedAt?: Date;
}
