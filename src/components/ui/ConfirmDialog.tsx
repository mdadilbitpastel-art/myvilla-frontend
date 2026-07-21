"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";

export type ConfirmTone = "danger" | "primary";

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

/**
 * The in-app replacement for `window.confirm()`. Rendered by <ConfirmProvider>;
 * call it through `useConfirm()` rather than mounting this directly.
 */
export default function ConfirmDialog({
  options,
  onResolve,
}: {
  options: ConfirmOptions;
  onResolve: (confirmed: boolean) => void;
}) {
  const {
    title,
    message,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    tone = "primary",
  } = options;

  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();

  // Lock body scroll while the dialog is open.
  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Escape cancels, and Tab stays inside the panel — without the trap, tabbing
  // walks straight out into the page behind the dimmed backdrop.
  useEffect(() => {
    if (!mounted) return;
    const opener = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onResolve(false);
        return;
      }
      if (e.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      opener?.focus?.();
    };
  }, [mounted, onResolve]);

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={message ? messageId : undefined}
      className="fixed inset-0 z-[110] flex items-center justify-center px-5"
    >
      {/* Backdrop — a click here is the same as Cancel. */}
      <div
        aria-hidden
        onClick={() => onResolve(false)}
        className="animate-fade-in absolute inset-0 bg-ink/45 backdrop-blur-[2px]"
      />

      <div
        ref={panelRef}
        className="animate-toast-in relative w-full max-w-[400px] overflow-hidden rounded-2xl border border-line bg-white p-6 shadow-2xl"
      >
        <div className="flex gap-4">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              tone === "danger" ? "bg-red-50 text-red-500" : "bg-primary/10 text-primary"
            }`}
          >
            <AlertTriangle size={20} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="text-[16px] font-bold text-ink">
              {title}
            </h2>
            {message && (
              <p id={messageId} className="mt-1.5 text-[13px] leading-5 text-body">
                {message}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => onResolve(false)}
            className="rounded-lg border border-line px-4 py-2.5 text-[13px] font-semibold text-body transition-colors hover:border-primary/40 hover:text-ink"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onResolve(true)}
            className={`rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-colors ${
              tone === "danger"
                ? "bg-red-500 hover:bg-red-600"
                : "bg-primary hover:bg-primary-dark"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
