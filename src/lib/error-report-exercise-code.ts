const EXERCISE_CODE = /^\d+[a-z]?$/;

export function normalizeErrorReportExerciseCode(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return EXERCISE_CODE.test(normalized) ? normalized : null;
}
