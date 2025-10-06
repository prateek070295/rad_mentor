// src/pages/TimeReport.jsx
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useSchedulerFlags } from "../hooks/useSchedulerFlags";

export default function TimeReport() {
  const { flags, loading: flagsLoading } = useSchedulerFlags();
  const [dailyCap, setDailyCap] = useState(270);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!flagsLoading && flags?.dailyCapacityMinsDefault) {
      setDailyCap(flags.dailyCapacityMinsDefault);
    }
  }, [flagsLoading, flags]);

  useEffect(() => {
    async function run() {
      setLoading(true);
      try {
        // Only chapters - they already store the rolled-up minutes
        const q = query(collection(db, "study_items"), where("level", "==", "chapter"));
        const snap = await getDocs(q);
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setRows(data);
      } finally {
        setLoading(false);
      }
    }
    run();
  }, []);

  const bySection = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const sec = r.section || "Unknown";
      const mins = Number(r.estimatedMinutes) || 0;
      const prev = m.get(sec) || { section: sec, minutes: 0, chapters: 0 };
      prev.minutes += mins;
      prev.chapters += 1;
      m.set(sec, prev);
    }
    return Array.from(m.values()).sort((a, b) => b.minutes - a.minutes);
  }, [rows]);

  const grand = useMemo(() => {
    const minutes = bySection.reduce((acc, s) => acc + s.minutes, 0);
    return { minutes, hours: minutes / 60, daysAtCap: dailyCap ? minutes / dailyCap : 0 };
  }, [bySection, dailyCap]);

  return (
    <div style={{ maxWidth: 920, margin: "24px auto", padding: 16 }}>
      <h1 style={{ marginBottom: 8 }}>Syllabus Time Report</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Sums <code>study_items</code> chapter minutes (already rolled up from topics/subtopics).
      </p>

      <div style={{ display: "flex", gap: 16, alignItems: "end", marginTop: 12 }}>
        <label>
          Daily capacity (mins)
          <input
            type="number"
            value={dailyCap}
            onChange={(e) => setDailyCap(Number(e.target.value))}
            min={30}
            step={5}
            style={{ display: "block", marginTop: 4 }}
          />
        </label>
      </div>

      {loading ? (
        <p style={{ marginTop: 16 }}>Loading...</p>
      ) : (
        <>
          <h3 style={{ marginTop: 20 }}>By Section</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Section</th>
                <th style={th}>Chapters</th>
                <th style={th}>Minutes</th>
                <th style={th}>Hours</th>
                <th style={th}>Days @ {dailyCap} min/day</th>
              </tr>
            </thead>
            <tbody>
              {bySection.map((s) => (
                <tr key={s.section}>
                  <td style={td}>{s.section}</td>
                  <td style={tdCenter}>{s.chapters}</td>
                  <td style={tdRight}>{fmt0(s.minutes)}</td>
                  <td style={tdRight}>{fmt1(s.minutes / 60)}</td>
                  <td style={tdRight}>{dailyCap ? fmt2(s.minutes / dailyCap) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ marginTop: 24 }}>Grand Total</h3>
          <div style={{ background: "#f7f8fa", padding: 12, borderRadius: 8 }}>
            <div>Minutes: <b>{fmt0(grand.minutes)}</b></div>
            <div>Hours: <b>{fmt1(grand.hours)}</b></div>
            <div>Days @ {dailyCap} min/day: <b>{fmt2(grand.daysAtCap)}</b></div>
          </div>
        </>
      )}
    </div>
  );
}

const th = { textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 6px" };
const td = { borderBottom: "1px solid #eee", padding: "8px 6px" };
const tdRight = { ...td, textAlign: "right" };
const tdCenter = { ...td, textAlign: "center" };

function fmt0(n) { return Math.round(n).toLocaleString(); }
function fmt1(n) { return (Math.round(n * 10) / 10).toLocaleString(); }
function fmt2(n) { return (Math.round(n * 100) / 100).toLocaleString(); }
