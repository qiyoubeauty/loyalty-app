// ─────────────────────────────────────────────────────────────────────────────
// Firebase settings — paste the values from:
// Firebase console → Project settings (⚙) → General → Your apps → Web app → "SDK setup and configuration" → Config
//
// While apiKey still says "PASTE_HERE" the app runs in DEMO MODE: everything
// works, but data is only saved in this browser on this device.
// ─────────────────────────────────────────────────────────────────────────────
export const firebaseConfig = {
  apiKey: 'PASTE_HERE',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

export const isDemo = !firebaseConfig.apiKey || firebaseConfig.apiKey === 'PASTE_HERE';
