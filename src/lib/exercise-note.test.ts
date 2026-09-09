import { describe, expect, it } from "vitest";

import { EXERCISE_NOTE_LABEL_MAX_LENGTH, EXERCISE_NOTE_MAX_LENGTH, exerciseNoteSchema } from "./exercise-note";

describe("exerciseNoteSchema", () => {
  it("trims only outer whitespace and preserves multiline content", () => {
    expect(exerciseNoteSchema.parse({ noteLabel: "  Hint  ", customNote: "  Eerste regel\n  Tweede regel  ", notePosition: "below_solution" })).toEqual({
      noteLabel: "Hint",
      customNote: "Eerste regel\n  Tweede regel",
      notePosition: "below_solution",
    });
  });

  it("normalizes whitespace-only notes to null", () => {
    expect(exerciseNoteSchema.parse({ noteLabel: "  ", customNote: " \n\t ", notePosition: "above_solution" })).toMatchObject({ noteLabel: null, customNote: null });
  });

  it("drops a label when the note itself is empty", () => {
    expect(exerciseNoteSchema.parse({ noteLabel: "Hint", customNote: " ", notePosition: "above_solution" }).noteLabel).toBeNull();
  });

  it("accepts both positions and rejects invalid input", () => {
    expect(exerciseNoteSchema.safeParse({ noteLabel: "", customNote: "Notitie", notePosition: "above_solution" }).success).toBe(true);
    expect(exerciseNoteSchema.safeParse({ noteLabel: "", customNote: "Notitie", notePosition: "below_solution" }).success).toBe(true);
    expect(exerciseNoteSchema.safeParse({ noteLabel: "", customNote: "Notitie", notePosition: "between_assets" }).success).toBe(false);
    expect(exerciseNoteSchema.safeParse({ noteLabel: "", customNote: "A".repeat(EXERCISE_NOTE_MAX_LENGTH + 1), notePosition: "above_solution" }).success).toBe(false);
    expect(exerciseNoteSchema.safeParse({ noteLabel: "A".repeat(EXERCISE_NOTE_LABEL_MAX_LENGTH + 1), customNote: "Notitie", notePosition: "above_solution" }).success).toBe(false);
  });
});
