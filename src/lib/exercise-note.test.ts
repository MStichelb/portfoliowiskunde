import { describe, expect, it } from "vitest";

import { EXERCISE_NOTE_MAX_LENGTH, exerciseNoteSchema } from "./exercise-note";

describe("exerciseNoteSchema", () => {
  it("trims only outer whitespace and preserves multiline content", () => {
    expect(exerciseNoteSchema.parse({ customNote: "  Eerste regel\n  Tweede regel  ", notePosition: "below_solution" })).toEqual({
      customNote: "Eerste regel\n  Tweede regel",
      notePosition: "below_solution",
    });
  });

  it("normalizes whitespace-only notes to null", () => {
    expect(exerciseNoteSchema.parse({ customNote: " \n\t ", notePosition: "above_solution" }).customNote).toBeNull();
  });

  it("accepts both positions and rejects invalid input", () => {
    expect(exerciseNoteSchema.safeParse({ customNote: "Notitie", notePosition: "above_solution" }).success).toBe(true);
    expect(exerciseNoteSchema.safeParse({ customNote: "Notitie", notePosition: "below_solution" }).success).toBe(true);
    expect(exerciseNoteSchema.safeParse({ customNote: "Notitie", notePosition: "between_assets" }).success).toBe(false);
    expect(exerciseNoteSchema.safeParse({ customNote: "A".repeat(EXERCISE_NOTE_MAX_LENGTH + 1), notePosition: "above_solution" }).success).toBe(false);
  });
});
