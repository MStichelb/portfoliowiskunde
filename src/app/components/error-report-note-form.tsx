"use client";

import { useActionState } from "react";

import { errorReportIssueNoteAction, type AdminActionState } from "@/app/admin/actions";
import { SubmitButton } from "@/app/components/submit-button";

const initialState: AdminActionState & { saved?: boolean } = { error: null };

export function ErrorReportNoteForm({ issueId, note }: { issueId: string; note: string }) {
  const [state, action] = useActionState(errorReportIssueNoteAction, initialState);

  return <form className="report-note" action={action}>
    <input type="hidden" name="issueId" value={issueId} />
    <label htmlFor={`report-note-${issueId}`}>Adminnotitie
      <textarea id={`report-note-${issueId}`} name="note" defaultValue={note} maxLength={4000} />
    </label>
    <div className="report-note-actions">
      <SubmitButton className="secondary-button" pendingLabel="Opslaan...">Opslaan</SubmitButton>
      {state.saved ? <p className="report-note-saved" role="status">Opgeslagen</p> : null}
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
    </div>
  </form>;
}
