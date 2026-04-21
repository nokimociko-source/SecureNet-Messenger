

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
      // @ts-ignore
      const isSupported = 'contacts' in navigator && 'ContactsManager' in window;
      
      let phoneNumbers: string[] = [];

      if (isSupported) {
        // @ts-ignore
        const contacts = await navigator.contacts.select(['name', 'tel'], { multiple: true });
        if (contacts.length === 0) return [];
        phoneNumbers = contacts.flatMap((c: any) => c.tel || []);
      } else {
        // Mock data for environments without Contact Picker API
        console.warn('Contact Picker API not supported, using mock data');
        phoneNumbers = ['+79001234567', '+79998887766', '+70001112233', '+79509006533'];
      }

      if (phoneNumbers.length === 0) return [];

      const response = await this.apiRequest('/contacts/sync', {
        method: 'POST',
        body: JSON.stringify({ phoneNumbers })
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
