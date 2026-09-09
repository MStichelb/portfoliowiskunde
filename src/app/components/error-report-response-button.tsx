"use client";

import { MessageSquare, MessageSquareText, Trash2, X } from "lucide-react";
import { useActionState, useCallback, useEffect, useId, useReducer, useRef } from "react";

import { deleteErrorReportTeacherResponseAction, saveErrorReportTeacherResponseAction, type AdminActionState } from "@/app/admin/actions";
import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import { SubmitButton } from "@/app/components/submit-button";
import { ERROR_REPORT_TEACHER_RESPONSE_MAX_LENGTH } from "@/lib/error-report-teacher-response";

const initialState: AdminActionState & { saved?: boolean } = { error: null };

export function ErrorReportResponseButton({ reportId, exerciseCode, locationLabel, reporterLabel, teacherResponse, initiallyOpen = false }: {
  reportId: string;
  exerciseCode: string;
  locationLabel: string;
  reporterLabel: string;
  teacherResponse: string | null;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useReducer((_open: boolean, next: boolean) => next, initiallyOpen);
  const [state, action] = useActionState(saveErrorReportTeacherResponseAction, initialState);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const textareaId = useId();
  const hasResponse = Boolean(teacherResponse);
  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (state.saved) close();
  }, [close, state.saved]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [close, open]);

  return <>
    <button
      ref={triggerRef}
      className={`icon-button report-response-trigger${hasResponse ? " has-response" : ""}`}
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Bericht aan leerling"
      title={hasResponse ? "Bericht aan leerling toegevoegd" : "Bericht aan leerling"}
    >
      {hasResponse ? <MessageSquareText size={15} aria-hidden /> : <MessageSquare size={15} aria-hidden />}
    </button>
    {open ? <div className="confirm-backdrop" role="presentation">
      <div className="report-response-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="report-response-dialog-heading">
          <h2 id={titleId}>Bericht aan leerling</h2>
          <button ref={closeRef} className="icon-button" type="button" onClick={close} aria-label="Sluiten" title="Sluiten"><X size={18} aria-hidden /></button>
        </div>
        <p className="report-response-context">Oefening {exerciseCode} · {locationLabel} · {reporterLabel}</p>
        <form action={action} className="report-response-form">
          <input type="hidden" name="id" value={reportId} />
          <label htmlFor={textareaId}>Bericht
            <textarea id={textareaId} name="teacherResponse" defaultValue={teacherResponse ?? ""} maxLength={ERROR_REPORT_TEACHER_RESPONSE_MAX_LENGTH} rows={5} />
          </label>
          <small>Dit bericht wordt zichtbaar voor de leerling zodra de melding is afgewerkt.</small>
          {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
          <div className="report-response-dialog-actions">
            <div>{hasResponse ? <ConfirmActionButton
              action={deleteErrorReportTeacherResponseAction}
              fields={{ id: reportId }}
              className="danger-button"
              label={<><Trash2 size={16} aria-hidden />Bericht verwijderen</>}
              confirmTitle="Bericht verwijderen?"
              confirmText="Het bericht aan deze leerling wordt verwijderd. De melding en haar lifecycle blijven behouden."
            /> : null}</div>
            <div><button className="secondary-button" type="button" onClick={close}>Annuleren</button><SubmitButton pendingLabel="Opslaan...">Opslaan</SubmitButton></div>
          </div>
        </form>
      </div>
    </div> : null}
  </>;
}
