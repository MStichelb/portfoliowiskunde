"use client";

import { useActionState, useEffect, useReducer, useRef, useState } from "react";

import { errorReportThreadNoteAction, type ThreadNoteActionState } from "@/app/admin/actions";
import { useToast } from "./flash-toast";
import { useMutationFeedback } from "./mutation-feedback-form";
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
  const show = useToast();
  const run = useMutationFeedback();
  const [state, action] = useActionState(async (previous: ThreadNoteActionState, data: FormData) => {
    const outcome = await run(async () => ({ state: await errorReportThreadNoteAction(previous, data) }));
    if (!outcome.ok) return { ...previous, error: null };
    const result = outcome.result!.state;
    if (result.technical && result.error) show({ type: "error", message: result.error });
    else if (result.successCount > previous.successCount) show({ type: "success", message: "Adminnotitie opgeslagen." });
    return result;
  }, initialState);
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
      {state.error && !state.technical ? <p className="form-error inline-validation" role="alert">{state.error}</p> : null}
    </div>
  </form>;
}
