// Firebase configuration
import { initializeApp } from "firebase/app";
// Analytics (optional)
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage } from "firebase/storage";

interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

const firebaseConfig: FirebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Dev-time validation to help diagnose configuration-not-found
if (import.meta.env.DEV) {
  const missing = Object.entries(firebaseConfig)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    console.warn("[Firebase] Missing env keys:", missing.join(", "));
  }
}

// Initialize Firebase
let app;
try {
  app = initializeApp(firebaseConfig);
} catch (e) {
  console.error(
    "[Firebase] initializeApp failed. Check your .env and Vite restart.",
    e,
  );
  throw e;
}

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Connect to emulators if VITE_USE_FIREBASE_EMULATOR is true
if (String(import.meta.env.VITE_USE_FIREBASE_EMULATOR).trim() === 'true') {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  console.info("[Firebase] Connected to local Emulators for Playwright Testing.");
}

// Analytics (guarded - only runs in production browser contexts and when measurementId exists)
if (import.meta.env.PROD && firebaseConfig.measurementId) {
  isSupported().then((supported) => {
    if (supported) {
      try {
        getAnalytics(app);
        if (import.meta.env.DEV)
          console.info("[Firebase] Analytics initialized.");
      } catch (e) {
        console.warn("[Firebase] Analytics init failed:", e);
      }
    }
  });
}

// Expose effective config for debugging (API key is public in clients)
export const FIREBASE_CONFIG = firebaseConfig;

export default app;
