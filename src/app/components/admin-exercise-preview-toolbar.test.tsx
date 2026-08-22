import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { adminExercisePortfolioHref } from "@/lib/admin-routes";

import { AdminExercisePreviewToolbar } from "./admin-exercise-preview-toolbar";

describe("AdminExercisePreviewToolbar", () => {
  it("uses the exact admin portfolio route beside the admin notice", () => {
    const href = adminExercisePortfolioHref("google", "portfolio-provider-id", "exercise-provider-id");
    const markup = renderToStaticMarkup(<AdminExercisePreviewToolbar portfolioHref={href} />);

    expect(markup).toContain('href="/admin/google/portfolio/portfolio-provider-id#exercise-exercise-provider-id"');
    expect(markup).toContain("lucide-arrow-left");
    expect(markup).toContain("Terug naar portfolio");
    expect(markup).toContain("Adminweergave");
    expect(markup).not.toContain('href="/google/portfolio/');
  });
});
