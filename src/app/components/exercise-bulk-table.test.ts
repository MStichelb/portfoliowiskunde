import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/admin/actions", () => ({
  bulkExercisePublicationAction: vi.fn(),
  deleteExerciseNoteAction: vi.fn(),
  saveExerciseNoteAction: vi.fn(),
  toggleExerciseAlternativeVisibilityAction: vi.fn(),
  toggleExerciseVisibilityAction: vi.fn(),
}));

import { ExerciseBulkTable, sectionSelectionState, toggleSectionSelection } from "./exercise-bulk-table";

describe("exercise section selection", () => {
  const sectionIds = ["exercise-1", "exercise-2", "exercise-3"];

  it("selects only all exercises from the requested section", () => {
    const selected = toggleSectionSelection(new Set(["other-exercise"]), sectionIds);
    expect([...selected].sort()).toEqual(["exercise-1", "exercise-2", "exercise-3", "other-exercise"]);
    expect(sectionSelectionState(sectionIds, selected)).toEqual({ checked: true, indeterminate: false });
  });

  it("deselects a fully selected section without changing other selections", () => {
    const selected = toggleSectionSelection(new Set([...sectionIds, "other-exercise"]), sectionIds);
    expect([...selected]).toEqual(["other-exercise"]);
  });

  it("reports an indeterminate section when only part is selected", () => {
    expect(sectionSelectionState(sectionIds, new Set(["exercise-2"]))).toEqual({ checked: false, indeterminate: true });
  });

  it("shows note presence without exposing note content in the table", () => {
    const markup = renderToStaticMarkup(createElement(ExerciseBulkTable, {
      portfolioId: "portfolio-1",
      spaceSlug: "5wis",
      exerciseLabelSingular: "OpGavE",
      exerciseLabelPlural: "OPGAVEN",
      sections: [{ id: "section-1", title: "Deel", order: 1, exercises: [{
        id: "exercise-1", code: "1a", configuredVisible: true, status: { configuredVisibility: "visible", state: "visible", reason: null, effectiveFrom: null, effectiveUntil: null },
        standardAssets: 1, alternativeAssets: 0, missingAssets: 0, showAlternativeToStudents: false,
        isIndexed: true, noteLabel: "Hint", customNote: "Geheime notitie-inhoud", notePosition: "above_solution",
      }] }],
    }));

    expect(markup).toContain(">Notitie<");
    expect(markup).toContain("Opgaven per onderdeel");
    expect(markup).toContain("<th>Opgave</th>");
    expect(markup).toContain(">Opgave 1a</a>");
    expect(markup).toContain('aria-label="Notitie voor opgave 1a bewerken"');
    expect(markup).not.toContain("Geheime notitie-inhoud");
    expect(markup).not.toContain(">Hint<");
    expect(markup).toContain('colSpan="6"');
  });
});
