import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppUser } from "@/lib/identity";
import type { LearningSpace } from "@/lib/repositories";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  canManageLearningSpace: vi.fn(),
  getAdminLearningSpaceBySlug: vi.fn(),
  getThemes: vi.fn(),
  getSourceProfile: vi.fn(),
  getAdminPortfolios: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

vi.mock("@/lib/auth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/authorization", () => ({ canManageLearningSpace: mocks.canManageLearningSpace }));
vi.mock("@/lib/repositories", () => ({
  getAdminLearningSpaceBySlug: mocks.getAdminLearningSpaceBySlug,
  getThemes: mocks.getThemes,
  getAdminPortfolios: mocks.getAdminPortfolios,
}));
vi.mock("@/lib/source-profiles", () => ({ getActiveSourceProfileConfigForLearningSpace: mocks.getSourceProfile }));
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
    mocks.getSourceProfile.mockResolvedValue({ scanner: { portfolio: { themeMode: "none" } } });
    mocks.getAdminPortfolios.mockResolvedValue([]);
  });

  it("shows a compact empty state when no themes exist", async () => {
    const markup = renderToStaticMarkup(await ThemesPage({ params: Promise.resolve({ spaceSlug: "5" }) }));

    expect(markup).toContain('data-section="themes"');
    expect(markup).toContain("Thema toevoegen");
    expect(markup).toContain('class="secondary-button theme-add-button');
    expect(markup).not.toContain("theme-create-card");
    expect(markup).toContain("Nog geen thema&#x27;s aangemaakt.");
  });

  it("uses custom theme terms in the existing controls without changing routes or memberships", async () => {
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue({ ...space, themeLabelSingular: "dEEL", themeLabelPlural: "dELEN", collectionLabelSingular: "Hoofdstuk", collectionLabelPlural: "Hoofdstukken" });
    mocks.getThemes.mockResolvedValue([{ id: "theme-1", learningSpaceId: space.id, name: "Analyse", sortOrder: 10 }]);
    const markup = renderToStaticMarkup(await ThemesPage({ params: Promise.resolve({ spaceSlug: "5" }) }));
    expect(markup).toContain("Deel toevoegen");
    expect(markup).toContain(">Delen</h2>");
    expect(markup).toContain("Nog geen hoofdstukken gekoppeld.");
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
    expect(markup).not.toContain("Nog geen thema&#x27;s aangemaakt.");
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
    expect(markup).toContain('aria-label="Domein verwijderen" title="Domein uit de bronmap kan hier niet worden verwijderd." disabled=""');
    expect(markup).toContain('aria-label="Domein opslaan"');
  });

  it("shows source origin, edited presentation, members and optional root with custom terms", async () => {
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue({ ...space, themeLabelSingular: "Hoofdstuk", themeLabelPlural: "Hoofdstukken", collectionLabelSingular: "Oefeningenreeks", collectionLabelPlural: "Oefeningenreeksen" });
    mocks.getThemes.mockResolvedValue([
      { id: "source", name: "Algebra", sortOrder: 20, sourceTheme: { name: "Analyse", sourceId: "opaque-source", scope: "secret-scope", relativePath: "Analyse" } },
      { id: "manual", name: "Extra", sortOrder: 30 },
    ]);
    mocks.getAdminPortfolios.mockResolvedValue([
      { id: "p1", title: "Limieten", themeId: "source" },
      { id: "p2", title: "Matrices", themeId: "source" },
      { id: "p3", title: "Herhaling", themeId: null },
    ]);
    const markup = renderToStaticMarkup(await ThemesPage({ params: Promise.resolve({ spaceSlug: "5" }) }));
    expect(markup).not.toContain("Positie ");
    expect(markup).toContain("Weergavenaam");
    expect(markup).toContain("Uit bronmap");
    expect(markup).toContain("Handmatig");
    expect(markup).toContain('value="Algebra"');
    expect(markup).toContain("Bronmap: Analyse");
    expect(markup).toContain("· 2 oefeningenreeksen");
    expect(markup).toContain("Hoofdstukken uit je bronmap");
    expect(markup).toContain("Je kunt hier de weergavenaam en volgorde aanpassen.");
    expect(markup).not.toContain('href="/admin/5/portfolio/p1"');
    expect(markup).toContain("Zonder hoofdstuk");
    expect(markup).toContain("1 oefeningenreeks rechtstreeks in deze leeromgeving");
    expect(markup).not.toContain("Herhaling");
    expect(markup).not.toContain("Limieten");
    expect(markup).not.toContain("Matrices");
    expect(markup).not.toContain("theme-members");
    expect(markup).not.toContain("theme-portfolio-list");
    expect(markup).toContain("Nog geen oefeningenreeksen gekoppeld.");
    expect(markup).not.toContain("opaque-source");
    expect(markup).not.toContain("secret-scope");
    expect(markup).not.toContain('value="null"');
    expect(markup).not.toContain("Thema");
    expect(mocks.getAdminPortfolios).toHaveBeenCalledWith(space.id);
  });

  it("does not read themes or portfolios when management permission is missing", async () => {
    mocks.canManageLearningSpace.mockResolvedValue(false);
    await expect(ThemesPage({ params: Promise.resolve({ spaceSlug: "5" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.getThemes).not.toHaveBeenCalled();
    expect(mocks.getAdminPortfolios).not.toHaveBeenCalled();
  });

  it("shows the custom manual helper only when portfolios can be assigned manually", async () => {
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue({ ...space, themeLabelSingular: "Deel", themeLabelPlural: "Delen", collectionLabelPlural: "Bundels" });
    const markup = renderToStaticMarkup(await ThemesPage({ params: Promise.resolve({ spaceSlug: "5" }) }));
    expect(markup).toContain("Je kunt delen definiëren om verschillende bundels te groeperen.");
    expect(markup).toContain('href="#automatic-theme-info"');
    expect(markup).toContain("Automatisch groeperen");
    expect(markup).toContain("Bronprofiel onder “Delen”");
    expect(markup).toContain("Groepering uit mappen");
    expect(markup).toContain("Nog geen delen aangemaakt.");
    mocks.getSourceProfile.mockResolvedValue({ scanner: { portfolio: { themeMode: "folder" } } });
    const sourceMarkup = renderToStaticMarkup(await ThemesPage({ params: Promise.resolve({ spaceSlug: "5" }) }));
    expect(sourceMarkup).not.toContain("Je kunt delen definiëren");
    expect(sourceMarkup).not.toContain("automatic-theme-info");
  });

  it("explains source groups once for multiple cards using custom group and collection terms", async () => {
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue({ ...space, themeLabelSingular: "Deel", themeLabelPlural: "Delen", collectionLabelSingular: "Bundel", collectionLabelPlural: "Bundels" });
    mocks.getThemes.mockResolvedValue(["Analyse", "Meetkunde"].map((name, index) => ({
      id: `source-${index}`, name, sortOrder: index * 10,
      sourceTheme: { name: `Bron ${name}`, sourceId: `folder-${index}`, relativePath: name, scope: "source" },
    })));
    const markup = renderToStaticMarkup(await ThemesPage({ params: Promise.resolve({ spaceSlug: "5" }) }));
    expect(markup.match(/Delen uit je bronmap/g)).toHaveLength(1);
    expect(markup.match(/De bron bepaalt welke bundels bij deze delen horen/g)).toHaveLength(1);
    expect(markup).toContain("Bronmap: Bron Analyse");
    expect(markup).toContain("Bronmap: Bron Meetkunde");
    expect(markup.match(/Deel uit de bronmap kan hier niet worden verwijderd./g)).toHaveLength(2);
    expect(markup).not.toContain("loskoppelen");
    expect(markup).not.toContain("mapgroepering");
    expect(markup).not.toContain("theme-members");
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
