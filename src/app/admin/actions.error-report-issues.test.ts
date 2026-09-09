import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteErrorReport: vi.fn(),
  deleteOldDoneErrorThreads: vi.fn(),
  getErrorReportLearningSpaceId: vi.fn(),
  getErrorReportThreadLearningSpaceId: vi.fn(),
  getLearningSpace: vi.fn(),
  requireAdminUser: vi.fn(),
  requireLearningSpaceManagement: vi.fn(),
  revalidatePath: vi.fn(),
  saveErrorReportThreadNote: vi.fn(),
  setErrorReportHandled: vi.fn(),
  setErrorReportTeacherResponse: vi.fn(),
  setErrorReportTeacherResponseAndHandled: vi.fn(),
  setErrorReportThreadStatus: vi.fn(),
  toggleErrorReportThreadPin: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ endAdminSession: vi.fn(), requireAdmin: vi.fn(), requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/authorization", () => ({
  requireLearningSpaceConfiguration: vi.fn(),
  requireLearningSpaceCreation: vi.fn(),
  requireLearningSpaceManagement: mocks.requireLearningSpaceManagement,
}));
vi.mock("@/lib/repositories", () => ({
  deleteErrorReport: mocks.deleteErrorReport,
  deleteOldDoneErrorThreads: mocks.deleteOldDoneErrorThreads,
  getErrorReportLearningSpaceId: mocks.getErrorReportLearningSpaceId,
  getErrorReportThreadLearningSpaceId: mocks.getErrorReportThreadLearningSpaceId,
  getLearningSpace: mocks.getLearningSpace,
  saveErrorReportThreadNote: mocks.saveErrorReportThreadNote,
  setErrorReportHandled: mocks.setErrorReportHandled,
  setErrorReportTeacherResponse: mocks.setErrorReportTeacherResponse,
  setErrorReportTeacherResponseAndHandled: mocks.setErrorReportTeacherResponseAndHandled,
  setErrorReportThreadStatus: mocks.setErrorReportThreadStatus,
  toggleErrorReportThreadPin: mocks.toggleErrorReportThreadPin,
}));
vi.mock("@/lib/storage-connections", () => ({ ensureStorageConnection: vi.fn() }));

import {
  deleteErrorReportAction,
  deleteErrorReportTeacherResponseAction,
  deleteOldDoneErrorThreadsAction,
  errorReportStatusAction,
  errorReportThreadNoteAction,
  errorReportThreadPinAction,
  errorReportThreadStatusAction,
  saveErrorReportTeacherResponseAction,
} from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getErrorReportLearningSpaceId.mockResolvedValue("space-5");
  mocks.getErrorReportThreadLearningSpaceId.mockResolvedValue("space-5");
  mocks.getLearningSpace.mockResolvedValue({ id: "space-5", slug: "5wis" });
  mocks.requireLearningSpaceManagement.mockResolvedValue(undefined);
});

describe("error report thread management actions", () => {
  it("authorizes and mutates status, pin and note by trusted thread lookup", async () => {
    const actor = { id: "owner-1", role: "teacher", status: "active" };
    mocks.requireAdminUser.mockResolvedValue(actor);

    await errorReportThreadStatusAction(form({ threadId: "thread-1", status: "DONE" }));
    await errorReportThreadPinAction(form({ threadId: "thread-1" }));
    const result = await errorReportThreadNoteAction({ error: null }, form({ threadId: "thread-1", learningSpaceId: "other", note: "Nakijken" }));

    expect(mocks.getErrorReportThreadLearningSpaceId).toHaveBeenCalledWith("thread-1");
    expect(mocks.requireLearningSpaceManagement).toHaveBeenCalledWith(actor, "space-5");
    expect(mocks.setErrorReportThreadStatus).toHaveBeenCalledWith("thread-1", "DONE");
    expect(mocks.toggleErrorReportThreadPin).toHaveBeenCalledWith("thread-1");
    expect(mocks.saveErrorReportThreadNote).toHaveBeenCalledWith("thread-1", "Nakijken");
    expect(result).toEqual({ error: null, saved: true });
  });

  it("blocks missing, invalid and unauthorized thread mutations", async () => {
    mocks.getErrorReportThreadLearningSpaceId.mockResolvedValueOnce(null);
    await expect(errorReportThreadPinAction(form({ threadId: "missing" }))).rejects.toThrow("Foutmelding niet gevonden");
    await expect(errorReportThreadStatusAction(form({ threadId: "thread-1", status: "INVALID" }))).rejects.toThrow("Ongeldige meldingsstatus");
    mocks.requireLearningSpaceManagement.mockRejectedValueOnce(new Error("Geen beheerrechten."));
    await expect(errorReportThreadPinAction(form({ threadId: "thread-1" }))).rejects.toThrow("Geen beheerrechten");
  });
});

describe("error report lifecycle actions", () => {
  it.each([
    ["owner", { id: "owner-1", role: "teacher", status: "active" }],
    ["editor", { id: "editor-1", role: "teacher", status: "active" }],
    ["superadmin", { id: "superadmin-1", role: "superadmin", status: "active" }],
  ] as const)("authorizes teacher response save for an %s through the trusted report lookup", async (_role, actor) => {
    mocks.requireAdminUser.mockResolvedValue(actor);

    const result = await saveErrorReportTeacherResponseAction({ error: null, successCount: 0 }, form({
      id: "report-1",
      learningSpaceId: "untrusted-space",
      teacherResponse: "  Eerste regel\nTweede regel  ",
    }));

    expect(mocks.getErrorReportLearningSpaceId).toHaveBeenCalledWith("report-1");
    expect(mocks.requireLearningSpaceManagement).toHaveBeenCalledWith(actor, "space-5");
    expect(mocks.setErrorReportTeacherResponse).toHaveBeenCalledWith("report-1", "Eerste regel\nTweede regel");
    expect(result).toEqual({ error: null, successCount: 1 });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/mijn-meldingen");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/5wis");
  });

  it("blocks unauthorized response saves before mutation", async () => {
    mocks.requireAdminUser.mockResolvedValue({ id: "student-1", role: "student", status: "active" });
    mocks.requireLearningSpaceManagement.mockRejectedValueOnce(new Error("Geen beheerrechten."));

    await expect(saveErrorReportTeacherResponseAction({ error: null, successCount: 0 }, form({ id: "report-1", teacherResponse: "Bedankt" }))).rejects.toThrow("Geen beheerrechten");
    expect(mocks.setErrorReportTeacherResponse).not.toHaveBeenCalled();
  });

  it("saves a response and completes the report through one authorized transactional write", async () => {
    const actor = { id: "owner-1", role: "teacher", status: "active" };
    mocks.requireAdminUser.mockResolvedValue(actor);

    const result = await saveErrorReportTeacherResponseAction({ error: null, successCount: 0 }, form({
      id: "report-1",
      teacherResponse: " Goed gezien. ",
      markHandled: "true",
    }));

    expect(mocks.requireLearningSpaceManagement).toHaveBeenCalledWith(actor, "space-5");
    expect(mocks.setErrorReportTeacherResponseAndHandled).toHaveBeenCalledWith("report-1", "Goed gezien.");
    expect(mocks.setErrorReportTeacherResponse).not.toHaveBeenCalled();
    expect(result).toEqual({ error: null, successCount: 1 });
  });

  it("can complete a report through the response modal with an empty response", async () => {
    mocks.requireAdminUser.mockResolvedValue({ id: "owner-1", role: "teacher", status: "active" });

    await saveErrorReportTeacherResponseAction({ error: null, successCount: 0 }, form({
      id: "report-1",
      teacherResponse: " \n\t ",
      markHandled: "true",
    }));

    expect(mocks.setErrorReportTeacherResponseAndHandled).toHaveBeenCalledWith("report-1", null);
  });

  it("authorizes individual report completion and reopen through the trusted report lookup", async () => {
    const actor = { id: "editor-1", role: "teacher", status: "active" };
    mocks.requireAdminUser.mockResolvedValue(actor);

    await errorReportStatusAction(form({ id: "report-1", status: "DONE", threadId: "untrusted" }));
    await errorReportStatusAction(form({ id: "report-1", status: "OPEN" }));

    expect(mocks.getErrorReportLearningSpaceId).toHaveBeenCalledWith("report-1");
    expect(mocks.requireLearningSpaceManagement).toHaveBeenCalledWith(actor, "space-5");
    expect(mocks.setErrorReportHandled).toHaveBeenNthCalledWith(1, "report-1", true);
    expect(mocks.setErrorReportHandled).toHaveBeenNthCalledWith(2, "report-1", false);
  });

  it("blocks unauthorized individual report status changes before mutation", async () => {
    mocks.requireAdminUser.mockResolvedValue({ id: "student-1", role: "student", status: "active" });
    mocks.requireLearningSpaceManagement.mockRejectedValueOnce(new Error("Geen beheerrechten."));

    await expect(errorReportStatusAction(form({ id: "report-1", status: "DONE" }))).rejects.toThrow("Geen beheerrechten");
    expect(mocks.setErrorReportHandled).not.toHaveBeenCalled();
  });

  it("normalizes whitespace-only saves and explicit removal to null", async () => {
    mocks.requireAdminUser.mockResolvedValue({ id: "owner-1", role: "teacher", status: "active" });

    await saveErrorReportTeacherResponseAction({ error: null, successCount: 0 }, form({ id: "report-1", teacherResponse: " \n\t " }));
    const deleted = await deleteErrorReportTeacherResponseAction({ error: null, successCount: 0 }, form({ id: "report-1" }));

    expect(mocks.setErrorReportTeacherResponse).toHaveBeenNthCalledWith(1, "report-1", null);
    expect(mocks.setErrorReportTeacherResponse).toHaveBeenNthCalledWith(2, "report-1", null);
    expect(deleted).toEqual({ error: null, successCount: 1 });
  });

  it("rejects invalid response content after authorization and before mutation", async () => {
    mocks.requireAdminUser.mockResolvedValue({ id: "owner-1", role: "teacher", status: "active" });
    const result = await saveErrorReportTeacherResponseAction({ error: null, successCount: 0 }, form({ id: "report-1", teacherResponse: "A".repeat(501) }));

    expect(result.error).toContain("maximaal 500 tekens platte tekst");
    expect(mocks.getErrorReportLearningSpaceId).toHaveBeenCalledWith("report-1");
    expect(mocks.requireLearningSpaceManagement).toHaveBeenCalled();
    expect(mocks.setErrorReportTeacherResponse).not.toHaveBeenCalled();
  });

  it("keeps action state open with a visible error when the response mutation fails", async () => {
    mocks.requireAdminUser.mockResolvedValue({ id: "owner-1", role: "teacher", status: "active" });
    mocks.setErrorReportTeacherResponse.mockRejectedValueOnce(new Error("Database tijdelijk niet beschikbaar"));

    const result = await saveErrorReportTeacherResponseAction(
      { error: null, successCount: 3 },
      form({ id: "report-1", teacherResponse: "Blijft in editor" }),
    );

    expect(result).toEqual({ error: "Het bericht kon niet worden opgeslagen. Probeer opnieuw.", successCount: 3 });
  });

  it.each([
    ["owner", { id: "owner-1", role: "teacher", status: "active" }],
    ["editor", { id: "editor-1", role: "teacher", status: "active" }],
    ["superadmin", { id: "superadmin-1", role: "superadmin", status: "active" }],
  ] as const)("authorizes report delete for an %s through the trusted report lookup", async (_role, actor) => {
    mocks.requireAdminUser.mockResolvedValue(actor);

    await deleteErrorReportAction(form({ id: "report-1", threadId: "untrusted" }));

    expect(mocks.getErrorReportLearningSpaceId).toHaveBeenCalledWith("report-1");
    expect(mocks.requireLearningSpaceManagement).toHaveBeenCalledWith(actor, "space-5");
    expect(mocks.deleteErrorReport).toHaveBeenCalledWith("report-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/5wis/foutmeldingen");
  });

  it("blocks unauthorized report delete before mutation", async () => {
    mocks.requireAdminUser.mockResolvedValue({ id: "student-1", role: "student", status: "active" });
    mocks.requireLearningSpaceManagement.mockRejectedValueOnce(new Error("Geen beheerrechten."));

    await expect(deleteErrorReportAction(form({ id: "report-1" }))).rejects.toThrow("Geen beheerrechten");
    expect(mocks.deleteErrorReport).not.toHaveBeenCalled();
  });

  it("authorizes DONE cleanup for the selected LearningSpace", async () => {
    const actor = { id: "editor-1", role: "teacher", status: "active" };
    mocks.requireAdminUser.mockResolvedValue(actor);

    await deleteOldDoneErrorThreadsAction(form({ learningSpaceId: "space-5" }));

    expect(mocks.requireLearningSpaceManagement).toHaveBeenCalledWith(actor, "space-5");
    expect(mocks.deleteOldDoneErrorThreads).toHaveBeenCalledWith(undefined, "space-5");
  });
});

function form(values: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}
