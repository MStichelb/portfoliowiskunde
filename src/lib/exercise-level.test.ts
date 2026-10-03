import { describe, expect, it } from "vitest";

import {
  exerciseLevelMetadata,
  resolveEffectiveExerciseLevel,
  validateExerciseLevelOverrideInput,
} from "./exercise-level";

describe("exercise level domain", () => {
  it("resolves inherited source levels", () => {
    expect(resolveEffectiveExerciseLevel({ levelSource: null, levelOverrideMode: "inherit", levelOverride: null })).toBeNull();
    expect(resolveEffectiveExerciseLevel({ levelSource: "basis", levelOverrideMode: "inherit", levelOverride: null })).toBe("basis");
  });

  it("resolves an explicit level override", () => {
    expect(resolveEffectiveExerciseLevel({ levelSource: "basis", levelOverrideMode: "level", levelOverride: "uitdaging" }))
      .toBe("uitdaging");
  });

  it("resolves explicit none independently of the source level", () => {
    expect(resolveEffectiveExerciseLevel({ levelSource: "basis", levelOverrideMode: "none", levelOverride: null })).toBeNull();
  });

  it("ignores stale overrides in inherit and none modes", () => {
    expect(exerciseLevelMetadata({ levelSource: "basis", levelOverrideMode: "inherit", levelOverride: "verdieping" }))
      .toMatchObject({ effectiveLevel: "basis", levelOverride: "verdieping" });
    expect(exerciseLevelMetadata({ levelSource: "basis", levelOverrideMode: "none", levelOverride: "uitdaging" }))
      .toMatchObject({ effectiveLevel: null, levelOverride: "uitdaging" });
  });

  it("validates all supported mutation modes", () => {
    expect(validateExerciseLevelOverrideInput({ mode: "inherit" })).toEqual({ mode: "inherit" });
    expect(validateExerciseLevelOverrideInput({ mode: "level", level: "opwarmer" })).toEqual({ mode: "level", level: "opwarmer" });
    expect(validateExerciseLevelOverrideInput({ mode: "none" })).toEqual({ mode: "none" });
  });

  it("rejects level mode without a valid level", () => {
    expect(() => validateExerciseLevelOverrideInput({ mode: "level" })).toThrow("geldig oefeningniveau");
    expect(() => validateExerciseLevelOverrideInput({ mode: "level", level: "expert" })).toThrow("geldig oefeningniveau");
    expect(() => validateExerciseLevelOverrideInput({ mode: "automatic" })).toThrow("Ongeldige modus");
  });
});
