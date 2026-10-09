import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sync: vi.fn(), compare: vi.fn(), switchSource: vi.fn(),
  writes: Object.fromEntries(["archiveMissingIndexItems", "createTheme", "updateTheme", "moveTheme", "deleteTheme", "setPortfolioExternalLinks", "setSectionPublication", "setExercisePublication", "setExerciseVisibility", "setExerciseAlternativeVisibility", "setExerciseNote", "setExerciseLevelOverride", "deleteErrorReport", "deleteOldDoneErrorThreads", "setErrorReportThreadStatus", "toggleErrorReportThreadPin"].map((name) => [name, vi.fn()])),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdminUser: async () => ({ id: "teacher", role: "teacher", status: "active" }), requireAdmin: vi.fn(), endAdminSession: vi.fn() }));
vi.mock("@/lib/authorization", () => ({ requireLearningSpaceManagement: vi.fn(), requireLearningSpaceConfiguration: vi.fn(), requireLearningSpaceCreation: vi.fn() }));
vi.mock("@/lib/repositories", () => ({
  ...mocks.writes,
  getLearningSpace: async () => ({ id: "space", slug: "wis", isActive: true }),
  getAdminExercise: async () => ({ id: "exercise", portfolioId: "portfolio", learningSpaceId: "space" }),
  getAdminPortfolioAny: async () => ({ id: "portfolio", learningSpaceId: "space", globalResources: [], sections: [{ id: "section", publishFrom: null, publishUntil: null, exercises: [] }], exercises: [{ id: "exercise", assets: [{ variant: "alternative", isIndexed: true }] }] }),
  getErrorReportLearningSpaceId: async () => "space",
  getErrorReportThreadLearningSpaceId: async () => "space",
}));
vi.mock("@/lib/sync", () => ({ synchronizeSource: mocks.sync }));
vi.mock("@/lib/source-switch", () => ({ compareLearningSpaceSources: mocks.compare, switchLearningSpaceSource: mocks.switchSource }));
import { SourceAccessError, SourceConfigurationError } from "@/lib/source-errors";
import { archiveMissingIndexAction, bulkExercisePublicationAction, compareSourcesAction, createThemeAction, deleteErrorReportAction, deleteExerciseNoteAction, deleteOldDoneErrorThreadsAction, deleteThemeAction, errorReportThreadPinAction, errorReportThreadStatusAction, moveThemeAction, saveExerciseLevelAction, saveExerciseNoteAction, savePortfolioExternalLinksAction, saveSectionPublicationAction, saveThemeAction, switchSourceAction, syncSpaceAction, toggleExerciseAlternativeVisibilityAction, toggleExerciseVisibilityAction } from "./actions";

const form = () => {
  const data = new FormData();
  for (const [key, value] of Object.entries({ id: "exercise", learningSpaceId: "space", portfolioId: "portfolio", name: "Thema", direction: "up", mode: "visible", customNote: "Notitie", notePosition: "above_solution", levelChoice: "none", threadId: "thread", status: "TODO", targetSourceId: "mirror" })) data.set(key, value);
  data.append("exerciseIds", "exercise");
  return data;
};
beforeEach(() => { vi.resetAllMocks(); mocks.sync.mockResolvedValue({ skipped: false }); });

describe("mutation failure mapping after authorization", () => {
  it.each([
    [archiveMissingIndexAction, "archiveMissingIndexItems"], [createThemeAction, "createTheme"], [saveThemeAction, "updateTheme"], [moveThemeAction, "moveTheme"], [deleteThemeAction, "deleteTheme"],
    [savePortfolioExternalLinksAction, "setPortfolioExternalLinks"], [toggleExerciseVisibilityAction, "setExerciseVisibility"], [toggleExerciseAlternativeVisibilityAction, "setExerciseAlternativeVisibility"],
    [saveExerciseNoteAction, "setExerciseNote"], [deleteExerciseNoteAction, "setExerciseNote"], [saveExerciseLevelAction, "setExerciseLevelOverride"],
    [deleteErrorReportAction, "deleteErrorReport"], [deleteOldDoneErrorThreadsAction, "deleteOldDoneErrorThreads"], [errorReportThreadStatusAction, "setErrorReportThreadStatus"], [errorReportThreadPinAction, "toggleErrorReportThreadPin"],
  ] as const)("returns safe operational feedback from %s", async (action, write) => {
    mocks.writes[write].mockRejectedValueOnce(new Error("SQL password=secret"));
    const result = await action(form());
    expect(result).toEqual({ error: expect.stringContaining("Probeer opnieuw.") });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
  it("separates section planning validation from persistence failure", async () => {
    const data = form(); data.set("id", "section"); data.set("publicationMode", "scheduled"); data.set("publishFrom", "2026-10-10T12:00"); data.set("publishUntil", "2026-10-09T12:00");
    expect(await saveSectionPublicationAction(data)).toEqual({ validationError: "De einddatum moet na de begindatum liggen." });
    expect(mocks.writes.setSectionPublication).not.toHaveBeenCalled();
    data.set("publishUntil", "2026-10-11T12:00");
    await saveSectionPublicationAction(data);
    expect(mocks.writes.setSectionPublication).toHaveBeenCalledOnce();
    mocks.writes.setSectionPublication.mockRejectedValueOnce(new Error("storage"));
    expect(await saveSectionPublicationAction(data)).toEqual({ error: expect.stringContaining("planning") });
  });
  it("supports successful bulk completion and maps its storage failure", async () => {
    expect(await bulkExercisePublicationAction({ error: null }, form())).toEqual({ error: null });
    mocks.writes.setExercisePublication.mockRejectedValueOnce(new Error("storage"));
    expect(await bulkExercisePublicationAction({ error: null }, form())).toEqual({ error: expect.stringContaining("bulk") });
  });
});

describe("synchronization and source feedback", () => {
  it("returns an explicit completed sync result", async () => {
    expect(await syncSpaceAction({ error: null }, form())).toEqual({ error: null, success: true });
  });
  it("maps known and unexpected sync failures and retains conflict recovery text", async () => {
    mocks.sync.mockRejectedValueOnce(new SourceAccessError("Bron niet bereikbaar."));
    expect(await syncSpaceAction({ error: null }, form())).toEqual({ error: "Bron niet bereikbaar." });
    mocks.sync.mockRejectedValueOnce(new Error("SQL secret"));
    expect(await syncSpaceAction({ error: null }, form())).toEqual({ error: expect.stringContaining("Synchroniseren is niet gelukt") });
    const conflict = "Oefeningscode 3b komt meerdere keren voor binnen portfolio 1B: a en b";
    mocks.sync.mockRejectedValueOnce(new Error(conflict));
    expect(await syncSpaceAction({ error: null }, form())).toEqual({ error: conflict });
  });
  it.each([[compareSourcesAction, "compare"], [switchSourceAction, "switchSource"]] as const)("separates source configuration from technical failure for %s", async (action, key) => {
    mocks[key].mockRejectedValueOnce(new SourceConfigurationError("Kies een geldige bron."));
    expect(await action({ error: null }, form())).toMatchObject({ error: "Kies een geldige bron.", technical: false });
    mocks[key].mockRejectedValueOnce(new Error("SQL secret"));
    const result = await action({ error: null }, form());
    expect(result.technical).toBe(true);
    expect(result.error).not.toContain("secret");
  });
});
