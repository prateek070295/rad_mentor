import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

const UnsavedChangesContext = createContext({
  hasUnsavedChanges: false,
  markDirty: () => {},
  markClean: () => {},
  beginPending: () => {},
  endPending: () => {},
});

export const UnsavedChangesProvider = ({ children }) => {
  const [isDirty, setIsDirty] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const markDirty = useCallback(() => {
    setIsDirty(true);
  }, []);

  const markClean = useCallback(() => {
    setIsDirty(false);
  }, []);

  const beginPending = useCallback(() => {
    setPendingCount((prev) => prev + 1);
  }, []);

  const endPending = useCallback(() => {
    setPendingCount((prev) => {
      const next = Math.max(0, prev - 1);
      return next;
    });
  }, []);

  const contextValue = useMemo(
    () => ({
      hasUnsavedChanges: isDirty || pendingCount > 0,
      markDirty,
      markClean,
      beginPending,
      endPending,
    }),
    [isDirty, pendingCount, markDirty, markClean, beginPending, endPending],
  );

  return (
    <UnsavedChangesContext.Provider value={contextValue}>
      {children}
    </UnsavedChangesContext.Provider>
  );
};

export const useUnsavedChanges = () => useContext(UnsavedChangesContext);
