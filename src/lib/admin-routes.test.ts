import { describe, expect, it } from "vitest";

import { adminExerciseNoteReturnHref, adminExercisePortfolioHref } from "./admin-routes";

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

  it("allows only the known inbox context and never an external return URL", () => {
    expect(adminExerciseNoteReturnHref("5wis", "portfolio-1", "exercise-1", "error-inbox")).toBe("/admin/5wis/foutmeldingen");
    expect(adminExerciseNoteReturnHref("5wis", "portfolio-1", "exercise-1", "portfolio")).toBe("/admin/5wis/portfolio/portfolio-1#exercise-exercise-1");
    expect(adminExerciseNoteReturnHref("5wis", "portfolio-1", "exercise-1", "https://evil.example")).toBe("/admin/5wis/portfolio/portfolio-1#exercise-exercise-1");
  });
});
