"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export type ToastKind = "success" | "error" | "info";

type Toast = { id: number; kind: ToastKind; text: string };

type ToastApi = {
  show: (text: string, kind?: ToastKind) => void;
  success: (text: string) => void;
  error: (text: string) => void;
  info: (text: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

// Errors linger longer — they usually ask the user to do something.
const DURATION: Record<ToastKind, number> = {
  success: 3500,
  info: 3500,
  error: 5000,
};

const ICONS: Record<ToastKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const ACCENT: Record<ToastKind, string> = {
  success: "text-primary",
  error: "text-red-500",
  info: "text-body",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);
  // Ids come from a counter, not Math.random/Date.now, so server and client
  // markup can never disagree.
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (text: string, kind: ToastKind = "success") => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, kind, text }]);
      const timer = window.setTimeout(() => dismiss(id), DURATION[kind]);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  // Clear pending timers if the tree unmounts mid-toast.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((t) => window.clearTimeout(t));
      pending.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (text: string) => show(text, "success"),
      error: (text: string) => show(text, "error"),
      info: (text: string) => show(text, "info"),
    }),
    [show]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted &&
        createPortal(
          // Above the sticky header (z-50). The wrapper ignores pointer events
          // so it never blocks the page behind it; each toast re-enables them.
          <div
            aria-live="polite"
            aria-atomic="false"
            className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4"
          >
            {toasts.map((t) => {
              const Icon = ICONS[t.kind];
              return (
                <div
                  key={t.id}
                  role={t.kind === "error" ? "alert" : "status"}
                  className="animate-toast-in pointer-events-auto flex w-full max-w-[420px] items-start gap-3 rounded-xl border border-line bg-white px-4 py-3 shadow-xl"
                >
                  <Icon size={18} aria-hidden className={`mt-px shrink-0 ${ACCENT[t.kind]}`} />
                  <span className="flex-1 text-[13px] font-medium leading-5 text-ink">
                    {t.text}
                  </span>
                  <button
                    type="button"
                    onClick={() => dismiss(t.id)}
                    aria-label="Dismiss notification"
                    className="shrink-0 text-muted transition-colors hover:text-ink"
                  >
                    <X size={15} aria-hidden />
                  </button>
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
