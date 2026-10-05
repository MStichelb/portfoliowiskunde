"use client";

import { useActionState, useCallback, useEffect, useId, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

import { syncSpaceAction, type AdminActionState } from "@/app/admin/actions";
import { SubmitButton } from "@/app/components/submit-button";

export function SyncSpaceForm({ learningSpaceId }: { learningSpaceId: string }) {
  const [state, action] = useActionState(syncSpaceAction, { error: null } satisfies AdminActionState);
  const [dismissedState, setDismissedState] = useState<AdminActionState | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const conflictMessage = syncConflictMessage(state.error);
  const open = conflictMessage !== null && state !== dismissedState;
  const close = useCallback(() => {
    setDismissedState(state);
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus());
  }, [state]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "Tab") {
        event.preventDefault();
        closeRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, open]);

  return <><form ref={formRef} action={action}>
    <input type="hidden" name="learningSpaceId" value={learningSpaceId} />
    <SubmitButton className="primary-button sync-submit-button" pendingLabel="Synchroniseren..."><RefreshCw size={17} aria-hidden />Nu synchroniseren</SubmitButton>
    {state.error && conflictMessage === null ? <p className="form-message" role="alert">{state.error}</p> : null}
  </form>
    {open ? <div className="confirm-backdrop" role="presentation">
      <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={`${titleId}-description`}>
        <h2 id={titleId}>Synchronisatie niet gelukt</h2>
        <p id={`${titleId}-description`}>{conflictMessage}</p>
        <div className="confirm-dialog-actions"><button ref={closeRef} className="primary-button" type="button" onClick={close}>Sluiten</button></div>
      </div>
    </div> : null}
  </>;
}

function syncConflictMessage(error: string | null): string | null {
  const conflict = error?.match(/^Oefeningscode (.+?) komt meerdere keren voor binnen portfolio (.+?): /);
  if (!conflict) return null;
  return `Oefeningscode ${conflict[1]} werd op meerdere plaatsen gevonden in bundel ${conflict[2]}. Verplaats alle bestanden van deze oefening naar hetzelfde onderdeel of rechtstreeks naar de bundelmap.`;
}
