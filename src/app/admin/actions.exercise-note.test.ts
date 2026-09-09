import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminExercise: vi.fn(),
  getLearningSpace: vi.fn(),
  redirect: vi.fn(),
  requireAdminUser: vi.fn(),
  requireLearningSpaceManagement: vi.fn(),
  revalidatePath: vi.fn(),
  setExerciseNote: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth")>(),
  requireAdminUser: mocks.requireAdminUser,
}));
vi.mock("@/lib/authorization", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/authorization")>(),
  requireLearningSpaceManagement: mocks.requireLearningSpaceManagement,
}));
vi.mock("@/lib/repositories", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/repositories")>(),
  getAdminExercise: mocks.getAdminExercise,
  getLearningSpace: mocks.getLearningSpace,
  setExerciseNote: mocks.setExerciseNote,
}));

import { deleteExerciseNoteAction, saveExerciseNoteAction } from "./actions";

describe("exercise note actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminUser.mockResolvedValue({ id: "teacher-1", role: "teacher", status: "active" });
    mocks.getAdminExercise.mockResolvedValue({ id: "exercise-1", portfolioId: "portfolio-1", learningSpaceId: "space-5" });
    mocks.getLearningSpace.mockResolvedValue({ id: "space-5", slug: "5wis" });
  });

  it("authorizes through the exercise and stores normalized multiline content", async () => {
    await saveExerciseNoteAction(noteForm("  Eerste regel\nTweede regel  ", "below_solution", "  Hint  "));

    expect(mocks.getAdminExercise).toHaveBeenCalledWith("exercise-1");
    expect(mocks.requireLearningSpaceManagement).toHaveBeenCalledWith(expect.objectContaining({ id: "teacher-1" }), "space-5");
    expect(mocks.setExerciseNote).toHaveBeenCalledWith("exercise-1", "Eerste regel\nTweede regel", "Hint", "below_solution");
    expect(mocks.redirect).toHaveBeenCalledWith("/admin/5wis/portfolio/portfolio-1#exercise-exercise-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/5wis/foutmeldingen");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/5wis/oefening/exercise-1");
  });

  it("normalizes an empty note and accepts the default position", async () => {
    await saveExerciseNoteAction(noteForm("   ", "above_solution"));
    expect(mocks.setExerciseNote).toHaveBeenCalledWith("exercise-1", null, null, "above_solution");
  });

  it("rejects invalid note content or position before mutation", async () => {
    await expect(saveExerciseNoteAction(noteForm("A".repeat(2_001), "above_solution"))).rejects.toThrow("Ongeldige oefeningnotitie");
    await expect(saveExerciseNoteAction(noteForm("Notitie", "above_solution", "A".repeat(41)))).rejects.toThrow("Ongeldige oefeningnotitie");
    await expect(saveExerciseNoteAction(noteForm("Notitie", "between_assets"))).rejects.toThrow("Ongeldige oefeningnotitie");
    expect(mocks.setExerciseNote).not.toHaveBeenCalled();
  });

  it("does not trust a client LearningSpace and blocks unauthorized mutation", async () => {
    mocks.requireLearningSpaceManagement.mockRejectedValueOnce(new Error("Geen beheerrechten."));
    const formData = noteForm("Notitie", "above_solution");
    formData.set("learningSpaceId", "space-other");

    await expect(saveExerciseNoteAction(formData)).rejects.toThrow("Geen beheerrechten");
    expect(mocks.requireLearningSpaceManagement).toHaveBeenCalledWith(expect.anything(), "space-5");
    expect(mocks.setExerciseNote).not.toHaveBeenCalled();
  });

  it("deletes an existing note by resetting it to the default", async () => {
    const formData = new FormData();
    formData.set("id", "exercise-1");
    await deleteExerciseNoteAction(formData);

    expect(mocks.setExerciseNote).toHaveBeenCalledWith("exercise-1", null, null, "above_solution");
    expect(mocks.requireLearningSpaceManagement).toHaveBeenCalledWith(expect.anything(), "space-5");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/5wis/foutmeldingen");
  });
});

function noteForm(customNote: string, notePosition: string, noteLabel = "") {
  const formData = new FormData();
  formData.set("id", "exercise-1");
  formData.set("customNote", customNote);
  formData.set("noteLabel", noteLabel);
  formData.set("notePosition", notePosition);
  return formData;
}
