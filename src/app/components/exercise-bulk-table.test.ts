import { describe, expect, it } from "vitest";

import { sectionSelectionState, toggleSectionSelection } from "./exercise-bulk-table";

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
});
