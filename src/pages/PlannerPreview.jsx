// src/pages/PlannerPreview.jsx
import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { useSchedulerFlags } from "../hooks/useSchedulerFlags";
import { exportDocumentJSON, exportCollectionJSON } from "../utils/exportFirestore";

/**
 * Phase 0: Read-only preview page.
 * - Does NOT write to Firestore.
 * - Lets you sanity-check flags and inputs.
 * - Includes JSON export/backup actions.
 */
export default function PlannerPreview() {
  const { flags, loading } = useSchedulerFlags();

  // Basic inputs for a future planner; these do nothing destructive in Phase 0.
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [dailyCap, setDailyCap] = useState(270);
  const [preview, setPreview] = useState(null);

  // Export helpers (prefill a sensible default path if user is signed in)
  const auth = getAuth();
  const uid = auth.currentUser?.uid || "";
  const defaultDocPath = uid ? `plans/${uid}` : "";
  const [customPath, setCustomPath] = useState(defaultDocPath);

  // When flags load, initialize daily capacity from config (once)
  useEffect(() => {
    if (!loading && flags?.dailyCapacityMinsDefault) {
      setDailyCap(flags.dailyCapacityMinsDefault);
    }
  }, [loading, flags]);

  if (loading) return null; // keep UI stable until flags are ready

  async function generatePreview() {
    // Phase 0: NO WRITES. Just show a placeholder object to confirm inputs/flags flow.
    const res = {
      message: "Read-only preview (Phase 0). No writes to Firestore.",
      inputs: { start, end, dailyCap },
      flags,
      timestamp: new Date().toISOString(),
    };
    setPreview(res);
  }

  const canExportDoc = customPath && customPath.includes("/");
  const canExportCollection = Boolean(customPath);

  return (
    <div style={{ maxWidth: 800, margin: "24px auto", padding: 16 }}>
      <h1 style={{ marginBottom: 4 }}>Planner Preview (Read-only)</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        This page won’t write anything. It’s a sandbox to test the planner in later phases.
      </p>

      {/* Inputs */}
      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <label>
          Start date <span style={{ color: "#999" }}>dd-mm-yyyy</span>{" "}
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            style={{ display: "block", marginTop: 4 }}
          />
        </label>

        <label>
          End date <span style={{ color: "#999" }}>dd-mm-yyyy</span>{" "}
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            style={{ display: "block", marginTop: 4 }}
          />
        </label>

        <label>
          Daily capacity (mins){" "}
          <input
            type="number"
            value={dailyCap}
            onChange={(e) => setDailyCap(Number(e.target.value))}
            min={30}
            step={5}
            style={{ display: "block", marginTop: 4, width: 160 }}
          />
        </label>

        <button onClick={generatePreview} style={{ marginTop: 8 }}>
          Generate Preview
        </button>
      </div>

      {/* Preview JSON */}
      {preview && (
        <pre
          style={{
            marginTop: 16,
            background: "#f7f7f7",
            padding: 12,
            borderRadius: 8,
            overflowX: "auto",
          }}
        >
          {JSON.stringify(preview, null, 2)}
        </pre>
      )}

      {/* Export / Backup */}
      <hr style={{ margin: "24px 0" }} />
      <h3 style={{ marginBottom: 8 }}>Backup / Export (JSON)</h3>
      <p style={{ color: "#666", marginTop: 0 }}>
        Read-only: downloads a JSON file to your computer. Useful before trying new planner logic.
      </p>

      <div style={{ display: "grid", gap: 8, maxWidth: 680, marginTop: 8 }}>
        <label>
          Firestore path to export (doc or collection)
          <input
            type="text"
            placeholder="e.g. plans/USER_ID  or  plans/USER_ID/weeks"
            value={customPath}
            onChange={(e) => setCustomPath(e.target.value)}
            style={{ display: "block", marginTop: 4, width: "100%" }}
          />
        </label>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => exportDocumentJSON(customPath)} disabled={!canExportDoc}>
            Export Document
          </button>
          <button onClick={() => exportCollectionJSON(customPath)} disabled={!canExportCollection}>
            Export Collection
          </button>
        </div>

        <small style={{ color: "#999" }}>
          Tip: Your rules allow <code>/plans/&lt;uid&gt;</code> reads for the signed-in user. If your
          schedule is stored per week, try a collection path like <code>plans/&lt;uid&gt;/weeks</code>.
        </small>
      </div>

      <p style={{ fontSize: 12, color: "#999", marginTop: 16 }}>
        Phase 0: This screen never writes to Firestore.
      </p>
    </div>
  );
}
