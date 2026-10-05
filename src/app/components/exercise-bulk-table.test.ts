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
  it.each([false, true])("renders direct controls before real sections when present (mixed=%s)", (mixed: boolean) => {
    const props: Parameters<typeof ExerciseBulkTable>[0] = {
      portfolioId: "portfolio-1", learningSpaceId: "space-5", spaceSlug: "5wis", sections: [],
      exercises: [{
        id: "direct", code: "2", configuredVisible: true,
        status: { configuredVisibility: "visible", state: "visible", reason: null, effectiveFrom: null, effectiveUntil: null },
        levelSource: null, levelOverrideMode: "inherit", levelOverride: null, effectiveLevel: null,
        standardAssets: 1, alternativeAssets: 1, missingAssets: 0, showAlternativeToStudents: true,
        isIndexed: true, noteLabel: null, customNote: null, notePosition: "above_solution",
      }],
    };
    if (mixed) props.sections = [{ id: "real-section", code: "1", title: "Basis", exercises: [{ ...props.exercises![0], id: "section-exercise", code: "3" }] }];
    const markup = renderToStaticMarkup(createElement(ExerciseBulkTable, props));
    expect(markup).toContain('/admin/5wis/oefening/direct');
    expect(markup).toContain('aria-label="Oefening 2 selecteren"');
    expect(markup).toContain('aria-label="Alternatieve uitwerking voor oefening 2 tonen"');
    expect(markup.match(/class="section-table-row"/g)?.length ?? 0).toBe(mixed ? 1 : 0);
    if (mixed) {
      expect(markup.indexOf('id="exercise-direct"')).toBeLessThan(markup.indexOf("1. Basis"));
      expect(markup).toContain('/admin/5wis/oefening/section-exercise');
      expect(markup).toContain('aria-label="Alle oefeningen van 1. Basis selecteren"');
    }
    expect(markup).not.toContain("per onderdeel");
  });

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
      sections: [{ id: "section-1", code: "1.1", title: "Inleiding", exercises: [{
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
    expect(markup).toContain("1.1 Inleiding");
    expect(markup).not.toContain("1.1. Inleiding");
    expect(markup).toContain('aria-label="Alle opgaven van 1.1 Inleiding selecteren"');
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
