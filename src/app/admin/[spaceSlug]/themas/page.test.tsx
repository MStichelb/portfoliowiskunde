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
  moveThemeAction: vi.fn(),
  saveThemeAction: vi.fn(),
}));
vi.mock("@/app/components/admin-space-header", () => ({
  AdminSpaceHeader: ({ section }: { section: string }) => <div data-section={section}>Leeromgevingheader</div>,
}));
vi.mock("@/app/components/confirm-action-button", () => ({
  ConfirmActionButton: ({ label, confirmTitle, disabled, disabledTitle }: { label: React.ReactNode; confirmTitle: string; disabled?: boolean; disabledTitle?: string }) => <button aria-label={confirmTitle} title={disabled && disabledTitle ? disabledTitle : confirmTitle} disabled={disabled}>{label}</button>,
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
    expect(markup).toContain("Thema toevoegen");
    expect(markup).toContain("Breng verschillende portfolio");
    expect(markup).toContain("onder een gemeenschappelijke titel.");
    expect(markup).toContain("Nog geen thema&#x27;s.");
  });

  it("uses custom theme terms in the existing controls without changing routes or memberships", async () => {
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue({ ...space, themeLabelSingular: "dEEL", themeLabelPlural: "dELEN", collectionLabelSingular: "Hoofdstuk", collectionLabelPlural: "Hoofdstukken" });
    mocks.getThemes.mockResolvedValue([{ id: "theme-1", learningSpaceId: space.id, name: "Analyse", sortOrder: 10 }]);
    const markup = renderToStaticMarkup(await ThemesPage({ params: Promise.resolve({ spaceSlug: "5" }) }));
    expect(markup).toContain("Deel toevoegen");
    expect(markup).toContain(">Delen</h2>");
    expect(markup).toContain("Breng verschillende hoofdstukken onder een gemeenschappelijke titel.");
    expect(markup).toContain('aria-label="Deel opslaan"');
    expect(markup).toContain('aria-label="Deel verwijderen"');
    expect(markup).toContain('aria-label="Deel verwijderen" title="Deel verwijderen"');
    expect(markup).not.toContain('aria-label="Deel verwijderen" title="Dit deel wordt bepaald door de bronmap');
    expect(markup).not.toMatch(/aria-label="Deel verwijderen"[^>]*disabled=""/);
    expect(markup).toContain('name="id" value="theme-1"');
    expect(markup).not.toContain("Thema");
  });

  it("renders existing themes instead of the empty state", async () => {
    mocks.getThemes.mockResolvedValue([
      { id: "theme-1", learningSpaceId: space.id, name: "Analyse", sortOrder: 10 },
      { id: "theme-2", learningSpaceId: space.id, name: "Meetkunde", sortOrder: 20 },
      { id: "theme-3", learningSpaceId: space.id, name: "Statistiek", sortOrder: 30 },
    ]);

    const markup = renderToStaticMarkup(await ThemesPage({ params: Promise.resolve({ spaceSlug: "5" }) }));

    expect(markup).toContain("Analyse");
    expect(markup).not.toContain("Nog geen thema&#x27;s.");
    expect(markup).not.toContain("Sortering");
    expect(markup).not.toContain('name="sortOrder"');
    expect(markup.match(/aria-label="Thema opslaan"/g)).toHaveLength(3);
    expect(markup.match(/aria-label="Thema verwijderen"/g)).toHaveLength(3);
    expect(markup).toMatch(/disabled="" aria-label="Thema omhoog verplaatsen"/);
    expect(markup).toMatch(/disabled="" aria-label="Thema omlaag verplaatsen"/);
    expect(markup).toContain('name="direction" value="up"');
    expect(markup).toContain('name="direction" value="down"');
    expect(markup.match(/aria-label="Thema verwijderen"[^>]*disabled=""/g)).toBeNull();
  });

  it("keeps source-derived themes visible but disables deletion with custom terminology", async () => {
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue({ ...space, themeLabelSingular: "Domein" });
    mocks.getThemes.mockResolvedValue([{ id: "theme-source", learningSpaceId: space.id, name: "Analyse", sortOrder: 10, sourceTheme: { name: "Analyse", relativePath: "Analyse", sourceId: "Analyse", scope: "source-1" } }]);
    const markup = renderToStaticMarkup(await ThemesPage({ params: Promise.resolve({ spaceSlug: "5" }) }));
    expect(markup).toContain("Analyse");
    expect(markup).toContain('aria-label="Domein verwijderen"');
    expect(markup).toContain('aria-label="Domein verwijderen" title="Dit domein wordt bepaald door de bronmap en kan hier niet worden verwijderd." disabled=""');
    expect(markup).toContain('aria-label="Domein opslaan"');
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
  subjectId: "subject-wiskunde",
  subjectName: "Wiskunde",
  subjectIsActive: true,
  collectionLabelSingular: "Portfolio",
  collectionLabelPlural: "Portfolio's",
  exerciseLabelSingular: "Oefening",
  exerciseLabelPlural: "Oefeningen",
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
