"use client";

import { MessageSquare, MessageSquareText, Trash2, X } from "lucide-react";
import { useActionState, useCallback, useEffect, useId, useReducer, useRef } from "react";

import { deleteErrorReportTeacherResponseAction, saveErrorReportTeacherResponseAction, type ResponseActionState } from "@/app/admin/actions";
import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import { SubmitButton } from "@/app/components/submit-button";
import { ERROR_REPORT_TEACHER_RESPONSE_MAX_LENGTH } from "@/lib/error-report-teacher-response";

const initialState: ResponseActionState = { error: null, successCount: 0 };

export function shouldCloseResponseDialog(handledSuccessCount: number, successCount: number): boolean {
  return successCount > handledSuccessCount;
}

export function ErrorReportResponseButton({ reportId, exerciseCode, locationLabel, reporterLabel, teacherResponse, initiallyOpen = false, initiallyDeleteConfirmOpen = false }: {
  reportId: string;
  exerciseCode: string;
  locationLabel: string;
  reporterLabel: string;
  teacherResponse: string | null;
  initiallyOpen?: boolean;
  initiallyDeleteConfirmOpen?: boolean;
}) {
  const [open, setOpen] = useReducer((_open: boolean, next: boolean) => next, initiallyOpen);
  const [state, action] = useActionState(saveErrorReportTeacherResponseAction, initialState);
  const [deleteState, deleteAction] = useActionState(deleteErrorReportTeacherResponseAction, initialState);
  const successCount = state.successCount + deleteState.successCount;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const handledSuccessCount = useRef(0);
  const titleId = useId();
  const textareaId = useId();
  const hasResponse = Boolean(teacherResponse);
  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!shouldCloseResponseDialog(handledSuccessCount.current, successCount)) return;
    handledSuccessCount.current = successCount;
    close();
  }, [close, successCount]);

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
      className={`icon-button report-item-action report-response-trigger${hasResponse ? " has-response" : ""}`}
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
          {state.error || deleteState.error ? <p className="form-error" role="alert">{state.error ?? deleteState.error}</p> : null}
          <div className="report-response-dialog-actions">
            <div>{hasResponse ? <ConfirmActionButton
              action={deleteAction}
              className="danger-button"
              label={<><Trash2 size={16} aria-hidden />Bericht verwijderen</>}
              confirmTitle="Bericht verwijderen?"
              confirmText="Het bericht aan deze leerling wordt verwijderd. Dit heeft geen invloed op de foutmelding zelf."
              submitWithinParentForm
              initiallyOpen={initiallyDeleteConfirmOpen}
            /> : null}</div>
            <div><button className="secondary-button" type="button" onClick={close}>Annuleren</button><SubmitButton className="secondary-button" pendingLabel="Opslaan...">Opslaan</SubmitButton><SubmitButton name="markHandled" value="true" pendingLabel="Opslaan...">Opslaan en afwerken</SubmitButton></div>
          </div>
        </form>
      </div>
    </div> : null}
  </>;
}
