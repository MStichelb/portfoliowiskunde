export const SOLUTION_IMAGE_MAX_SCALE = 1.2;

export function solutionImageMaxDisplayWidth(naturalWidth: number) {
  if (!Number.isFinite(naturalWidth) || naturalWidth <= 0) return null;
  return naturalWidth * SOLUTION_IMAGE_MAX_SCALE;
}
