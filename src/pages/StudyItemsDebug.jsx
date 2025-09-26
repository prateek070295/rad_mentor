// src/pages/StudyItemsDebug.jsx
import { useEffect, useState } from "react";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { computePriority, byPriorityDesc } from "../lib/priority";

export default function StudyItemsDebug() {
  const [bySection, setBySection] = useState([]);
  const [globalTop, setGlobalTop] = useState([]);
  const [rankedTop, setRankedTop] = useState([]);

  useEffect(() => {
    (async () => {
      // Example 1: within one section (edit "Breast" if you like)
      const q1 = query(
        collection(db, "study_items"),
        where("section", "==", "Breast"),
        orderBy("categoryNorm", "desc"),
        orderBy("foundational", "desc"),
        orderBy("estimatedMinutes", "desc"),
        limit(15)
      );
      const s1 = await getDocs(q1);
      setBySection(s1.docs.map(d => ({ id: d.id, ...d.data() })));

      // Example 2: global ordering (no section filter)
      const q2 = query(
        collection(db, "study_items"),
        orderBy("categoryNorm", "desc"),
        orderBy("foundational", "desc"),
        orderBy("estimatedMinutes", "desc"),
        limit(15)
      );
      const s2 = await getDocs(q2);
      setGlobalTop(s2.docs.map(d => ({ id: d.id, ...d.data() })));

      // Example 3: client-side "priority" ranking on a sample of 200 docs
      const qAll = query(collection(db, "study_items"), limit(200)); // sample; increase if you want
      const sAll = await getDocs(qAll);
      const all = sAll.docs.map(d => ({ id: d.id, ...d.data() }));
      const ranked = [...all].sort(byPriorityDesc).slice(0, 20);
      setRankedTop(ranked);
    })();
  }, []);

  return (
    <div style={{ maxWidth: 900, margin: "24px auto", padding: 16 }}>
      <h2>study_items debug</h2>
      <p style={{ color: "#666" }}>Read-only sanity check. No writes.</p>

      <h3 style={{ marginTop: 16 }}>Top (section = Breast)</h3>
      <pre style={{ background: "#f6f6f6", padding: 12, borderRadius: 8, overflowX: "auto" }}>
        {JSON.stringify(bySection, null, 2)}
      </pre>

      <h3 style={{ marginTop: 16 }}>Top (global by fields)</h3>
      <pre style={{ background: "#f6f6f6", padding: 12, borderRadius: 8, overflowX: "auto" }}>
        {JSON.stringify(globalTop, null, 2)}
      </pre>

      <h3 style={{ marginTop: 16 }}>Top by Priority (client-side, sample of 200)</h3>
      <pre style={{ background: "#f6f6f6", padding: 12, borderRadius: 8, overflowX: "auto" }}>
        {JSON.stringify(
          rankedTop.map(x => ({ ...x, _score: computePriority(x) })),
          null,
          2
        )}
      </pre>
    </div>
  );
}
