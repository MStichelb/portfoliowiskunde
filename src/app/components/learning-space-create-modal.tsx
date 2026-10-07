"use client";

import { FolderPlus, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { LearningSpaceCreateForm } from "@/app/components/learning-space-create-form";
import type { Subject } from "@/lib/subjects";
import type { CreationAction, LearningSpaceCreationOptions } from "@/lib/learning-space-creation-wizard";

interface LearningSpaceCreateModalProps {
  action: CreationAction;
  subjects: Subject[];
  options?: LearningSpaceCreationOptions;
  initialOpen?: boolean;
  error?: string | null;
}

export function LearningSpaceCreateModal({ action, subjects, options, initialOpen = false, error = null }: LearningSpaceCreateModalProps) {
  const [open, setOpen] = useState(initialOpen);
  const [pending, setPending] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const close = useCallback(() => {
    if (pending) return;
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, [pending]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [close, open]);

  return <>
    <button ref={triggerRef} className="secondary-button" type="button" onClick={() => setOpen(true)}><FolderPlus size={17} aria-hidden />Leeromgeving toevoegen</button>
    {open ? <div className="confirm-backdrop" role="presentation">
      <div className="learning-space-create-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="learning-space-create-dialog-heading">
          <h2 id={titleId}>Leeromgeving toevoegen</h2>
          <button ref={closeRef} className="icon-button" type="button" disabled={pending} onClick={close} aria-label="Sluiten" title="Sluiten"><X size={18} aria-hidden /></button>
        </div>
        <LearningSpaceCreateForm action={action} subjects={subjects} options={options} error={error} onCancel={close} onPendingChange={setPending} />
      </div>
    </div> : null}
  </>;
}
