import { hashSHA256, arrayToHex } from './webcrypto';
import { Device } from '@capacitor/device';

export interface DeviceInfo {
  fingerprint: string;
  deviceName: string;
  platform: string;
}

export async function generateDeviceFingerprint(): Promise<DeviceInfo> {
  const components: string[] = [];
  let platform = 'web';
  let deviceName = 'Browser';
  let deviceId = '';

  try {
    const info = await Device.getInfo();
    const id = await Device.getId();
    platform = info.platform;
    deviceName = `${info.manufacturer} ${info.model}`;
    deviceId = id.identifier;
    components.push(deviceId);
    components.push(platform);
    components.push(deviceName);
  } catch (e) {
    // Fallback for non-capacitor environments
    components.push(navigator.userAgent);
    components.push(navigator.language);
    platform = detectPlatform();
    deviceName = generateDeviceName();
  }

  // Canvas fingerprint
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('SecureNet-FP', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('SecureNet-FP', 4, 17);
      components.push(canvas.toDataURL());
    }
  } catch {
    components.push('canvas-unavailable');
  }

  // Hash everything
  const combined = components.join('|');
  const data = new TextEncoder().encode(combined);
  const hash = await hashSHA256(data);
  const fingerprint = arrayToHex(hash);

  return { fingerprint, deviceName, platform };
}

export async function registerDevice(
  apiRequest: (url: string, options?: RequestInit) => Promise<Response>,
  deviceInfo: DeviceInfo
): Promise<{ device: unknown; isNew: boolean; trusted: boolean }> {
  const response = await apiRequest('/devices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceName: deviceInfo.deviceName,
      platform: deviceInfo.platform,
      fingerprint: deviceInfo.fingerprint,
    }),
  });

  return await response.json();
}

export async function validateDevice(
  apiRequest: (url: string, options?: RequestInit) => Promise<Response>,
  fingerprint: string
): Promise<{ known: boolean; trusted: boolean }> {
  const response = await apiRequest('/devices/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fingerprint }),
  });

  return await response.json();
}

function detectPlatform(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('android')) return 'android';
  if (ua.includes('iphone') || ua.includes('ipad')) return 'ios';
  if (ua.includes('windows')) return 'windows';
  if (ua.includes('macintosh') || ua.includes('mac os')) return 'macos';
  if (ua.includes('linux')) return 'linux';
  return 'web';
}

function generateDeviceName(): string {
  const platform = detectPlatform();
  const browser = detectBrowser();
  return `${platform}-${browser}`;
}

function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('Edg')) return 'Edge';
  return 'Browser';
}
