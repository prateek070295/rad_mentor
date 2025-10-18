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

const API_BASE = (process.env.REACT_APP_API_BASE_URL || "").replace(/\/$/, "");

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
  const endpoint = API_BASE
    ? `${API_BASE}/achievements/definitions`
    : "/api/achievements/definitions";

  try {
    const response = await fetch(endpoint, {
      headers: { "Content-Type": "application/json" },
    });

    if (response.ok) {
      const payload = await response.json();
      if (Array.isArray(payload?.definitions)) {
        return payload.definitions;
      }
    } else {
      console.warn(
        `Achievements API responded with ${response.status}. Falling back to client-side Firestore.`,
      );
    }
  } catch (httpError) {
    console.error(
      "Failed to fetch achievement definitions via API. Falling back to Firestore:",
      httpError,
    );
  }

  let docs = [];

  try {
    const primarySnap = await getDocs(collection(db, "achievements_definitions"));
    docs = primarySnap?.docs ?? [];
  } catch (primaryError) {
    console.error("Failed to read achievements_definitions:", primaryError);
  }

  if (!docs.length) {
    try {
      const fallbackSnap = await getDocs(collection(db, "achievements_defninition"));
      if (fallbackSnap?.docs?.length) {
        console.warn(
          "Loaded achievements from 'achievements_defninition'. Consider renaming the collection to 'achievements_definitions' for consistency.",
        );
        docs = fallbackSnap.docs;
      }
    } catch (fallbackError) {
      console.error("Failed to read achievements_defninition:", fallbackError);
    }
  }

  return docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() || {}),
  }));
};


