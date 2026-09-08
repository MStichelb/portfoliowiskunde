import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getErrorReportIssueLearningSpaceId: vi.fn(),
  getErrorReportThreadLearningSpaceId: vi.fn(),
  getLearningSpace: vi.fn(),
  requireAdminUser: vi.fn(),
  requireLearningSpaceManagement: vi.fn(),
  revalidatePath: vi.fn(),
  saveErrorReportIssueNote: vi.fn(),
  saveErrorReportThreadNote: vi.fn(),
  setErrorReportIssueStatus: vi.fn(),
  setErrorReportThreadStatus: vi.fn(),
  toggleErrorReportIssuePin: vi.fn(),
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
  getErrorReportIssueLearningSpaceId: mocks.getErrorReportIssueLearningSpaceId,
  getErrorReportThreadLearningSpaceId: mocks.getErrorReportThreadLearningSpaceId,
  getLearningSpace: mocks.getLearningSpace,
  saveErrorReportIssueNote: mocks.saveErrorReportIssueNote,
  saveErrorReportThreadNote: mocks.saveErrorReportThreadNote,
  setErrorReportIssueStatus: mocks.setErrorReportIssueStatus,
  setErrorReportThreadStatus: mocks.setErrorReportThreadStatus,
  toggleErrorReportIssuePin: mocks.toggleErrorReportIssuePin,
  toggleErrorReportThreadPin: mocks.toggleErrorReportThreadPin,
}));
vi.mock("@/lib/storage-connections", () => ({ ensureStorageConnection: vi.fn() }));

import {
  errorReportIssueNoteAction,
  errorReportIssuePinAction,
  errorReportIssueStatusAction,
  errorReportThreadNoteAction,
  errorReportThreadPinAction,
  errorReportThreadStatusAction,
} from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getErrorReportIssueLearningSpaceId.mockResolvedValue("space-5");
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

describe("error report issue management actions", () => {
  it.each([
    ["owner", { id: "owner-1", role: "teacher", status: "active" }],
    ["editor", { id: "editor-1", role: "teacher", status: "active" }],
    ["superadmin", { id: "superadmin-1", role: "superadmin", status: "active" }],
  ] as const)("authorizes an %s through the existing LearningSpace policy", async (_membership, actor) => {
    mocks.requireAdminUser.mockResolvedValue(actor);

    await errorReportIssueStatusAction(form({ issueId: "issue-1", status: "DONE" }));

    expect(mocks.requireLearningSpaceManagement).toHaveBeenCalledWith(actor, "space-5");
    expect(mocks.setErrorReportIssueStatus).toHaveBeenCalledWith("issue-1", "DONE");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/5wis/foutmeldingen");
  });

  it("blocks unauthorized users before mutation", async () => {
    mocks.requireAdminUser.mockResolvedValue({ id: "student-1", role: "student", status: "active" });
    mocks.requireLearningSpaceManagement.mockRejectedValue(new Error("Geen beheerrechten."));

    await expect(errorReportIssuePinAction(form({ issueId: "issue-1" }))).rejects.toThrow("Geen beheerrechten");
    expect(mocks.toggleErrorReportIssuePin).not.toHaveBeenCalled();
  });

  it("fails safely for missing issues and invalid status", async () => {
    mocks.getErrorReportIssueLearningSpaceId.mockResolvedValueOnce(null);
    await expect(errorReportIssuePinAction(form({ issueId: "missing" }))).rejects.toThrow("Foutmelding niet gevonden");
    await expect(errorReportIssueStatusAction(form({ issueId: "issue-1", status: "INVALID" }))).rejects.toThrow("Ongeldige meldingsstatus");
    expect(mocks.toggleErrorReportIssuePin).not.toHaveBeenCalled();
    expect(mocks.setErrorReportIssueStatus).not.toHaveBeenCalled();
  });

  it("saves the issue note without trusting a client LearningSpace id", async () => {
    const result = await errorReportIssueNoteAction({ error: null }, form({ issueId: "issue-1", learningSpaceId: "space-other", note: "Nakijken" }));

    expect(result).toEqual({ error: null, saved: true });
    expect(mocks.saveErrorReportIssueNote).toHaveBeenCalledWith("issue-1", "Nakijken");
    expect(mocks.requireLearningSpaceManagement).toHaveBeenCalledWith(expect.anything(), "space-5");
  });
});

function form(values: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}
