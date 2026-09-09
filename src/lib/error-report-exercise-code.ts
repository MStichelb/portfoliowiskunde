const EXERCISE_CODE = /^\d+[a-z]?$/;

export interface ErrorReportExerciseIdentity {
  id: string;
  code: string;
  hasAlternativeSolution: boolean;
  visible: boolean;
}

export function normalizeErrorReportExerciseCode(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return EXERCISE_CODE.test(normalized) ? normalized : null;
}

export function listErrorReportExerciseIdentities(
  sections: readonly { exercises: readonly ErrorReportExerciseIdentity[] }[],
): ErrorReportExerciseIdentity[] {
  return sections.flatMap((section) => section.exercises);
}
