"use client";

import { Square, SquareCheckBig, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { deleteExerciseNoteAction, saveExerciseNoteAction } from "@/app/admin/actions";
import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import type { ExerciseNoteReturnContext } from "@/lib/admin-routes";
import { EXERCISE_NOTE_LABEL_MAX_LENGTH, EXERCISE_NOTE_MAX_LENGTH, type ExerciseNotePosition } from "@/lib/exercise-note";

export function ExerciseNoteButton({ exerciseId, exerciseCode, noteLabel, customNote, notePosition, returnContext = "portfolio", initiallyOpen = false }: {
  exerciseId: string;
  exerciseCode: string;
  noteLabel: string | null;
  customNote: string | null;
  notePosition: ExerciseNotePosition;
  returnContext?: ExerciseNoteReturnContext;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const formId = useId();
  const hasNote = Boolean(customNote);
  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [close, open]);

  return <>
    <button ref={triggerRef} className={`visibility-toggle exercise-note-trigger${hasNote ? " has-note" : ""}`} type="button" onClick={() => setOpen(true)} aria-label={`Notitie voor oefening ${exerciseCode} ${hasNote ? "bewerken" : "toevoegen"}`}>
      {hasNote ? <SquareCheckBig size={16} aria-hidden /> : <Square size={16} aria-hidden />}Notitie
    </button>
    {open ? <div className="confirm-backdrop" role="presentation">
      <div className="exercise-note-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="exercise-note-dialog-heading">
          <h2 id={titleId}>Notitie bij oefening {exerciseCode}</h2>
          <button ref={closeRef} className="icon-button" type="button" onClick={close} aria-label="Sluiten" title="Sluiten"><X size={18} aria-hidden /></button>
        </div>
        <form id={formId} action={saveExerciseNoteAction} className="exercise-note-form">
          <input type="hidden" name="id" value={exerciseId} />
          <input type="hidden" name="returnContext" value={returnContext} />
          <label>Label (optioneel)<input type="text" name="noteLabel" defaultValue={noteLabel ?? ""} maxLength={EXERCISE_NOTE_LABEL_MAX_LENGTH} placeholder="Bijv. Hint, Opmerking, Instructie..." /></label>
          <label>Notitie<textarea name="customNote" defaultValue={customNote ?? ""} maxLength={EXERCISE_NOTE_MAX_LENGTH} rows={4} /></label>
          <fieldset className="exercise-note-position"><legend>Positie</legend><div>
            <label><input type="radio" name="notePosition" value="above_solution" defaultChecked={notePosition === "above_solution"} /><span>Boven uitwerking</span></label>
            <label><input type="radio" name="notePosition" value="below_solution" defaultChecked={notePosition === "below_solution"} /><span>Onder uitwerking</span></label>
          </div></fieldset>
        </form>
        <div className="exercise-note-dialog-actions">
          <div>{hasNote ? <ConfirmActionButton action={deleteExerciseNoteAction} fields={{ id: exerciseId, returnContext }} className="danger-button" label={<><Trash2 size={16} aria-hidden />Notitie verwijderen</>} confirmTitle="Notitie verwijderen?" confirmText="Deze notitie wordt permanent verwijderd." /> : null}</div>
          <div><button className="primary-button" type="submit" form={formId}>Opslaan</button></div>
        </div>
      </div>
    </div> : null}
  </>;
}
