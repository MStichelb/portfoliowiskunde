"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

export function ConfirmActionButton({ action, fields, label, confirmTitle, confirmText, className = "icon-button", confirmLabel = "Verwijderen", confirmClassName = "danger-button", disabled = false }: { action: (formData: FormData) => void | Promise<void>; fields?: Record<string, string>; label: ReactNode; confirmTitle: string; confirmText: string; className?: string; confirmLabel?: string; confirmClassName?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return <><button ref={triggerRef} type="button" className={className} onClick={() => setOpen(true)} aria-label={confirmTitle} title={confirmTitle} disabled={disabled}>{label}</button>{open && <div className="confirm-backdrop" role="presentation"><div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}><h2 id={titleId}>{confirmTitle}</h2><p>{confirmText}</p><div><button ref={cancelRef} className="secondary-button" type="button" onClick={close}>Annuleren</button><form action={action}>{Object.entries(fields ?? {}).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}<button className={confirmClassName} type="submit">{confirmLabel}</button></form></div></div></div>}</>;
}
