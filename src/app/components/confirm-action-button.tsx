"use client";

import { useMutationFeedback } from "./mutation-feedback-form";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

export function ConfirmActionButton({ action, fields, label, confirmTitle, confirmText, className = "icon-button", confirmLabel = "Verwijderen", confirmClassName = "danger-button", disabled = false, disabledTitle, submitWithinParentForm = false, initiallyOpen = false, successMessage, errorMessage }: { action: (formData: FormData) => unknown | Promise<unknown>; fields?: Record<string, string>; label: ReactNode; confirmTitle: string; confirmText: string; className?: string; confirmLabel?: string; confirmClassName?: string; disabled?: boolean; disabledTitle?: string; submitWithinParentForm?: boolean; initiallyOpen?: boolean; successMessage?: string; errorMessage?: string }) {
  const run = useMutationFeedback();
  const submit = async (data: FormData) => {
    if (!successMessage && !errorMessage) { await action(data); return; }
    const outcome = await run(() => action(data), successMessage, errorMessage);
    if (outcome.ok) close();
  };
  const [open, setOpen] = useState(initiallyOpen);
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

  const hiddenFields = Object.entries(fields ?? {}).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />);
  return <>
    {submitWithinParentForm ? hiddenFields : null}
    <button ref={triggerRef} type="button" className={className} onClick={() => setOpen(true)} aria-label={confirmTitle} title={disabled && disabledTitle ? disabledTitle : confirmTitle} disabled={disabled}>{label}</button>
    {open && <div className="confirm-backdrop" role="presentation"><div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}><h2 id={titleId}>{confirmTitle}</h2><p>{confirmText}</p><div className="confirm-dialog-actions"><button ref={cancelRef} className="secondary-button" type="button" onClick={close}>Annuleren</button>{submitWithinParentForm
      ? <button className={confirmClassName} type="submit" formAction={submit}>{confirmLabel}</button>
      : <form className="confirm-dialog-action-form" action={submit}>{hiddenFields}<button className={confirmClassName} type="submit">{confirmLabel}</button></form>}
    </div></div></div>}
  </>;
}
