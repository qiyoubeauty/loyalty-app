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

export const isDemo = !firebaseConfig.apiKey || firebaseConfig.apiKey === 'PASTE_HERE';
