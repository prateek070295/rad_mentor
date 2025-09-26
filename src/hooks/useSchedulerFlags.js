// src/hooks/useSchedulerFlags.js
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase"; // your existing Firestore init

const DEFAULT_FLAGS = {
  useStudyItemsView: false,
  useMasterPlan: false,
  useWeeklyPlanner: false,
  useSpacedReviews: false,
  dailyCapacityMinsDefault: 270,
};

export function useSchedulerFlags() {
  const [flags, setFlags] = useState(DEFAULT_FLAGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = doc(db, "config", "scheduler");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setFlags({ ...DEFAULT_FLAGS, ...data });
        } else {
          setFlags(DEFAULT_FLAGS);
        }
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  return { flags, loading };
}
