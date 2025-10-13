import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

let toastIdCounter = 0;

const ToastContext = createContext(null);

export const AdminToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    ({ type = 'info', title, message, duration = 4000 }) => {
      toastIdCounter += 1;
      const id = toastIdCounter;
      const toast = { id, type, title, message, duration };
      setToasts((current) => [...current, toast]);
      if (typeof window !== 'undefined' && duration > 0) {
        window.setTimeout(() => dismissToast(id), duration);
      }
      return id;
    },
    [dismissToast],
  );

  const value = useMemo(
    () => ({
      pushToast,
      dismissToast,
    }),
    [pushToast, dismissToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex w-80 flex-col gap-3">
        {toasts.map((toast) => (
          <article
            key={toast.id}
            className={getToastClassName(toast.type)}
            role="status"
          >
            <div className="flex-1">
              {toast.title ? (
                <h3 className="text-sm font-semibold leading-5">{toast.title}</h3>
              ) : null}
              {toast.message ? (
                <p className="mt-1 text-sm leading-5 text-slate-600">{toast.message}</p>
              ) : null}
            </div>
            <button
              onClick={() => dismissToast(toast.id)}
              className="ml-3 text-xs font-semibold text-slate-500 transition hover:text-slate-700"
            >
              Dismiss
            </button>
          </article>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

const getToastClassName = (type) => {
  const base =
    'flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg backdrop-blur bg-white/90';
  switch (type) {
    case 'success':
      return `${base} border-emerald-200 text-emerald-700`;
    case 'error':
      return `${base} border-rose-200 text-rose-700`;
    case 'warning':
      return `${base} border-amber-200 text-amber-700`;
    default:
      return `${base} border-sky-200 text-sky-700`;
  }
};

export const useAdminToasts = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useAdminToasts must be used within an AdminToastProvider');
  }
  return context;
};
