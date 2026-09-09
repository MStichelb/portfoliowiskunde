import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/admin/actions", () => ({
  deleteExerciseNoteAction: vi.fn(),
  saveExerciseNoteAction: vi.fn(),
}));

import { ExerciseNoteButton } from "./exercise-note-button";

describe("ExerciseNoteButton", () => {
  it("shows an accessible empty-note status without rendering note content", () => {
    const markup = renderToStaticMarkup(<ExerciseNoteButton exerciseId="exercise-12a" exerciseCode="12a" customNote={null} notePosition="above_solution" />);
    expect(markup).toContain('aria-label="Notitie voor oefening 12a toevoegen"');
    expect(markup).toContain("lucide-square");
    expect(markup).not.toContain("Notitie verwijderen");
  });

  it("shows the checked status while keeping content out of the closed table control", () => {
    const markup = renderToStaticMarkup(<ExerciseNoteButton exerciseId="exercise-12a" exerciseCode="12a" customNote="Verborgen inhoud" notePosition="below_solution" />);
    expect(markup).toContain('aria-label="Notitie voor oefening 12a bewerken"');
    expect(markup).toContain("lucide-square-check-big");
    expect(markup).not.toContain("Verborgen inhoud");
  });

  it("opens with the existing note, selected position and delete confirmation", () => {
    const markup = renderToStaticMarkup(<ExerciseNoteButton exerciseId="exercise-12a" exerciseCode="12a" customNote={"Eerste regel\nTweede regel"} notePosition="below_solution" initiallyOpen />);
    expect(markup).toContain("Notitie bij oefening 12a");
    expect(markup).toContain("Eerste regel\nTweede regel");
    expect(markup).toMatch(/checked="" value="below_solution"/);
    expect(markup).toContain('maxLength="2000"');
    expect(markup).toContain("Notitie verwijderen");
  });

  it("defaults a new note to above the solution", () => {
    const markup = renderToStaticMarkup(<ExerciseNoteButton exerciseId="exercise-1" exerciseCode="1" customNote={null} notePosition="above_solution" initiallyOpen />);
    expect(markup).toMatch(/checked="" value="above_solution"/);
    expect(markup).not.toContain("Notitie verwijderen");
  });
});
