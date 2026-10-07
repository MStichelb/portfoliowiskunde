"use client";

import { Plus } from "lucide-react";
import { useId, useRef, useState } from "react";

export function ThemeCreateModal({ action, learningSpaceId, singular }: {
  action: (formData: FormData) => Promise<void>;
  learningSpaceId: string;
  singular: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [pending, setPending] = useState(false);
  const close = () => dialog.current?.close();
  async function submit(formData: FormData) {
    setPending(true);
    try {
      await action(formData);
      close();
    } finally {
      setPending(false);
    }
  }
  return <>
    <button ref={trigger} type="button" className="secondary-button theme-add-button" onClick={() => dialog.current?.showModal()}><Plus size={17} aria-hidden />{singular} toevoegen</button>
    <dialog ref={dialog} className="confirm-dialog theme-create-dialog" aria-labelledby={titleId} onCancel={(event) => { if (pending) event.preventDefault(); }} onClose={() => trigger.current?.focus()}>
      <h2 id={titleId}>{singular} toevoegen</h2>
      <form action={submit} className="theme-create-form">
        <input type="hidden" name="learningSpaceId" value={learningSpaceId} />
        <label>Naam<input name="name" required maxLength={100} disabled={pending} /></label>
        <div className="confirm-dialog-actions">
          <button type="button" className="secondary-button" disabled={pending} onClick={close}>Annuleren</button>
          <button type="submit" className="primary-button" disabled={pending}>{singular} toevoegen</button>
        </div>
      </form>
    </dialog>
  </>;
}
