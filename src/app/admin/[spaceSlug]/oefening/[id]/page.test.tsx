import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/components/flash-toast", () => ({
  useToast: () => vi.fn(),
  ExerciseNoteFeedback: () => null,
  FlashToast: ({ type, message, feedbackKey }: { type: string; message: string; feedbackKey?: string }) => <span data-toast={type} data-feedback-key={feedbackKey}>{message}</span>,
}));


const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  canManageLearningSpace: vi.fn(),
  getAdminLearningSpaceBySlug: vi.fn(),
  getAdminExercise: vi.fn(),
  saveExerciseLevelAction: vi.fn(),
  toggleExerciseVisibilityAction: vi.fn(),
  toggleExerciseAlternativeVisibilityAction: vi.fn(),
  saveExerciseNoteAction: vi.fn(),
  deleteExerciseNoteAction: vi.fn(),
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
vi.mock("@/app/admin/actions", () => ({
  saveExerciseLevelAction: mocks.saveExerciseLevelAction,
  toggleExerciseVisibilityAction: mocks.toggleExerciseVisibilityAction,
  toggleExerciseAlternativeVisibilityAction: mocks.toggleExerciseAlternativeVisibilityAction,
  saveExerciseNoteAction: mocks.saveExerciseNoteAction,
  deleteExerciseNoteAction: mocks.deleteExerciseNoteAction,
}));

import LearningSpaceAdminExercisePage from "./page";
import { DEFAULT_EXERCISE_LEVEL_PRESENTATION } from "@/lib/exercise-level-presentation";

describe("LearningSpace admin exercise terminology", () => {
  it("uses the configured exercise term when the source item is missing", async () => {
    mocks.getAdminExercise.mockResolvedValue({ ...(await mocks.getAdminExercise()), isIndexed: false });
    const markup = renderToStaticMarkup(await LearningSpaceAdminExercisePage({ params: Promise.resolve({ spaceSlug: "fysica", id: "exercise-1c" }) }));
    expect(markup).toContain("Opgave is niet meer aanwezig in de bronmap.");
    expect(markup).toContain("De historische metadata blijft behouden tot je de index opschoont.");
    expect(markup).not.toContain("Deze oefening");
  });

  it("shows the portfolio and existing controls for a direct exercise without a null section label", async () => {
    mocks.getAdminExercise.mockResolvedValue({ ...(await mocks.getAdminExercise()), sectionCode: null, sectionTitle: null });
    const markup = renderToStaticMarkup(await LearningSpaceAdminExercisePage({ params: Promise.resolve({ spaceSlug: "fysica", id: "exercise-1c" }) }));
    expect(markup).toContain("<p>Krachten</p>");
    expect(markup).toContain("Eigen status");
    expect(markup.split("<script>")[0]).not.toContain("null");
    expect(markup).not.toContain("1.1 Basis");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminUser.mockResolvedValue({ id: "teacher", role: "teacher", status: "active" });
    mocks.canManageLearningSpace.mockResolvedValue(true);
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue({
      id: "space-1", slug: "fysica", collectionLabelSingular: "bunDEL", exerciseLabelSingular: "OpGavE",
      levelPresentation: {
        ...DEFAULT_EXERCISE_LEVEL_PRESENTATION,
        basis: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.basis, displayName: "Kern" },
        uitdaging: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.uitdaging, displayName: "Plus", symbolId: "large_circle", count: 2, color: "#123456" },
      },
    });
    mocks.getAdminExercise.mockResolvedValue({
      id: "exercise-1c", code: "1c", portfolioId: "portfolio-1", portfolioTitle: "Krachten",
      sectionCode: "1.1", sectionTitle: "Basis", isIndexed: true, resources: [], levelSource: "basis",
      levelOverrideMode: "level", levelOverride: "uitdaging", effectiveLevel: "uitdaging",
      visibilityMode: "visible", effectiveStatus: { configuredVisibility: "visible", state: "visible", reason: null, effectiveFrom: null, effectiveUntil: null },
      showAlternativeToStudents: true, standardAssets: 2, alternativeAssets: 1, missingAssets: 0,
      noteLabel: "Hint", customNote: "Controleer het teken.", notePosition: "above_solution",
    });
  });

  it("normalizes the exercise heading and inline collection backlink", async () => {
    const markup = renderToStaticMarkup(await LearningSpaceAdminExercisePage({ params: Promise.resolve({ spaceSlug: "fysica", id: "exercise-1c" }) }));

    expect(markup).toContain("Opgave 1c");
    expect(markup).toContain("Krachten - 1.1 Basis");
    expect(markup).not.toContain("1.1. Basis");
    expect(markup).toContain("Terug naar bundel");
    expect(markup).not.toContain("OpGavE");
    expect(markup).not.toContain("bunDEL");
  });

  it("renders the shared six-part exercise controls instead of the large level card", async () => {
    const markup = renderToStaticMarkup(await LearningSpaceAdminExercisePage({
      params: Promise.resolve({ spaceSlug: "fysica", id: "exercise-1c" }),
      searchParams: Promise.resolve({ levelSaved: "1" }),
    }));

    expect(markup).toContain("Niveau opgeslagen.");
    for (const heading of ["Niveau", "Notitie", "Eigen status", "Effectieve status", "Alternatieve uitwerking tonen", "Aantal bestanden"]) expect(markup).toContain(`<th${heading === "Aantal bestanden" ? ' title="Uitwerking, alternatieve uitwerking"' : ""}>${heading}</th>`);
    expect(markup).toContain('popover="auto"');
    expect(markup).toContain('value="level:uitdaging" role="menuitemradio" aria-checked="true"');
    expect(markup).toContain("Bronniveau: Kern");
    expect(markup).toContain('aria-label="Handmatig ingesteld"');
    expect(markup).toContain("background-color:#D0D6DD;color:#123456");
    expect(markup).toContain("⬤⬤");
    expect(markup).toContain('aria-label="Notitie voor opgave 1c bewerken"');
    expect(markup.match(/>Zichtbaar</g)).toHaveLength(2);
    expect(markup).toContain('aria-label="Alternatieve uitwerking voor opgave 1c tonen"');
    expect(markup).toContain('type="checkbox" checked=""');
    expect(markup).toContain("<td>2, 1</td>");
    expect(markup).toContain('name="returnContext" value="exercise"');
    expect(markup).not.toContain("exercise-level-card");
    expect(markup).not.toContain("exercise-level-form");
    expect(markup).not.toContain("<h2>Niveau</h2>");
    expect(markup).toContain("Opgave 1c");
    expect(markup).not.toContain("Oefening 1c");
  });

  it("shows Geen niveau for a null effective level", async () => {
    mocks.getAdminExercise.mockResolvedValue({
      ...(await mocks.getAdminExercise()),
      levelSource: null, levelOverrideMode: "none", levelOverride: null, effectiveLevel: null,
    });

    const markup = renderToStaticMarkup(await LearningSpaceAdminExercisePage({ params: Promise.resolve({ spaceSlug: "fysica", id: "exercise-1c" }) }));

    expect(markup).toContain('value="none" role="menuitemradio" aria-checked="true"');
    expect(markup).toContain("exercise-level-none");
  });

  it("keeps the existing LearningSpace authorization before loading exercise controls", async () => {
    mocks.canManageLearningSpace.mockResolvedValue(false);

    await expect(LearningSpaceAdminExercisePage({ params: Promise.resolve({ spaceSlug: "fysica", id: "exercise-1c" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.getAdminExercise).not.toHaveBeenCalled();
  });
});
