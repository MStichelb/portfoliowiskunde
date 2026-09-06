import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppUser } from "@/lib/identity";
import type { LearningSpace } from "@/lib/repositories";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  canManageLearningSpace: vi.fn(),
  getAdminLearningSpaceBySlug: vi.fn(),
  listLearningSpaceTeachers: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

vi.mock("@/lib/auth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/authorization", () => ({ canManageLearningSpace: mocks.canManageLearningSpace }));
vi.mock("@/lib/repositories", () => ({ getAdminLearningSpaceBySlug: mocks.getAdminLearningSpaceBySlug }));
vi.mock("@/lib/user-management", () => ({ listLearningSpaceTeachers: mocks.listLearningSpaceTeachers }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/app/components/admin-space-header", () => ({
  AdminSpaceHeader: ({ section }: { section: string }) => <div data-section={section}>Leeromgevingheader</div>,
}));

import LearningSpaceAccessPage from "./page";

describe("LearningSpace access shell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue(space);
    mocks.canManageLearningSpace.mockResolvedValue(true);
    mocks.listLearningSpaceTeachers.mockResolvedValue([]);
  });

  it.each([
    ["superadmin", user("superadmin", "superadmin")],
    ["owner", user("owner", "teacher")],
    ["editor", user("editor", "teacher")],
  ] as const)("allows a %s through the management boundary", async (_label, actor) => {
    mocks.requireAdminUser.mockResolvedValue(actor);

    const markup = renderToStaticMarkup(await LearningSpaceAccessPage({ params: Promise.resolve({ spaceSlug: "5" }) }));

    expect(mocks.getAdminLearningSpaceBySlug).toHaveBeenCalledWith("5");
    expect(mocks.canManageLearningSpace).toHaveBeenCalledWith(actor, space.id);
    expect(markup).toContain('data-section="access"');
  });

  it("rejects a view-only teacher at the management boundary", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("viewer", "teacher"));
    mocks.canManageLearningSpace.mockResolvedValue(false);

    await expect(LearningSpaceAccessPage({ params: Promise.resolve({ spaceSlug: "5" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("rejects a student before the LearningSpace route is loaded", async () => {
    mocks.requireAdminUser.mockRejectedValue(new Error("Geen beheerrechten"));

    await expect(LearningSpaceAccessPage({ params: Promise.resolve({ spaceSlug: "5" }) })).rejects.toThrow("Geen beheerrechten");
    expect(mocks.getAdminLearningSpaceBySlug).not.toHaveBeenCalled();
  });

  it("renders owner, editor and viewer with user-facing read-only roles", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("owner", "teacher"));
    mocks.listLearningSpaceTeachers.mockResolvedValue([
      { userId: "owner", firstName: "Olivia", lastName: "Owner", role: "owner" },
      { userId: "editor", firstName: "Elias", lastName: "Editor", role: "editor" },
      { userId: "viewer", firstName: "Vera", lastName: "Viewer", role: "viewer" },
    ]);

    const markup = renderToStaticMarkup(await LearningSpaceAccessPage({ params: Promise.resolve({ spaceSlug: "5" }) }));

    expect(markup).toContain("Olivia");
    expect(markup).toContain("Eigenaar");
    expect(markup).toContain("lucide-crown");
    expect(markup).toContain("Elias");
    expect(markup).toContain("Bewerker");
    expect(markup).toContain("lucide-pencil");
    expect(markup).toContain("Vera");
    expect(markup).toContain("Kijker");
    expect(markup).toContain("lucide-eye");
    expect(markup).not.toContain("<form");
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("<select");
  });

  it("renders all sections and the teacher empty state without management controls", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("owner", "teacher"));

    const markup = renderToStaticMarkup(await LearningSpaceAccessPage({ params: Promise.resolve({ spaceSlug: "5" }) }));

    expect(markup).not.toContain("<h2>Toegang</h2>");
    expect(markup).toContain('<h2 id="teachers-heading">Leraren</h2>');
    expect(markup).toContain('<h2 id="groups-users-heading">Groepen en gebruikers koppelen</h2>');
    expect(markup).toContain('<h2 id="users-heading">Gebruikers</h2>');
    expect(markup).toContain("Leraren");
    expect(markup).toContain("Beheer de leraren die deze leeromgeving kunnen bekijken of bewerken.");
    expect(markup).toContain("Groepen en gebruikers koppelen");
    expect(markup).toContain("Koppel Smartschoolgroepen of individuele leerlingen aan deze leeromgeving.");
    expect(markup).toContain("Gebruikers");
    expect(markup).toContain("Bekijk de leerlingen die toegang hebben tot deze leeromgeving.");
    expect(markup).toContain("Nog geen leraren met toegang.");
    expect(markup).not.toContain("<form");
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("<table");
  });
});

const space: LearningSpace = {
  id: "space-5", name: "Vijfde jaar", slug: "5", shortLabel: "5WIS", description: "Oefenmateriaal", cardColor: "#DCEFE9",
  sortOrder: 5, isActive: true, archivedAt: null, sourceType: "local", localSourcePath: null, oneDriveDriveId: null,
  oneDriveFolderId: null, oneDriveFolderPath: null, googleDriveFolderId: null, googleDriveFolderLabel: null, sources: [],
  activeSourceId: null, primarySource: null, mirrorSource: null,
};

function user(id: string, role: AppUser["role"]): AppUser {
  return { id, displayName: id, firstName: null, lastName: null, email: null, role, status: "active", classGroupOverrideId: null };
}
