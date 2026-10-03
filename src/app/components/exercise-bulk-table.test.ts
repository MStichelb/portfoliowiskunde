import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/admin/actions", () => ({
  bulkExercisePublicationAction: vi.fn(),
  deleteExerciseNoteAction: vi.fn(),
  saveExerciseNoteAction: vi.fn(),
  saveExerciseLevelAction: vi.fn(),
  toggleExerciseAlternativeVisibilityAction: vi.fn(),
  toggleExerciseVisibilityAction: vi.fn(),
}));

import { ExerciseBulkTable, sectionSelectionState, toggleSectionSelection } from "./exercise-bulk-table";
import { DEFAULT_EXERCISE_LEVEL_PRESENTATION } from "@/lib/exercise-level-presentation";

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
      learningSpaceId: "space-5",
      spaceSlug: "5wis",
      exerciseLabelSingular: "OpGavE",
      exerciseLabelPlural: "OPGAVEN",
      levelPresentation: {
        ...DEFAULT_EXERCISE_LEVEL_PRESENTATION,
        uitdaging: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.uitdaging, color: "#123456" },
      },
      sections: [{ id: "section-1", title: "Deel", order: 1, exercises: [{
        id: "exercise-1", code: "1a", configuredVisible: true, status: { configuredVisibility: "visible", state: "visible", reason: null, effectiveFrom: null, effectiveUntil: null },
        levelSource: null, levelOverrideMode: "none", levelOverride: null, effectiveLevel: null,
        standardAssets: 1, alternativeAssets: 0, missingAssets: 0, showAlternativeToStudents: false,
        isIndexed: true, noteLabel: "Hint", customNote: "Geheime notitie-inhoud", notePosition: "above_solution",
      }, {
        id: "exercise-2", code: "1b", configuredVisible: true, status: { configuredVisibility: "visible", state: "visible", reason: null, effectiveFrom: null, effectiveUntil: null },
        levelSource: "basis", levelOverrideMode: "level", levelOverride: "uitdaging", effectiveLevel: "uitdaging",
        standardAssets: 1, alternativeAssets: 0, missingAssets: 0, showAlternativeToStudents: false,
        isIndexed: true, noteLabel: null, customNote: null, notePosition: "above_solution",
      }] }],
    }));

    expect(markup).toContain(">Notitie<");
    expect(markup).toContain("Opgaven per onderdeel");
    expect(markup).toContain("<th>Opgave</th>");
    expect(markup).toContain("<th>Niveau</th>");
    expect(markup).toContain("Geen niveau");
    expect(markup).toContain("Uitdaging");
    expect(markup).toContain("background-color:#D0D6DD;color:#123456");
    expect(markup).toContain('aria-label="Niveau wijzigen: Geen niveau, handmatig ingesteld"');
    expect(markup).toContain('name="returnContext" value="portfolio"');
    expect(markup).toContain('popover="auto"');
    expect(markup).toContain('value="inherit" role="menuitemradio"');
    expect(markup).toContain('value="none" role="menuitemradio"');
    expect(markup).toContain('aria-label="Handmatig ingesteld"');
    expect(markup).toContain("Bronniveau: Basis");
    expect(markup).toContain(">Opgave 1a</a>");
    expect(markup).toContain('aria-label="Notitie voor opgave 1a bewerken"');
    expect(markup).not.toContain("Geheime notitie-inhoud");
    expect(markup).not.toContain(">Hint<");
    expect(markup).toContain('colSpan="7"');
  });
});
