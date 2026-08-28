import { describe, expect, it } from "vitest";

import { solutionImageMaxDisplayWidth } from "./solution-image";

describe("solution image display width", () => {
  it("limits upscaling to 120 percent of the intrinsic width", () => {
    expect(solutionImageMaxDisplayWidth(800)).toBe(960);
    expect(solutionImageMaxDisplayWidth(1_200)).toBe(1_440);
    expect(solutionImageMaxDisplayWidth(1_600)).toBe(1_920);
  });

  it("ignores unavailable intrinsic dimensions", () => {
    expect(solutionImageMaxDisplayWidth(0)).toBeNull();
    expect(solutionImageMaxDisplayWidth(Number.NaN)).toBeNull();
  });
});
