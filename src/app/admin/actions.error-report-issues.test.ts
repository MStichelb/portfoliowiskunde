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
  setErrorReportThreadStatus: mocks.setErrorReportThreadStatus,
  toggleErrorReportThreadPin: mocks.toggleErrorReportThreadPin,
}));
vi.mock("@/lib/storage-connections", () => ({ ensureStorageConnection: vi.fn() }));

import {
  deleteErrorReportAction,
  deleteOldDoneErrorThreadsAction,
  errorReportThreadNoteAction,
  errorReportThreadPinAction,
  errorReportThreadStatusAction,
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
