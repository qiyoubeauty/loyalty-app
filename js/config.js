// ─────────────────────────────────────────────────────────────────────────────
// Firebase settings — paste the values from:
// Firebase console → Project settings (⚙) → General → Your apps → Web app → "SDK setup and configuration" → Config
//
// While apiKey still says "PASTE_HERE" the app runs in DEMO MODE: everything
// works, but data is only saved in this browser on this device.
// ─────────────────────────────────────────────────────────────────────────────
export const firebaseConfig = {
  apiKey: 'AIzaSyDp-88WFgay3zAOhyJH8Vgg7iM_0_lIdXk',
  authDomain: 'qiyou-loyalty.firebaseapp.com',
  projectId: 'qiyou-loyalty',
  storageBucket: 'qiyou-loyalty.firebasestorage.app',
  messagingSenderId: '839055405999',
  appId: '1:839055405999:web:11c98d6a68eec0f2adb55a',
};

// Developers can force demo mode on their own computer with ?demo (never on the live site).
const localDemo = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('demo');

export const isDemo = localDemo || !firebaseConfig.apiKey || firebaseConfig.apiKey === 'PASTE_HERE';
