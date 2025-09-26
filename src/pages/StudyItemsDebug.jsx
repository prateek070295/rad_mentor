import { useEffect, useState } from "react";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "../firebase";

export default function StudyItemsDebug() {
  const [bySection, setBySection] = useState([]);
  const [globalTop, setGlobalTop] = useState([]);

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

      <h3 style={{ marginTop: 16 }}>Top (global)</h3>
      <pre style={{ background: "#f6f6f6", padding: 12, borderRadius: 8, overflowX: "auto" }}>
        {JSON.stringify(globalTop, null, 2)}
      </pre>
    </div>
  );
}
