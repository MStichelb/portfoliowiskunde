export const EXERCISE_LEVELS = ["opwarmer", "basis", "uitdaging", "verdieping"] as const;
export type ExerciseLevel = (typeof EXERCISE_LEVELS)[number];

export const EXERCISE_LEVEL_OVERRIDE_MODES = ["inherit", "level", "none"] as const;
export type ExerciseLevelOverrideMode = (typeof EXERCISE_LEVEL_OVERRIDE_MODES)[number];

export interface ExerciseLevelMetadata {
  levelSource: ExerciseLevel | null;
  levelOverrideMode: ExerciseLevelOverrideMode;
  levelOverride: ExerciseLevel | null;
  effectiveLevel: ExerciseLevel | null;
}

export type ExerciseLevelOverrideInput =
  | { mode: "inherit" }
  | { mode: "level"; level: ExerciseLevel }
  | { mode: "none" };

export function isExerciseLevel(value: unknown): value is ExerciseLevel {
  return typeof value === "string" && (EXERCISE_LEVELS as readonly string[]).includes(value);
}

export function isExerciseLevelOverrideMode(value: unknown): value is ExerciseLevelOverrideMode {
  return typeof value === "string" && (EXERCISE_LEVEL_OVERRIDE_MODES as readonly string[]).includes(value);
}

export function parseNullableExerciseLevel(value: unknown): ExerciseLevel | null {
  if (value === null || value === undefined || value === "") return null;
  if (isExerciseLevel(value)) return value;
  throw new Error("Ongeldig oefeningniveau.");
}

export function parseExerciseLevelOverrideMode(value: unknown): ExerciseLevelOverrideMode {
  if (isExerciseLevelOverrideMode(value)) return value;
  throw new Error("Ongeldige modus voor het oefeningniveau.");
}

export function resolveEffectiveExerciseLevel(input: {
  levelSource: ExerciseLevel | null;
  levelOverrideMode: ExerciseLevelOverrideMode;
  levelOverride: ExerciseLevel | null;
}): ExerciseLevel | null {
  if (input.levelOverrideMode === "none") return null;
  if (input.levelOverrideMode === "level") return input.levelOverride;
  return input.levelSource;
}

export function exerciseLevelMetadata(input: {
  levelSource: unknown;
  levelOverrideMode: unknown;
  levelOverride: unknown;
}): ExerciseLevelMetadata {
  const levelSource = parseNullableExerciseLevel(input.levelSource);
  const levelOverrideMode = parseExerciseLevelOverrideMode(input.levelOverrideMode);
  const levelOverride = parseNullableExerciseLevel(input.levelOverride);
  return {
    levelSource,
    levelOverrideMode,
    levelOverride,
    effectiveLevel: resolveEffectiveExerciseLevel({ levelSource, levelOverrideMode, levelOverride }),
  };
}

export function validateExerciseLevelOverrideInput(input: unknown): ExerciseLevelOverrideInput {
  if (!input || typeof input !== "object") throw new Error("Ongeldige niveau-instelling.");
  const candidate = input as { mode?: unknown; level?: unknown };
  const mode = parseExerciseLevelOverrideMode(candidate.mode);
  if (mode === "level") {
    if (!isExerciseLevel(candidate.level)) throw new Error("Kies een geldig oefeningniveau.");
    return { mode, level: candidate.level };
  }
  return { mode };
}
