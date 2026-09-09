"use client";

import { useActionState, useEffect, useReducer, useRef, useState } from "react";

import { errorReportThreadNoteAction, type ThreadNoteActionState } from "@/app/admin/actions";
import { SubmitButton } from "@/app/components/submit-button";

const initialState: ThreadNoteActionState = { error: null, successCount: 0 };

export type ErrorReportNoteViewAction = { type: "edit" } | { type: "close" };

export function errorReportNoteViewReducer(_editing: boolean, action: ErrorReportNoteViewAction): boolean {
  return action.type === "edit";
}

export function shouldCloseErrorReportNoteEditor(handledSuccessCount: number, successCount: number): boolean {
  return successCount > handledSuccessCount;
}

export function ErrorReportNoteForm({ threadId, note }: { threadId: string; note: string }) {
  const [state, action] = useActionState(errorReportThreadNoteAction, initialState);
  const [editing, dispatch] = useReducer(errorReportNoteViewReducer, false);
  const [draft, setDraft] = useState(note);
  const handledSuccessCount = useRef(0);

  useEffect(() => {
    if (!shouldCloseErrorReportNoteEditor(handledSuccessCount.current, state.successCount)) return;
    handledSuccessCount.current = state.successCount;
    dispatch({ type: "close" });
  }, [state.successCount]);

  if (!editing) {
    return <div className="report-note-compact report-note-accent">
      {note ? <p><strong>Notitie:</strong> {note}</p> : null}
      <button type="button" className="secondary-button" onClick={() => {
        setDraft(note);
        dispatch({ type: "edit" });
      }}>
        {note ? "Bewerken" : "Notitie toevoegen"}
      </button>
    </div>;
  }

  return <form className="report-note report-note-accent" action={action}>
    <input type="hidden" name="threadId" value={threadId} />
    <label htmlFor={`report-note-${threadId}`}>Adminnotitie
      <textarea id={`report-note-${threadId}`} name="note" value={draft} maxLength={4000} onChange={(event) => setDraft(event.target.value)} />
    </label>
    <div className="report-note-actions">
      <SubmitButton className="secondary-button" pendingLabel="Opslaan...">Opslaan</SubmitButton>
      <button type="button" className="secondary-button" onClick={() => dispatch({ type: "close" })}>Annuleren</button>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
    </div>
  </form>;
}
