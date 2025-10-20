import { useCallback, useEffect, useState } from 'react';
import { loadDayAssignments } from '../services/planV2Api';

const INITIAL_META = { weekKey: null, isDayDone: false };

/**
 * Fetches the current plan-day assignments and metadata from Firestore.
 * Returns scheduling data alongside loading/error state and a metadata setter.
 */
const useScheduleData = (planUid, todayIso, weekKey) => {
  const [assignments, setAssignments] = useState([]);
  const [meta, setMeta] = useState(INITIAL_META);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAssignments = useCallback(
    async (isCancelled = () => false) => {
      if (!planUid || !todayIso) {
        if (isCancelled()) return;
        setAssignments([]);
        setMeta(INITIAL_META);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const result = await loadDayAssignments(planUid, todayIso);
        if (isCancelled()) return;
        setAssignments(Array.isArray(result.assignments) ? result.assignments : []);
        const alreadyDone = !!(result.weekDoc?.doneDays?.[todayIso]);
        setMeta({
          weekKey: result.weekKey || weekKey || null,
          isDayDone: alreadyDone,
        });
      } catch (err) {
        if (isCancelled()) return;
        setAssignments([]);
        setMeta({
          weekKey: weekKey || null,
          isDayDone: false,
        });
        setError(err);
      } finally {
        if (!isCancelled()) {
          setLoading(false);
        }
      }
    },
    [planUid, todayIso, weekKey],
  );

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;
    fetchAssignments(isCancelled);
    return () => {
      cancelled = true;
    };
  }, [fetchAssignments]);

  const refresh = useCallback(() => fetchAssignments(() => false), [fetchAssignments]);

  return {
    assignments,
    meta,
    loading,
    error,
    setMeta,
    refresh,
  };
};

export default useScheduleData;

