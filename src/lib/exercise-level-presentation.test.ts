import { describe, expect, it } from "vitest";

import {
  DEFAULT_EXERCISE_LEVEL_PRESENTATION,
  defaultExerciseLevelPresentationItem,
  exerciseLevelPresentationFromRows,
  exerciseLevelVisual,
  resetExerciseLevelPresentation,
  validateExerciseLevelPresentation,
} from "./exercise-level-presentation";

describe("exercise level presentation", () => {
  it("defines the fixed default symbols", () => {
    expect(exerciseLevelVisual("opwarmer").symbols).toBe("★");
    expect(exerciseLevelVisual("basis").symbols).toBe("★★");
    expect(exerciseLevelVisual("uitdaging").symbols).toBe("★★★");
    expect(exerciseLevelVisual("verdieping").symbols).toBe("◆");
  });

  it("defines the original design colors as the central accent defaults", () => {
    expect(Object.fromEntries(Object.entries(DEFAULT_EXERCISE_LEVEL_PRESENTATION).map(([level, item]) => [level, item.color]))).toEqual({
      opwarmer: "#00B050",
      basis: "#BF8F00",
      uitdaging: "#C00000",
      verdieping: "#2E74B5",
    });
  });

  it("accepts stable symbol ids and counts from 1 through 4", () => {
    expect(validateExerciseLevelPresentation({
      opwarmer: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.opwarmer, symbolId: "circle", count: 1 },
      basis: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.basis, symbolId: "circle", count: 2 },
      uitdaging: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.uitdaging, symbolId: "circle", count: 3 },
      verdieping: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.verdieping, displayName: "Extra", symbolId: "circle", count: 4, color: "#ABCDEF" },
    }).verdieping).toEqual({ displayName: "Extra", symbolId: "circle", count: 4, color: "#ABCDEF", showPublicBackground: false });
  });

  it("keeps circle valid and supports the large circle at counts 1 through 4", () => {
    const presentation = validateExerciseLevelPresentation({
      opwarmer: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.opwarmer, symbolId: "circle", count: 1 },
      basis: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.basis, symbolId: "large_circle", count: 2 },
      uitdaging: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.uitdaging, symbolId: "large_circle", count: 3 },
      verdieping: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.verdieping, symbolId: "large_circle", count: 4 },
    });

    expect(presentation.opwarmer.symbolId).toBe("circle");
    expect(exerciseLevelVisual("verdieping", presentation).symbols).toBe("⬤⬤⬤⬤");
  });

  it.each([
    [{ ...DEFAULT_EXERCISE_LEVEL_PRESENTATION, basis: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.basis, symbolId: "heart" } }, "geldig symbool"],
    [{ ...DEFAULT_EXERCISE_LEVEL_PRESENTATION, basis: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.basis, count: 0 } }, "1 tot en met 4"],
    [{ ...DEFAULT_EXERCISE_LEVEL_PRESENTATION, basis: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.basis, count: 5 } }, "1 tot en met 4"],
    [{ ...DEFAULT_EXERCISE_LEVEL_PRESENTATION, basis: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.basis, displayName: "" } }, "naam van maximaal"],
    [{ ...DEFAULT_EXERCISE_LEVEL_PRESENTATION, basis: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.basis, color: "yellow" } }, "geldige kleur"],
  ])("rejects invalid configuration", (input, message) => {
    expect(() => validateExerciseLevelPresentation(input)).toThrow(message);
  });

  it("fills missing persisted rows from the central defaults", () => {
    expect(exerciseLevelPresentationFromRows([])).toEqual(DEFAULT_EXERCISE_LEVEL_PRESENTATION);
  });

  it("resets every configurable value for one level", () => {
    const customized = {
      ...DEFAULT_EXERCISE_LEVEL_PRESENTATION,
      uitdaging: { displayName: "Plus", symbolId: "circle" as const, count: 1, color: "#123456", showPublicBackground: true },
    };
    const reset = resetExerciseLevelPresentation(customized, "uitdaging");

    expect(reset.uitdaging).toEqual({
      displayName: "Uitdaging", symbolId: "star", count: 3, color: "#C00000", showPublicBackground: false,
    });
    expect(reset.basis).toBe(customized.basis);
    expect(defaultExerciseLevelPresentationItem("uitdaging")).toEqual(reset.uitdaging);
  });

  it("uses a custom color as the foreground and derives a light background", () => {
    const presentation = {
      ...DEFAULT_EXERCISE_LEVEL_PRESENTATION,
      basis: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.basis, displayName: "Kern", color: "#123456" },
    };
    expect(exerciseLevelVisual("basis", presentation)).toMatchObject({ label: "Kern", color: "#123456", backgroundColor: "#D0D6DD" });
  });

  it("always shows an admin background and respects the public setting independently", () => {
    const presentation = {
      ...DEFAULT_EXERCISE_LEVEL_PRESENTATION,
      basis: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.basis, showPublicBackground: true },
    };

    expect(exerciseLevelVisual("opwarmer", presentation, "admin").backgroundColor).not.toBeNull();
    expect(exerciseLevelVisual("opwarmer", presentation, "public").backgroundColor).toBeNull();
    expect(exerciseLevelVisual("basis", presentation, "public").backgroundColor).not.toBeNull();
    expect(presentation.uitdaging.showPublicBackground).toBe(false);
  });
});
