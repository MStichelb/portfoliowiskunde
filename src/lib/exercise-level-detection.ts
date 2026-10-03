import { EXERCISE_LEVELS, type ExerciseLevel } from "@/lib/exercise-level";
import type { ExerciseLevelRecognitionConfig } from "@/lib/source-profile-config";

export interface ExerciseLevelDetectionSource {
  name: string;
  directorySegments: readonly string[];
}

export interface ExerciseLevelDetectionResult {
  level: ExerciseLevel | null;
  conflict: boolean;
}

/**
 * Pure recognition over an already selected exercise directory or exercise resource.
 * Directory segments must be scoped by the caller to the current exercise context;
 * portfolio and section ancestors must never be included.
 */
export function detectExerciseLevelFromSource(
  sources: readonly ExerciseLevelDetectionSource[],
  config: ExerciseLevelRecognitionConfig,
): ExerciseLevelDetectionResult {
  if (config.method === "none" || sources.length === 0) return { level: null, conflict: false };
  const matches = new Set<ExerciseLevel>();

  for (const source of sources) {
    if (config.method === "subdirectory") {
      for (const segment of source.directorySegments) {
        const candidate = canonical(segment);
        for (const level of EXERCISE_LEVELS) {
          const expected = canonical(config.mapping[level]);
          if (expected && candidate === expected) matches.add(level);
        }
      }
      continue;
    }

    const tokens = nameTokens(source.name);
    for (const level of EXERCISE_LEVELS) {
      const code = canonical(config.mapping[level]);
      if (!code) continue;
      const expected = config.convention === "prefixed_code" ? `${canonical(config.prefix)}${code}` : code;
      if (tokens.includes(expected)) matches.add(level);
    }
  }

  if (matches.size !== 1) return { level: null, conflict: matches.size > 1 };
  return { level: [...matches][0], conflict: false };
}

function nameTokens(name: string): string[] {
  const stem = name.replace(/\.[^.]+$/, "");
  return canonical(stem).split(/[^a-z0-9]+/).filter(Boolean);
}

function canonical(value: string): string {
  return value.trim().toLocaleLowerCase("nl");
}
