// src/firebase.js

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import {
  browserSessionPersistence,
  getAuth,
  initializeAuth,
} from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);

const isBrowser = typeof window !== "undefined" && typeof window.document !== "undefined";

const clearPersistedAuthState = () => {
  if (!isBrowser) return;
  try {
    const storage = window.localStorage;
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (!key) continue;
      if (
        key.startsWith("firebase:authUser:") ||
        key.startsWith("firebase:refreshToken:")
      ) {
        storage.removeItem(key);
      }
    }
  } catch (storageError) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("Unable to clear persisted Firebase auth state", storageError);
    }
  }
};

let authInstance;

if (isBrowser) {
  clearPersistedAuthState();
  try {
    authInstance = initializeAuth(app, {
      persistence: browserSessionPersistence,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("initializeAuth failed, falling back to default persistence", error);
    }
    authInstance = getAuth(app);
  }
  if (window.location.hostname === "localhost") {
    window.auth = authInstance;
  }
} else {
  authInstance = getAuth(app);
}

export const auth = authInstance;
