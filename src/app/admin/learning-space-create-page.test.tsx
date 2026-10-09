import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/components/flash-toast", () => ({
  useToast: () => vi.fn(),
  ExerciseNoteFeedback: () => null,
  FlashToast: ({ type, message, feedbackKey }: { type: string; message: string; feedbackKey?: string }) => <span data-toast={type} data-feedback-key={feedbackKey}>{message}</span>,
}));

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  getManageableLearningSpaceIds: vi.fn(),
  getAccessibleLearningSpaceIds: vi.fn(),
  getLearningSpaces: vi.fn(),
  listActiveSubjects: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/authorization", () => ({
  getManageableLearningSpaceIds: mocks.getManageableLearningSpaceIds,
  getAccessibleLearningSpaceIds: mocks.getAccessibleLearningSpaceIds,
}));
vi.mock("@/lib/repositories", () => ({ getLearningSpaces: mocks.getLearningSpaces }));
vi.mock("@/lib/user-management", () => ({ listManagedMemberships: vi.fn(async () => []), listManagedGroupMappings: vi.fn(async () => []) }));
vi.mock("@/lib/user-learning-space-order", () => ({ orderLearningSpacesForUser: vi.fn(async (_id, spaces) => spaces) }));
vi.mock("./learning-space-order-actions", () => ({ savePersonalLearningSpaceOrderAction: vi.fn() }));
vi.mock("@/lib/learning-space-creation-options", () => ({ getLearningSpaceCreationOptions: vi.fn(async () => ({ templates: [], copies: [], links: [] })) }));
vi.mock("@/lib/subjects", () => ({ listActiveSubjects: mocks.listActiveSubjects }));
vi.mock("@/app/components/page-banner", () => ({ PageBanner: () => null }));
vi.mock("./actions", () => ({ createLearningSpaceAction: vi.fn() }));

import AdminPage from "./page";

describe("admin LearningSpace creation entry point", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLearningSpaces.mockResolvedValue([]);
    mocks.getManageableLearningSpaceIds.mockResolvedValue([]);
    mocks.getAccessibleLearningSpaceIds.mockResolvedValue([]);
    mocks.listActiveSubjects.mockResolvedValue([{ id: "subject-wiskunde", name: "Wiskunde", sortOrder: 10, isActive: true }]);
  });

  it("routes action success and errors to the shared toast", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("teacher"));
    const markup = renderToStaticMarkup(await AdminPage({ searchParams: Promise.resolve({ created: "1", smartschool: "linked", error: "delete-failed" }) }));
    expect(markup).toContain('data-toast="success" data-feedback-key="created"');
    expect(markup).toContain('data-toast="success" data-feedback-key="smartschool"');
    expect(markup).toContain('data-toast="error" data-feedback-key="error"');
    expect(markup).not.toMatch(/success-message|error-message/);
  });

  it.each(["teacher", "superadmin"] as const)("shows the creation trigger to an active %s", async (role) => {
    mocks.requireAdminUser.mockResolvedValue(user(role));

    const markup = renderToStaticMarkup(await AdminPage({ searchParams: Promise.resolve({}) }));

    expect(markup).toContain("Leeromgeving toevoegen");
    expect(markup).toContain("lucide-folder-plus");
  });

  it("shows only connections and creation actions to a teacher", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("teacher"));

    const markup = renderToStaticMarkup(await AdminPage({ searchParams: Promise.resolve({}) }));

    expect(markup).toContain('href="/admin/verbindingen"');
    expect(markup).toContain("Verbindingen");
    expect(markup).toContain("Leeromgeving toevoegen");
    expect(markup).not.toContain('href="/admin/gebruikers"');
  });

  it("shows connections, users and creation actions to a superadmin", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("superadmin"));

    const markup = renderToStaticMarkup(await AdminPage({ searchParams: Promise.resolve({}) }));

    expect(markup).toContain('href="/admin/verbindingen"');
    expect(markup).toContain('href="/admin/gebruikers"');
    expect(markup).toContain("Leeromgeving toevoegen");
  });

  it("does not show the retired global actions", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("superadmin"));

    const markup = renderToStaticMarkup(await AdminPage({ searchParams: Promise.resolve({}) }));

    expect(markup).not.toContain("Smartschool koppelen");
    expect(markup).not.toContain('href="/admin/toegang"');
    expect(markup).not.toContain("Leeromgevingen beheren");
    expect(markup).not.toContain("Uitloggen");
  });

  it("does not expose the admin creation flow to a student", async () => {
    mocks.requireAdminUser.mockRejectedValue(new Error("Geen beheerrechten"));

    await expect(AdminPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("Geen beheerrechten");
  });

  it("reopens the modal and displays a returned validation error", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("teacher"));

    const markup = renderToStaticMarkup(await AdminPage({ searchParams: Promise.resolve({ create: "1", createError: "invalid" }) }));

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Controleer de ingevulde gegevens.");
  });

  it("loads active subjects and renders an explicit required choice", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("teacher"));

    const markup = renderToStaticMarkup(await AdminPage({ searchParams: Promise.resolve({ create: "1" }) }));

    expect(mocks.listActiveSubjects).toHaveBeenCalledOnce();
    expect(markup).toContain('name="subjectId"');
    expect(markup).toContain("Kies een vak");
    expect(markup).toContain("Wiskunde");
  });
});

function user(role: "teacher" | "superadmin") {
  return { id: `${role}-1`, displayName: role, firstName: null, lastName: null, email: null, role, status: "active" as const, classGroupOverrideId: null };
}
