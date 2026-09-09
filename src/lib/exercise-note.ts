import { z } from "zod";

export const EXERCISE_NOTE_MAX_LENGTH = 2_000;
export const EXERCISE_NOTE_LABEL_MAX_LENGTH = 40;

export const exerciseNotePositionSchema = z.enum(["above_solution", "below_solution"]);
export type ExerciseNotePosition = z.infer<typeof exerciseNotePositionSchema>;

export const exerciseNoteSchema = z.object({
  noteLabel: z.string().max(EXERCISE_NOTE_LABEL_MAX_LENGTH).transform((value) => value.trim() || null),
  customNote: z.string().max(EXERCISE_NOTE_MAX_LENGTH).transform((value) => value.trim() || null),
  notePosition: exerciseNotePositionSchema,
}).transform((note) => ({ ...note, noteLabel: note.customNote ? note.noteLabel : null }));
