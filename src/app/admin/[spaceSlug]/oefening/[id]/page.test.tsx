import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  canManageLearningSpace: vi.fn(),
  getAdminLearningSpaceBySlug: vi.fn(),
  getAdminExercise: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }) }));
vi.mock("@/lib/auth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/authorization", () => ({ canManageLearningSpace: mocks.canManageLearningSpace }));
vi.mock("@/lib/repositories", () => ({
  getAdminLearningSpaceBySlug: mocks.getAdminLearningSpaceBySlug,
  getAdminExercise: mocks.getAdminExercise,
}));
vi.mock("@/app/components/admin-space-header", () => ({ AdminSpaceHeader: () => null }));
vi.mock("@/app/components/solution-image", () => ({ SolutionImage: () => null }));
vi.mock("@/app/components/solution-variant-heading", () => ({ SolutionVariantHeading: () => null }));

import LearningSpaceAdminExercisePage from "./page";

describe("LearningSpace admin exercise terminology", () => {
  beforeEach(() => {
    mocks.requireAdminUser.mockResolvedValue({ id: "teacher", role: "teacher", status: "active" });
    mocks.canManageLearningSpace.mockResolvedValue(true);
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue({
      id: "space-1", slug: "fysica", collectionLabelSingular: "bunDEL", exerciseLabelSingular: "OpGavE",
    });
    mocks.getAdminExercise.mockResolvedValue({
      id: "exercise-1c", code: "1c", portfolioId: "portfolio-1", portfolioTitle: "Krachten",
      sectionTitle: "Basis", isIndexed: true, resources: [],
    });
  });

  it("normalizes the exercise heading and inline collection backlink", async () => {
    const markup = renderToStaticMarkup(await LearningSpaceAdminExercisePage({ params: Promise.resolve({ spaceSlug: "fysica", id: "exercise-1c" }) }));

    expect(markup).toContain("Opgave 1c");
    expect(markup).toContain("Terug naar bundel");
    expect(markup).not.toContain("OpGavE");
    expect(markup).not.toContain("bunDEL");
  });
});
