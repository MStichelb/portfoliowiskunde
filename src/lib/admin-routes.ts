export function adminExercisePortfolioHref(spaceSlug: string, portfolioId: string, exerciseId: string): string {
  return `/admin/${encodeURIComponent(spaceSlug)}/portfolio/${encodeURIComponent(portfolioId)}#exercise-${encodeURIComponent(exerciseId)}`;
}
