import { describe, expect, it } from "vitest";

import { adminExercisePortfolioHref } from "./admin-routes";

describe("admin exercise portfolio routes", () => {
  it("uses the loaded Google portfolio ID instead of deriving one from its code", () => {
    const portfolioId = "portfolio-CHjOVTF_De5KJmz0KX17n1iw1Qu8XL";
    const exerciseId = `${portfolioId}-section-1-exercise-1`;

    expect(adminExercisePortfolioHref("google", portfolioId, exerciseId)).toBe(
      `/admin/google/portfolio/${portfolioId}#exercise-${exerciseId}`,
    );
  });

  it("keeps identical PF1 portfolio codes separated by LearningSpace IDs", () => {
    const google = adminExercisePortfolioHref("google", "portfolio-google-pf1", "exercise-google-pf1");
    const local = adminExercisePortfolioHref("6", "portfolio-1", "exercise-local-pf1");

    expect(google).toBe("/admin/google/portfolio/portfolio-google-pf1#exercise-exercise-google-pf1");
    expect(local).toBe("/admin/6/portfolio/portfolio-1#exercise-exercise-local-pf1");
    expect(google).not.toBe(local);
  });
});
