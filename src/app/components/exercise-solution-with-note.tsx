import type { ReactNode } from "react";

import type { ExerciseNotePosition } from "@/lib/exercise-note";

export function ExerciseSolutionWithNote({ customNote, notePosition, children }: {
  customNote: string | null;
  notePosition: ExerciseNotePosition;
  children: ReactNode;
}) {
  const note = customNote ? <aside className="exercise-note" aria-label="Notitie"><strong>Notitie</strong><p>{customNote}</p></aside> : null;
  return <>
    {notePosition === "above_solution" ? note : null}
    {children}
    {notePosition === "below_solution" ? note : null}
  </>;
}
