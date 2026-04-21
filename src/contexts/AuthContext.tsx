import { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';

export const isNative = !!(window as any).__TAURI__ || !!(window as any).Capacitor;
const DEFAULT_API_URL = isNative ? 'https://yhiscizk-securenet-messenger.hf.space/api' : '/api';

// Use localStorage to persist user-defined API URL
const getApiBase = () => localStorage.getItem('custom_api_url') || DEFAULT_API_URL;

export const apiRequest = async (endpoint: string, options: RequestInit = {}): Promise<Response> => {
  const token = localStorage.getItem('token');
  const fingerprint = localStorage.getItem('deviceFingerprint');
  const API_BASE_URL = getApiBase();
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Device-Fingerprint': fingerprint || '',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout for mobile

  try {
    console.log(`🚀 API Request: ${options.method || 'GET'} ${url}`);
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.status === 401 && !url.includes('/auth/login')) {
      localStorage.removeItem('token');
      localStorage.removeItem('currentUser');
      window.location.href = '/login';
      throw new Error('Authentication expired');
    }

    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error(`❌ API Error (${url}):`, error);
    if (error.name === 'AbortError') {
      throw new Error('Сервер не отвечает. Проверьте адрес или подключение.');
    }
    throw error;
  }
};

interface AuthContextType {
  user: User | null;
  login: (phone: string, pass: string) => Promise<{ success: boolean; requires2FA?: boolean; tempToken?: string }>;
  verify2FA: (tempToken: string, code: string) => Promise<boolean>;
  register: (phone: string, user: string, pass: string, pubKey: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
  token: string | null;
  apiRequest: typeof apiRequest;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('currentUser');
    
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
  }, []);

  const login = async (phone: string, pass: string): Promise<{ success: boolean; requires2FA?: boolean; tempToken?: string }> => {
    try {
      const API_BASE_URL = getApiBase();
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone, password: pass }),
      });

      const data = await response.json();

      if (response.status === 202 && data.status === '2fa_required') {
        return { success: false, requires2FA: true, tempToken: data.token };
      }

      if (!response.ok) throw new Error(data.error || 'Login failed');

      localStorage.setItem('token', data.token);
      localStorage.setItem('currentUser', JSON.stringify(data.user));
      
      setToken(data.token);
      setUser(data.user);
      return { success: true };
    } catch (error: any) {
      console.error(error);
      return { success: false };
    }
  };

  const verify2FA = async (tempToken: string, code: string): Promise<boolean> => {
    try {
      const API_BASE_URL = getApiBase();
      const response = await fetch(`${API_BASE_URL}/auth/2fa/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tempToken, code }),
      });

      if (!response.ok) return false;

      const data = await response.json();
      localStorage.setItem('token', data.token);
      localStorage.setItem('currentUser', JSON.stringify(data.user));
      
      setToken(data.token);
      setUser(data.user);
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  };

  const register = async (phone: string, username: string, pass: string, pubKey: string): Promise<boolean> => {
    try {
      const API_BASE_URL = getApiBase();
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone, username, password: pass, publicKey: pubKey }),
      });

      if (!response.ok) throw new Error('Registration failed');

      const data = await response.json();
      localStorage.setItem('token', data.token);
      localStorage.setItem('currentUser', JSON.stringify(data.user));
      
      setToken(data.token);
      setUser(data.user);
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('currentUser');
  };

  return (
    <AuthContext.Provider value={{ user, login, verify2FA, register, logout, isAuthenticated: !!token, token, apiRequest }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
