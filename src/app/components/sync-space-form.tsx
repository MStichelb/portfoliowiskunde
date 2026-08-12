"use client";

import { useActionState } from "react";

import { syncSpaceAction, type AdminActionState } from "@/app/admin/actions";
import { SubmitButton } from "@/app/components/submit-button";

export function SyncSpaceForm({ learningSpaceId }: { learningSpaceId: string }) {
  const [state, action] = useActionState(syncSpaceAction, { error: null } satisfies AdminActionState);
  return <form action={action}>
    <input type="hidden" name="learningSpaceId" value={learningSpaceId} />
    <SubmitButton pendingLabel="Synchroniseren...">Nu synchroniseren</SubmitButton>
    {state.error ? <p className="form-message" role="alert">{state.error}</p> : null}
  </form>;
}
