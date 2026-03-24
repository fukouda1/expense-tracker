import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info' | 'undo';
  onUndo?: () => void;
  duration: number;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastItem['type'], opts?: { onUndo?: () => void; duration?: number }) => void;
}

const ToastContext = createContext<ToastContextType>(null!);

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastItem['type'] = 'success', opts?: { onUndo?: () => void; duration?: number }) => {
    const id = ++toastId;
    const duration = opts?.duration ?? (type === 'undo' ? 5000 : 3000);
    setToasts(prev => [...prev, { id, message, type, onUndo: opts?.onUndo, duration }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  const dismiss = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-20 left-4 right-4 z-[300] flex flex-col items-center gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`pointer-events-auto w-full max-w-sm px-4 py-3 rounded-xl shadow-lg flex items-center justify-between gap-2 animate-slide-up ${
            t.type === 'error' ? 'bg-red-600 text-white' :
            t.type === 'undo' ? 'bg-gray-800 text-white' :
            t.type === 'info' ? 'bg-blue-600 text-white' :
            'bg-emerald-600 text-white'
          }`}>
            <span className="text-sm font-medium truncate">{t.message}</span>
            <div className="flex items-center gap-2 flex-shrink-0">
              {t.type === 'undo' && t.onUndo && (
                <button onClick={() => { t.onUndo!(); dismiss(t.id); }} className="text-amber-300 font-bold text-sm hover:text-amber-200">
                  UNDO
                </button>
              )}
              <button onClick={() => dismiss(t.id)} className="opacity-70 hover:opacity-100 text-xs">✕</button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
