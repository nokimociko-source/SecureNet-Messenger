import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.catlover.messenger',
  appName: 'Catlover',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
