import type { ReactNode } from "react";

import type { ExerciseNotePosition } from "@/lib/exercise-note";

export function ExerciseSolutionWithNote({ customNote, noteLabel, notePosition, children }: {
  customNote: string | null;
  noteLabel: string | null;
  notePosition: ExerciseNotePosition;
  children: ReactNode;
}) {
  const note = customNote ? <aside className="exercise-note" aria-label="Extra informatie">{noteLabel ? <strong className="exercise-note-label">{noteLabel}</strong> : null}<p className="exercise-note-text">{customNote}</p></aside> : null;
  return <>
    {notePosition === "above_solution" ? note : null}
    {children}
    {notePosition === "below_solution" ? note : null}
  </>;
}
