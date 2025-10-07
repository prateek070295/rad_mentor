import React, { useEffect, useRef, useState } from "react";

const ProfileMenu = ({
  displayName,
  email,
  initials,
  onNavigateToAccount,
  onSignOut,
  onSendPasswordReset,
  hasUnsavedChanges,
}) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handleClickAway = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickAway);
    document.addEventListener("touchstart", handleClickAway);
    return () => {
      document.removeEventListener("mousedown", handleClickAway);
      document.removeEventListener("touchstart", handleClickAway);
    };
  }, [open]);

  const handleAccountClick = () => {
    setOpen(false);
    onNavigateToAccount?.();
  };

  const handlePasswordReset = async () => {
    setOpen(false);
    if (onSendPasswordReset) {
      await onSendPasswordReset();
    }
  };

  const handleSignOutClick = async () => {
    setOpen(false);
    if (onSignOut) {
      await onSignOut();
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        className="relative flex h-10 w-10 items-center justify-center rounded-full bg-blue-200 text-lg font-semibold text-blue-800 transition hover:bg-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {initials || "U"}
        {hasUnsavedChanges && (
          <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full border border-white bg-amber-500" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-gray-100 bg-white/95 p-3 text-sm shadow-lg backdrop-blur">
          <div className="border-b border-gray-100 pb-3">
            <p className="font-semibold text-gray-800">{displayName}</p>
            <p className="text-xs text-gray-500">{email}</p>
            {hasUnsavedChanges && (
              <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                You have unsaved work.
              </p>
            )}
          </div>
          <div className="mt-2 space-y-1">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left font-medium text-gray-700 transition hover:bg-gray-50"
              onClick={handleAccountClick}
            >
              Account settings
              <span aria-hidden="true" className="text-gray-400">
                →
              </span>
            </button>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-gray-600 transition hover:bg-gray-50"
              onClick={handlePasswordReset}
            >
              Send password reset
              <span aria-hidden="true" className="text-gray-400">
                ↺
              </span>
            </button>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left font-semibold text-red-600 transition hover:bg-red-50"
              onClick={handleSignOutClick}
            >
              Sign out
              <span aria-hidden="true" className="text-red-400">
                ⎋
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileMenu;
