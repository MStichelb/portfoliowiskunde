"use client";

import { useActionState, useEffect, useReducer } from "react";

import { errorReportThreadNoteAction, type AdminActionState } from "@/app/admin/actions";
import { SubmitButton } from "@/app/components/submit-button";

const initialState: AdminActionState & { saved?: boolean } = { error: null };

export type ErrorReportNoteViewAction = { type: "edit" } | { type: "close" };

export function errorReportNoteViewReducer(_editing: boolean, action: ErrorReportNoteViewAction): boolean {
  return action.type === "edit";
}

export function ErrorReportNoteForm({ threadId, note }: { threadId: string; note: string }) {
  const [state, action] = useActionState(errorReportThreadNoteAction, initialState);
  const [editing, dispatch] = useReducer(errorReportNoteViewReducer, false);

  useEffect(() => {
    if (state.saved) dispatch({ type: "close" });
  }, [state.saved]);

  if (!editing) {
    return <div className="report-note-compact">
      {note ? <p><strong>Notitie:</strong> {note}</p> : null}
      <button type="button" className="secondary-button" onClick={() => dispatch({ type: "edit" })}>
        {note ? "Bewerken" : "Notitie toevoegen"}
      </button>
    </div>;
  }

  return <form className="report-note" action={action}>
    <input type="hidden" name="threadId" value={threadId} />
    <label htmlFor={`report-note-${threadId}`}>Adminnotitie
      <textarea id={`report-note-${threadId}`} name="note" defaultValue={note} maxLength={4000} />
    </label>
    <div className="report-note-actions">
      <SubmitButton className="secondary-button" pendingLabel="Opslaan...">Opslaan</SubmitButton>
      <button type="button" className="secondary-button" onClick={() => dispatch({ type: "close" })}>Annuleren</button>
      {state.saved ? <p className="report-note-saved" role="status">Opgeslagen</p> : null}
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
    </div>
  </form>;
}
