export function adminExercisePortfolioHref(spaceSlug: string, portfolioId: string, exerciseId: string): string {
  return `/admin/${encodeURIComponent(spaceSlug)}/portfolio/${encodeURIComponent(portfolioId)}#exercise-${encodeURIComponent(exerciseId)}`;
}

export type ExerciseNoteReturnContext = "portfolio" | "exercise" | "error-inbox";

export function adminExerciseNoteReturnHref(
  spaceSlug: string,
  portfolioId: string,
  exerciseId: string,
  returnContext: string,
): string {
  if (returnContext === "error-inbox") return `/admin/${encodeURIComponent(spaceSlug)}/foutmeldingen`;
  if (returnContext === "exercise") return `/admin/${encodeURIComponent(spaceSlug)}/oefening/${encodeURIComponent(exerciseId)}`;
  return adminExercisePortfolioHref(spaceSlug, portfolioId, exerciseId);
}
