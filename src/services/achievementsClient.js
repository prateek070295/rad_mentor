// src/services/achievementsClient.js
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";

import { db } from "../firebase";

export const listenToAchievementMeta = (uid, callback) => {
  if (!uid) return () => {};
  const metaRef = doc(db, "users", uid);
  return onSnapshot(
    metaRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }
      callback(snapshot.data() || null);
    },
    (error) => {
      console.error("listenToAchievementMeta error:", error);
      callback(null);
    },
  );
};

export const listenToUserAchievements = (uid, callback) => {
  if (!uid) return () => {};
  const achievementsRef = collection(db, "users", uid, "achievements");
  const q = query(achievementsRef, orderBy("targetValue", "asc"));
  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() || {}),
      }));
      callback(rows);
    },
    (error) => {
      console.error("listenToUserAchievements error:", error);
      callback([]);
    },
  );
};

export const fetchAchievementDefinitions = async () => {
  const snap = await getDocs(collection(db, "achievements_definitions"));
  return snap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() || {}),
  }));
};
