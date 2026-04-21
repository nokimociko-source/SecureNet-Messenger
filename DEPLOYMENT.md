# 🚀 Deployment Guide - SecureNet

## Overview

SecureNet is built as a **Progressive Web App (PWA)** which means it works across all platforms:
- ✅ **Web** - Any modern browser
- ✅ **Android** - Install as native-like app
- ✅ **Windows** - Install as desktop app
- ✅ **iOS/macOS** - Via Safari (limited PWA support)
- ✅ **Linux** - Via Chrome/Firefox

---

## 📱 Platform-Specific Instructions

### 🌐 Web (All Platforms)

#### Option 1: Development Server
```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open browser to http://localhost:5173
```

#### Option 2: Production Build
```bash
# Build for production
npm run build

# Preview production build
npm run preview

# Open browser to http://localhost:4173
```

#### Option 3: Deploy to Web Server
```bash
# Build
npm run build

# Deploy dist/index.html to any static hosting:
# - Netlify
# - Vercel
# - GitHub Pages
# - AWS S3 + CloudFront
# - Nginx
# - Apache
```

---

### 📱 Android Installation

#### Method 1: Install from Browser (Recommended)
1. Open Chrome on Android
2. Navigate to your SecureNet URL
3. Tap menu (⋮) → "Add to Home Screen"
4. App icon appears on home screen
5. Launch like any native app!

**Features:**
- ✅ Full screen mode
- ✅ Push notifications
- ✅ Offline support
- ✅ Hardware-backed encryption
- ✅ No app store needed

#### Method 2: Chrome PWA Installer
1. Open site in Chrome
2. Look for "Install SecureNet" banner at bottom
3. Tap "Install"
4. Done!

#### Method 3: Generate APK (Advanced)
```bash
# Use Bubblewrap or PWABuilder
npm install -g @bubblewrap/cli

# Generate APK
bubblewrap init --manifest https://your-domain.com/manifest.json
bubblewrap build

# Install APK
adb install app-release-signed.apk
```

---

### 💻 Windows Installation

#### Method 1: Install from Edge (Recommended)
1. Open Microsoft Edge
2. Navigate to your SecureNet URL
3. Click install icon in address bar (⊕)
4. Click "Install"
5. App appears in Start Menu!

**Features:**
- ✅ Native window
- ✅ Desktop notifications
- ✅ Start menu integration
- ✅ Taskbar pinning
- ✅ Auto-updates

#### Method 2: Install from Chrome
1. Open Chrome
2. Navigate to site
3. Click menu (⋮) → "Install SecureNet"
4. App installed to desktop

#### Method 3: Native Tauri App (Future)
```bash
# Coming in Phase 3
npm run tauri build
```

---

### 🍎 iOS Installation (Limited)

⚠️ **Note:** iOS has limited PWA support (no push notifications)

1. Open Safari on iPhone/iPad
2. Navigate to your SecureNet URL
3. Tap share button (□↑)
4. Tap "Add to Home Screen"
5. App icon appears on home screen

**Limitations:**
- ❌ No push notifications
- ❌ Limited background sync
- ⚠️ Some features may not work

---

### 🐧 Linux Installation

#### Method 1: Chrome/Chromium
```bash
# Open Chrome
google-chrome https://your-domain.com

# Click install icon or menu → Install SecureNet
```

#### Method 2: Firefox
```bash
# Firefox doesn't support PWA installation yet
# Use as web app or create desktop shortcut manually
```

#### Method 3: Create Desktop Entry
```bash
# Create .desktop file
cat > ~/.local/share/applications/securenet.desktop << EOF
[Desktop Entry]
Name=SecureNet
Comment=Military-Grade Encrypted Messenger
Exec=google-chrome --app=https://your-domain.com
Icon=/path/to/icon-512.png
Type=Application
Categories=Network;InstantMessaging;
EOF

# Make executable
chmod +x ~/.local/share/applications/securenet.desktop
```

---

## 🔧 Configuration

### Environment Variables

Create `.env` file:

```bash
# API Endpoint (if using backend)
VITE_API_URL=https://api.securenet.example

# Push Notification Keys
VITE_VAPID_PUBLIC_KEY=your_vapid_public_key

# Feature Flags
VITE_ENABLE_ANALYTICS=false
VITE_ENABLE_CRASH_REPORTING=false

# Security
VITE_CSP_ENABLED=true
VITE_HSTS_ENABLED=true
```

### manifest.json Customization

Edit `public/manifest.json`:

```json
{
  "name": "SecureNet",
  "short_name": "SecureNet",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#6366f1",
  "background_color": "#ffffff"
}
```

---

## 🌍 Hosting Options

### Option 1: Netlify (Easiest)

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Build
npm run build

# Deploy
netlify deploy --prod --dir=dist
```

**Features:**
- ✅ Free SSL/TLS
- ✅ Global CDN
- ✅ Auto-deploy from Git
- ✅ Serverless functions

### Option 2: Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

### Option 3: GitHub Pages

```bash
# Build
npm run build

# Deploy to gh-pages branch
npm install -g gh-pages
gh-pages -d dist
```

### Option 4: Self-Hosted (Nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name securenet.example.com;

    # SSL Configuration
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ssl_protocols TLSv1.3;
    
    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
    
    # CSP Header
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.securenet.example wss://api.securenet.example;" always;

    # PWA Support
    location /sw.js {
        add_header Cache-Control "no-cache";
        expires off;
    }

    location /manifest.json {
        add_header Cache-Control "public, max-age=3600";
    }

    # Static Files
    root /var/www/securenet/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Gzip Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
}
```

---

## 🔒 Security Checklist

### Pre-Deployment

- [ ] Enable HTTPS (required for PWA)
- [ ] Configure CSP headers
- [ ] Enable HSTS
- [ ] Set secure cookies
- [ ] Configure CORS properly
- [ ] Disable directory listing
- [ ] Remove source maps in production
- [ ] Enable rate limiting
- [ ] Configure WAF

### Post-Deployment

- [ ] Test PWA installation
- [ ] Verify service worker registration
- [ ] Test offline mode
- [ ] Verify push notifications
- [ ] Run security audit (npm audit)
- [ ] Test on all target platforms
- [ ] Monitor error logs
- [ ] Set up uptime monitoring

---

## 📊 Monitoring

### Analytics (Privacy-Friendly)

```typescript
// Use Plausible or Simple Analytics (no cookies, GDPR compliant)
// Add to index.html:
<script defer data-domain="securenet.example.com" src="https://plausible.io/js/plausible.js"></script>
```

### Error Tracking

```typescript
// Sentry (self-hosted recommended)
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "https://your-dsn@sentry.io/project-id",
  environment: "production",
  beforeSend(event) {
    // Never send sensitive data
    delete event.request?.cookies;
    delete event.request?.headers;
    return event;
  },
});
```

### Uptime Monitoring

- UptimeRobot (free)
- StatusCake
- Pingdom
- Self-hosted (Uptime Kuma)

---

## 🔄 Updates & Maintenance

### Service Worker Updates

Users get automatic updates when new version deployed:

```typescript
// In sw.js
const CACHE_VERSION = 'v1.0.1'; // Increment on update

// Users will get update notification
// Can force update or notify user
```

### Database Migrations

```typescript
// IndexedDB version upgrade
const DB_VERSION = 2; // Increment to trigger migration

openDB('SecureNetVault', DB_VERSION, {
  upgrade(db, oldVersion, newVersion) {
    if (oldVersion < 2) {
      // Migration logic
      db.createObjectStore('newStore', { keyPath: 'id' });
    }
  },
});
```

---

## 🧪 Testing in Production

### PWA Audit

```bash
# Lighthouse CLI
npm install -g lighthouse

# Run audit
lighthouse https://securenet.example.com --view

# Should score 90+ in PWA category
```

### Browser DevTools

1. Open DevTools
2. Go to "Application" tab
3. Check:
   - ✅ Service Worker registered
   - ✅ Manifest valid
   - ✅ Cache populated
   - ✅ IndexedDB working

---

## 📱 Platform-Specific Features

### Android

**Available:**
- ✅ Push notifications (FCM)
- ✅ Background sync
- ✅ Add to home screen
- ✅ Offline mode
- ✅ Camera access
- ✅ File upload

**Not Available:**
- ❌ Bluetooth
- ❌ NFC
- ❌ Advanced biometrics (without native wrapper)

### Windows

**Available:**
- ✅ Desktop notifications
- ✅ File system access
- ✅ Clipboard access
- ✅ Offline mode
- ✅ Auto-launch on startup (Edge)

**Not Available:**
- ❌ System tray integration (without Tauri)
- ❌ Global hotkeys (without Tauri)

---

## 🚨 Troubleshooting

### PWA Not Installing

**Problem:** Install button doesn't appear

**Solution:**
1. Check HTTPS is enabled
2. Verify manifest.json is valid
3. Ensure service worker is registered
4. Check browser console for errors

### Service Worker Not Updating

**Problem:** Users don't get new version

**Solution:**
```typescript
// Force update on page load
navigator.serviceWorker.getRegistration().then(reg => {
  reg?.update();
});
```

### Push Notifications Not Working

**Problem:** Notifications not delivered

**Solution:**
1. Check permissions granted
2. Verify VAPID keys correct
3. Test with simple notification first
4. Check browser notification settings

---

## 📞 Support

- **Documentation:** https://docs.securenet.example
- **Issues:** https://github.com/securenet/securenet/issues
- **Discord:** https://discord.gg/securenet
- **Email:** support@securenet.example

---

## ✅ Deployment Checklist

### Development
- [ ] Code reviewed
- [ ] Tests passing
- [ ] Security audit clean
- [ ] Performance tested
- [ ] Accessibility checked

### Staging
- [ ] Deployed to staging environment
- [ ] QA testing completed
- [ ] Cross-browser testing done
- [ ] Mobile testing done
- [ ] Load testing passed

### Production
- [ ] Database backed up
- [ ] DNS configured
- [ ] SSL certificate valid
- [ ] CDN configured
- [ ] Monitoring active
- [ ] Rollback plan ready
- [ ] Team notified
- [ ] Changelog published

---

**Last Updated:** 2026-01-15  
**Version:** 1.0.0

🚀 **Ready to deploy SecureNet!**
