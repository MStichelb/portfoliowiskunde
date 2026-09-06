import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppUser } from "@/lib/identity";
import type { LearningSpace } from "@/lib/repositories";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  canManageLearningSpace: vi.fn(),
  canConfigureLearningSpace: vi.fn(),
  getAdminLearningSpaceBySlug: vi.fn(),
  listLearningSpaceTeachers: vi.fn(),
  listLearningSpaceTeacherCandidates: vi.fn(),
  saveTeacherAccess: vi.fn(),
  removeTeacherAccess: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

vi.mock("@/lib/auth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/authorization", () => ({
  canManageLearningSpace: mocks.canManageLearningSpace,
  canConfigureLearningSpace: mocks.canConfigureLearningSpace,
}));
vi.mock("@/lib/repositories", () => ({ getAdminLearningSpaceBySlug: mocks.getAdminLearningSpaceBySlug }));
vi.mock("@/lib/user-management", () => ({
  listLearningSpaceTeachers: mocks.listLearningSpaceTeachers,
  listLearningSpaceTeacherCandidates: mocks.listLearningSpaceTeacherCandidates,
}));
vi.mock("./actions", () => ({
  saveLearningSpaceTeacherAccessAction: mocks.saveTeacherAccess,
  removeLearningSpaceTeacherAccessAction: mocks.removeTeacherAccess,
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/app/components/admin-space-header", () => ({
  AdminSpaceHeader: ({ section }: { section: string }) => <div data-section={section}>Leeromgevingheader</div>,
}));

import LearningSpaceAccessPage from "./page";

describe("LearningSpace access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue(space);
    mocks.canManageLearningSpace.mockResolvedValue(true);
    mocks.canConfigureLearningSpace.mockResolvedValue(false);
    mocks.listLearningSpaceTeachers.mockResolvedValue([]);
    mocks.listLearningSpaceTeacherCandidates.mockResolvedValue([]);
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

  it("keeps the teacher table read-only for an editor", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("editor", "teacher"));
    mocks.listLearningSpaceTeachers.mockResolvedValue(teachers);

    const markup = renderToStaticMarkup(await LearningSpaceAccessPage({ params: Promise.resolve({ spaceSlug: "5" }) }));

    expect(markup).toContain("Eigenaar");
    expect(markup).toContain("lucide-crown");
    expect(markup).toContain("Bewerker");
    expect(markup).toContain("lucide-pencil");
    expect(markup).toContain("Kijker");
    expect(markup).toContain("lucide-eye");
    expect(markup).not.toContain("Toevoegen");
    expect(markup).not.toContain("Wijzigen");
    expect(markup).not.toContain("Lerarentoegang verwijderen");
    expect(markup).not.toContain("<form");
    expect(markup).not.toContain("<select");
    expect(mocks.listLearningSpaceTeacherCandidates).not.toHaveBeenCalled();
  });

  it.each([
    ["owner", user("owner", "teacher")],
    ["superadmin", user("superadmin", "superadmin")],
  ] as const)("shows compact controls to a %s while keeping owners read-only", async (_label, actor) => {
    mocks.requireAdminUser.mockResolvedValue(actor);
    mocks.canConfigureLearningSpace.mockResolvedValue(true);
    mocks.listLearningSpaceTeachers.mockResolvedValue(teachers);
    mocks.listLearningSpaceTeacherCandidates.mockResolvedValue([
      { userId: "candidate", displayName: "Nieuwe Leraar", firstName: "Nieuwe", lastName: "Leraar" },
    ]);

    const markup = renderToStaticMarkup(await LearningSpaceAccessPage({ params: Promise.resolve({ spaceSlug: "5" }) }));

    expect(markup).toContain("Nieuwe Leraar");
    expect(markup).toContain("Toevoegen");
    expect(markup).toContain("Maak kijker");
    expect(markup).toContain("Maak bewerker");
    expect(markup).not.toContain("Wijzigen");
    expect(markup).toContain("Lerarentoegang verwijderen?");
    expect(markup).toContain('<option value="viewer" selected="">Kijker</option>');
    expect(markup).toContain('<option value="editor">Bewerker</option>');
    expect((markup.match(/class="secondary-button teacher-role-action"/g) ?? [])).toHaveLength(2);
    expect((markup.match(/<select/g) ?? [])).toHaveLength(2);
    expect(mocks.listLearningSpaceTeacherCandidates).toHaveBeenCalledWith(space.id);
    expect((markup.match(/aria-label="Lerarentoegang verwijderen\?"/g) ?? [])).toHaveLength(2);
  });

  it("renders all placeholders and the teacher empty state", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("editor", "teacher"));

    const markup = renderToStaticMarkup(await LearningSpaceAccessPage({ params: Promise.resolve({ spaceSlug: "5" }) }));

    expect(markup).toContain('<h2 id="teachers-heading">Leraren</h2>');
    expect(markup).toContain('<h2 id="groups-users-heading">Groepen en gebruikers koppelen</h2>');
    expect(markup).toContain('<h2 id="users-heading">Gebruikers</h2>');
    expect(markup).toContain("Nog geen leraren met toegang.");
    expect(markup).not.toContain("<table");
  });
});

const teachers = [
  { userId: "owner", firstName: "Olivia", lastName: "Owner", role: "owner" as const },
  { userId: "editor", firstName: "Elias", lastName: "Editor", role: "editor" as const },
  { userId: "viewer", firstName: "Vera", lastName: "Viewer", role: "viewer" as const },
];

const space: LearningSpace = {
  id: "space-5", name: "Vijfde jaar", slug: "5", shortLabel: "5WIS", description: "Oefenmateriaal", cardColor: "#DCEFE9",
  sortOrder: 5, isActive: true, archivedAt: null, sourceType: "local", localSourcePath: null, oneDriveDriveId: null,
  oneDriveFolderId: null, oneDriveFolderPath: null, googleDriveFolderId: null, googleDriveFolderLabel: null, sources: [],
  activeSourceId: null, primarySource: null, mirrorSource: null,
};

function user(id: string, role: AppUser["role"]): AppUser {
  return { id, displayName: id, firstName: null, lastName: null, email: null, role, status: "active", classGroupOverrideId: null };
}
