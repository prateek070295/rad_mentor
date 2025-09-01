// src/firebase.js

import { initializeApp } from "firebase/app";
// ADDED: Import getFirestore and getAuth
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC42Uoy5G1dUsBsXgqF26j0SLnuIk_JvWw",
  authDomain: "radmentor-app.firebaseapp.com",
  projectId: "radmentor-app",
  storageBucket: "radmentor-app.appspot.com", // Corrected storage bucket domain
  messagingSenderId: "544597624961",
  appId: "1:544597624961:web:ce072a54b46aa1a3972580",
  measurementId: "G-0F7QQ0FP0E"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// ADDED: Initialize Firestore and Auth, then export them
export const db = getFirestore(app);
export const auth = getAuth(app);