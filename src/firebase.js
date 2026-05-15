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

const maskApiKey = (apiKey = "") => {
  if (!apiKey) return "<missing>";
  if (apiKey.length <= 12) return "<too-short>";
  return `${apiKey.slice(0, 8)}...${apiKey.slice(-6)}`;
};

const logFirebaseConfigDiagnostics = (config) => {
  if (process.env.NODE_ENV === "production") return;

  const requiredFields = [
    "apiKey",
    "authDomain",
    "projectId",
    "storageBucket",
    "messagingSenderId",
    "appId",
  ];
  const missingFields = requiredFields.filter((field) => !config[field]);
  const warnings = [];

  if (missingFields.length) {
    warnings.push(`missing required field(s): ${missingFields.join(", ")}`);
  }

  if (
    config.projectId &&
    config.authDomain &&
    !config.authDomain.startsWith(`${config.projectId}.`)
  ) {
    warnings.push("authDomain does not match projectId");
  }

  if (
    config.projectId &&
    config.storageBucket &&
    !config.storageBucket.startsWith(`${config.projectId}.`)
  ) {
    warnings.push("storageBucket does not match projectId");
  }

  if (
    config.messagingSenderId &&
    config.appId &&
    !config.appId.startsWith(`1:${config.messagingSenderId}:`)
  ) {
    warnings.push("appId does not match messagingSenderId");
  }

  // eslint-disable-next-line no-console
  console.info("[Firebase config]", {
    projectId: config.projectId || "<missing>",
    authDomain: config.authDomain || "<missing>",
    apiKey: maskApiKey(config.apiKey),
  });

  if (warnings.length) {
    // eslint-disable-next-line no-console
    console.warn("[Firebase config warnings]", warnings);
  }
};

logFirebaseConfigDiagnostics(firebaseConfig);

// Initialize Firebase
export const firebaseApp = initializeApp(firebaseConfig);

export const db = getFirestore(firebaseApp);

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
    authInstance = initializeAuth(firebaseApp, {
      persistence: browserSessionPersistence,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("initializeAuth failed, falling back to default persistence", error);
    }
    authInstance = getAuth(firebaseApp);
  }
  if (window.location.hostname === "localhost") {
    window.auth = authInstance;
  }
} else {
  authInstance = getAuth(firebaseApp);
}

export const auth = authInstance;
