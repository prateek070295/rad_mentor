// src/utils/exportFirestore.js
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "../firebase";

// Download any JS object as a JSON file
function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Export a single document to JSON
export async function exportDocumentJSON(path) {
  const snap = await getDoc(doc(db, path));
  if (!snap.exists()) {
    alert("Document not found: " + path);
    return;
  }
  downloadJSON({ id: snap.id, ...snap.data() }, path.replace(/\//g, "_") + ".json");
}

// Export an entire collection to JSON (keyed by doc id)
export async function exportCollectionJSON(path) {
  const snap = await getDocs(collection(db, path));
  const out = {};
  snap.forEach(d => (out[d.id] = d.data()));
  downloadJSON(out, path.replace(/\//g, "_") + ".json");
}
