// src/components/FlagsDebug.jsx
import { useSchedulerFlags } from "../hooks/useSchedulerFlags";

export default function FlagsDebug() {
  const { flags, loading } = useSchedulerFlags();
  if (loading) return <div>Loading flags…</div>;
  return (
    <pre style={{ padding: 12, background: "#f6f6f6", borderRadius: 8 }}>
      {JSON.stringify(flags, null, 2)}
    </pre>
  );
}
