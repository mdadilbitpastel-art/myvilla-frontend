"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import ConfirmDialog, { type ConfirmOptions } from "@/components/ui/ConfirmDialog";

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * App-wide replacement for the browser's `window.confirm()`. Usage:
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "Remove listing?", tone: "danger" }))) return;
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  // The awaiting caller's resolver lives in a ref, not in state: settling it is
  // a side effect and must not run inside a state updater.
  const pending = useRef<((confirmed: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (next) =>
      new Promise<boolean>((resolve) => {
        // Only one dialog can be on screen; an older pending one would leave
        // its caller awaiting forever, so settle it as cancelled.
        pending.current?.(false);
        pending.current = resolve;
        setOptions(next);
      }),
    []
  );

  const onResolve = useCallback((confirmed: boolean) => {
    pending.current?.(confirmed);
    pending.current = null;
    setOptions(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && <ConfirmDialog options={options} onResolve={onResolve} />}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}
