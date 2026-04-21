import { Contacts } from '@capacitor-community/contacts';

export interface SyncedContact {
  id: string;
  username: string;
  phoneNumber: string;
}

export class ContactSyncService {
  private apiRequest: (url: string, options?: any) => Promise<Response>;

  constructor(apiRequest: (url: string, options?: any) => Promise<Response>) {
    this.apiRequest = apiRequest;
  }

  async sync(): Promise<SyncedContact[]> {
    try {
      const permission = await Contacts.requestPermissions();
      if (permission.contacts !== 'granted') {
        throw new Error('Permission denied');
      }

      const result = await Contacts.getContacts({
        projection: {
          name: true,
          phones: true,
        }
      });

      const phoneNumbers = result.contacts
        .flatMap(c => c.phones || [])
        .map(p => p.number?.replace(/[^\d+]/g, ''))
        .filter((n): n is string => !!n);

      if (phoneNumbers.length === 0) return [];

      const response = await this.apiRequest('/contacts/sync', {
        method: 'POST',
        body: JSON.stringify({ phoneNumbers: Array.from(new Set(phoneNumbers)) })
      });

      if (!response.ok) throw new Error('Sync failed');
      
      const matched: SyncedContact[] = await response.json();
      return matched;
    } catch (error) {
      console.error('Contact sync error:', error);
      throw error;
    }
  }

  static isAutoSyncEnabled(): boolean {
    return localStorage.getItem('contacts_sync_enabled') === 'true';
  }

  static setAutoSync(enabled: boolean) {
    localStorage.setItem('contacts_sync_enabled', String(enabled));
  }
}
