import { z } from "zod";

export const EXERCISE_NOTE_MAX_LENGTH = 2_000;

export const exerciseNotePositionSchema = z.enum(["above_solution", "below_solution"]);
export type ExerciseNotePosition = z.infer<typeof exerciseNotePositionSchema>;

export const exerciseNoteSchema = z.object({
  customNote: z.string().max(EXERCISE_NOTE_MAX_LENGTH).transform((value) => value.trim() || null),
  notePosition: exerciseNotePositionSchema,
});
