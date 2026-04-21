/**
 * DEVICE BINDING MODULE
 * 
 * Generates a unique device fingerprint based on browser/hardware characteristics.
 * Registers the device with the backend and tracks trusted devices.
 */

import { hashSHA256, arrayToHex } from './webcrypto';

export interface DeviceInfo {
  fingerprint: string;
  deviceName: string;
  platform: string;
}

/**
 * Generate a device fingerprint from browser characteristics.
 * Uses canvas fingerprinting, WebGL info, and navigator properties.
 */
export async function generateDeviceFingerprint(): Promise<DeviceInfo> {
  const components: string[] = [];

  // Navigator properties
  components.push(navigator.userAgent);
  components.push(navigator.language);
  components.push(String(navigator.hardwareConcurrency || 0));
  components.push(String(screen.width) + 'x' + String(screen.height));
  components.push(String(screen.colorDepth));
  components.push(Intl.DateTimeFormat().resolvedOptions().timeZone);

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

  // WebGL info
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl && gl instanceof WebGLRenderingContext) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        components.push(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '');
        components.push(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '');
      }
    }
  } catch {
    components.push('webgl-unavailable');
  }

  // Hash everything
  const combined = components.join('|');
  const data = new TextEncoder().encode(combined);
  const hash = await hashSHA256(data);
  const fingerprint = arrayToHex(hash);

  // Detect platform
  const platform = detectPlatform();
  const deviceName = generateDeviceName();

  return { fingerprint, deviceName, platform };
}

/**
 * Register device with the backend.
 */
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

/**
 * Validate current device with the backend.
 */
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
