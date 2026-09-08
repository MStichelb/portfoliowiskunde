import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppUser } from "@/lib/identity";
import type { LearningSpace } from "@/lib/repositories";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  canManageLearningSpace: vi.fn(),
  getAdminLearningSpaceBySlug: vi.fn(),
  getThemes: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

vi.mock("@/lib/auth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/authorization", () => ({ canManageLearningSpace: mocks.canManageLearningSpace }));
vi.mock("@/lib/repositories", () => ({
  getAdminLearningSpaceBySlug: mocks.getAdminLearningSpaceBySlug,
  getThemes: mocks.getThemes,
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("../../actions", () => ({
  createThemeAction: vi.fn(),
  deleteThemeAction: vi.fn(),
  saveThemeAction: vi.fn(),
}));
vi.mock("@/app/components/admin-space-header", () => ({
  AdminSpaceHeader: ({ section }: { section: string }) => <div data-section={section}>Leeromgevingheader</div>,
}));
vi.mock("@/app/components/confirm-action-button", () => ({
  ConfirmActionButton: ({ label }: { label: React.ReactNode }) => <button>{label}</button>,
}));

import ThemesPage from "./page";

describe("LearningSpace themes page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminUser.mockResolvedValue(user);
    mocks.canManageLearningSpace.mockResolvedValue(true);
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue(space);
    mocks.getThemes.mockResolvedValue([]);
  });

  it("shows a compact empty state when no themes exist", async () => {
    const markup = renderToStaticMarkup(await ThemesPage({ params: Promise.resolve({ spaceSlug: "5" }) }));

    expect(markup).toContain('data-section="themes"');
    expect(markup).toContain("Nieuw thema");
    expect(markup).toContain("Nog geen thema&#x27;s.");
  });

  it("renders existing themes instead of the empty state", async () => {
    mocks.getThemes.mockResolvedValue([{ id: "theme-1", learningSpaceId: space.id, name: "Analyse", sortOrder: 1 }]);

    const markup = renderToStaticMarkup(await ThemesPage({ params: Promise.resolve({ spaceSlug: "5" }) }));

    expect(markup).toContain("Analyse");
    expect(markup).not.toContain("Nog geen thema&#x27;s.");
  });
});

const user: AppUser = {
  id: "admin",
  displayName: "Admin",
  firstName: "Ada",
  lastName: "Admin",
  email: null,
  role: "superadmin",
  status: "active",
  classGroupOverrideId: null,
};

const space: LearningSpace = {
  id: "space-5",
  name: "Vijfde jaar",
  slug: "5",
  shortLabel: "5WIS",
  description: "Oefenmateriaal",
  cardColor: "#DCEFE9",
  sortOrder: 5,
  isActive: true,
  archivedAt: null,
  editorsCanManageAccess: false,
  sourceType: "local",
  localSourcePath: null,
  oneDriveDriveId: null,
  oneDriveFolderId: null,
  oneDriveFolderPath: null,
  googleDriveFolderId: null,
  googleDriveFolderLabel: null,
  sources: [],
  activeSourceId: null,
  primarySource: null,
  mirrorSource: null,
};
