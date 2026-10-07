import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
vi.mock("@/lib/auth", () => ({ requireAdminUser: async () => ({ id: "teacher", role: "superadmin" }) }));
vi.mock("@/lib/authorization", () => ({ canManageLearningSpace: async () => true, canConfigureLearningSpace: async () => true }));
vi.mock("@/lib/learning-space-access", () => ({ requirePublicLearningSpaceAccess: async () => ({ id: "student", role: "student" }) }));
vi.mock("@/lib/public-index", () => ({ preparePublicIndex: vi.fn(), isNextPrefetchRequest: () => false }));
vi.mock("@/lib/learning-space-source-status", () => ({ getLearningSpaceSourceStatus: async () => ({ synchronization: { latestSuccessful: null } }) }));
vi.mock("@/lib/storage", () => ({ hasConfiguredActiveSource: async () => true }));
vi.mock("@/lib/learning-space-header", () => ({ getLearningSpaceHeaderAsset: async () => null }));
vi.mock("@/lib/student-error-reports", () => ({ listPendingHandledReportNotificationsForCurrentUser: async () => null }));
vi.mock("@/app/components/admin-space-header", () => ({ AdminSpaceHeader: () => null }));
vi.mock("@/app/components/page-banner", () => ({ PageBanner: () => null }));
vi.mock("@/app/components/student-handled-report-notification", () => ({ StudentHandledReportNotificationBanner: () => null }));
vi.mock("./admin/actions", () => ({ archiveMissingIndexAction: vi.fn(), createThemeAction: vi.fn(), saveThemeAction: vi.fn(), moveThemeAction: vi.fn(), deleteThemeAction: vi.fn() }));

import PublicPage from "./[spaceSlug]/page";
import AdminPage from "./admin/[spaceSlug]/page";
import ThemesPage from "./admin/[spaceSlug]/themas/page";
import { getDatabase, resetDatabaseForTests } from "@/lib/database";
import type { IndexedPortfolio, IndexedSourceTheme } from "@/lib/domain";
import { createTheme, getAdminPortfolios, getStudentPortfolios, getThemes, moveTheme, persistIndex, setPortfolioTheme, updateTheme } from "@/lib/repositories";
import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG } from "@/lib/source-profile-config";
import { buildPortfolioThemeGroups } from "@/lib/portfolio-theme-groups";

let directory: string | undefined;
afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (directory) {
    try { await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EBUSY") throw error; }
  }
  directory = undefined;
});

function indexed(code: string, sourceTheme?: IndexedSourceTheme): IndexedPortfolio {
  return {
    code, title: `Inhoud ${code}`, relativePath: `Reeks ${code}`,
    ...(sourceTheme ? { sourceTheme } : {}),
    assignmentPdfPath: null, assignmentPdfSourceId: null, hintsDocumentPath: null, hintsDocumentSourceId: null,
    finalSolutionsPdfPath: null, finalSolutionsPdfSourceId: null, resourceAssets: [], sections: [], exercises: [], warnings: [],
  };
}

it("presents persisted mixed groups consistently while filtering public content and preserving identity", async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "theme-presentation-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(directory, "metadata.db");
  resetDatabaseForTests();
  const database = await getDatabase();
  const config = structuredClone(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
  async function profile(mode: "folder" | "none") {
    config.scanner.portfolio.themeMode = mode;
    await database.execute({ sql: "UPDATE source_profiles SET config_json = ? WHERE id IN (SELECT source_profile_id FROM learning_space_source_profiles WHERE learning_space_id = ?)", args: [JSON.stringify(config), "space-6"] });
  }
  await database.execute({
    sql: "UPDATE learning_spaces SET theme_label_singular = ?, theme_label_plural = ?, collection_label_singular = ?, collection_label_plural = ? WHERE id = ?",
    args: ["Deel", "Delen", "Hoofdstuk", "Hoofdstukken", "space-6"],
  });
  const sourceTheme = { name: "Geheime bronmap", sourceId: "opaque-folder", relativePath: "private-origin" };
  const fixtures = [indexed("20"), indexed("10", sourceTheme), indexed("4"), indexed("2", sourceTheme), indexed("3"), indexed("1"), indexed("11", sourceTheme), indexed("21"), indexed("30"), indexed("50")];
  await profile("folder");
  await persistIndex(fixtures, "local", "space-6");
  const source = (await getThemes("space-6"))[0];
  await updateTheme(source.id, "space-6", "Zichtbaar brondeel");
  await createTheme("space-6", "Handmatig deel");
  await createTheme("space-6", "Leeg deel");
  await createTheme("space-6", "Verborgen deel");
  const manual = (await getThemes("space-6")).find((item) => item.name === "Handmatig deel")!;
  const hidden = (await getThemes("space-6")).find((item) => item.name === "Verborgen deel")!;
  await moveTheme(manual.id, "space-6", "up");
  await profile("none");
  const byCode = new Map((await getAdminPortfolios("space-6")).map((item) => [item.code, item]));
  for (const code of ["3", "20", "21"]) await setPortfolioTheme(byCode.get(code)!.id, "space-6", manual.id);
  await setPortfolioTheme(byCode.get("50")!.id, "space-6", hidden.id);
  await database.execute("UPDATE portfolios SET visible = 1 WHERE learning_space_id = 'space-6'");
  await database.execute("UPDATE portfolios SET visible = 0 WHERE learning_space_id = 'space-6' AND portfolio_code IN ('11', '50')");
  await database.execute("UPDATE portfolios SET publication_limited = 1, publish_from = '2099-01-01' WHERE learning_space_id = 'space-6' AND portfolio_code = '21'");
  await database.execute("UPDATE portfolios SET publication_limited = 1, publish_until = '2000-01-01' WHERE learning_space_id = 'space-6' AND portfolio_code = '30'");
  const beforeThemes = (await database.execute("SELECT * FROM themes WHERE learning_space_id = 'space-6' ORDER BY id")).rows;
  const beforePortfolios = await getAdminPortfolios("space-6");
  await persistIndex(fixtures, "local", "space-6");
  await persistIndex(fixtures, "local", "space-6");
  expect((await database.execute("SELECT * FROM themes WHERE learning_space_id = 'space-6' ORDER BY id")).rows).toEqual(beforeThemes);
  expect(await getAdminPortfolios("space-6")).toEqual(beforePortfolios);
  const themes = await getThemes("space-6");
  const student = await getStudentPortfolios("space-6");
  expect(student.map((item) => item.code)).toEqual(["1", "2", "3", "4", "10", "20"]);
  const publicGroups = buildPortfolioThemeGroups(student, themes, "Overige hoofdstukken");
  expect(publicGroups.map((item) => [item.name, item.portfolios.map((entry) => entry.code)])).toEqual([
    ["Handmatig deel", ["3", "20"]], ["Zichtbaar brondeel", ["2", "10"]], ["Overige hoofdstukken", ["1", "4"]],
  ]);
  const adminGroups = buildPortfolioThemeGroups(beforePortfolios, themes, "Overige hoofdstukken");
  expect(adminGroups.flatMap((item) => item.portfolios)).toHaveLength(10);
  expect(new Set(adminGroups.flatMap((item) => item.portfolios.map((entry) => entry.id))).size).toBe(10);
  expect(beforePortfolios.filter((item) => ["1", "4", "30"].includes(item.code)).every((item) => item.themeId === null)).toBe(true);
  const params = { params: Promise.resolve({ spaceSlug: "6" }) };
  const publicMarkup = renderToStaticMarkup(await PublicPage(params));
  const adminMarkup = renderToStaticMarkup(await AdminPage(params));
  const managementMarkup = renderToStaticMarkup(await ThemesPage(params));
  for (const markup of [publicMarkup, adminMarkup]) {
    expect(markup.indexOf("Handmatig deel")).toBeLessThan(markup.indexOf("Zichtbaar brondeel"));
    expect(markup).toContain("Overige hoofdstukken");
    expect(markup).not.toContain("Geheime bronmap");
    expect(markup).not.toContain("private-origin");
    expect(markup).not.toContain("opaque-folder");
    expect(markup).not.toContain("Uit bronmap");
    expect(markup).not.toContain("Portfolio beheren");
  }
  for (const code of ["11", "21", "30", "50"]) {
    expect(publicMarkup).not.toContain(`Inhoud ${code}<`);
    expect(adminMarkup).toContain(`Inhoud ${code}<`);
  }
  expect(publicMarkup).not.toContain("Leeg deel");
  expect(publicMarkup).not.toContain("Verborgen deel");
  expect(adminMarkup).toContain("Verborgen deel");
  expect(managementMarkup).toContain("Leeg deel");
  expect(managementMarkup).toContain("Geheime bronmap");
  expect(managementMarkup).toContain("Handmatig");
  expect(managementMarkup).toContain("Zonder deel");
  expect(managementMarkup).toContain("Nog geen hoofdstukken gekoppeld.");
  expect(adminMarkup).toContain('aria-label="Hoofdstuk beheren"');
  expect(publicMarkup.match(/class="portfolio-card color-card"/g)).toHaveLength(6);
  expect(publicMarkup.indexOf("Inhoud 2<")).toBeLessThan(publicMarkup.indexOf("Inhoud 10<"));
  expect(publicMarkup.indexOf("Inhoud 1<")).toBeLessThan(publicMarkup.indexOf("Inhoud 4<"));
  // Public presentation is identical when origin metadata is absent; only names/order/relations matter.
  const withoutOrigin = buildPortfolioThemeGroups(student, themes.map(({ id, name }) => ({ id, name })), "Overige hoofdstukken");
  expect(withoutOrigin).toEqual(publicGroups);
  await database.execute("UPDATE portfolios SET theme_id = NULL WHERE learning_space_id = 'space-6'");
  const rootOnly = renderToStaticMarkup(await PublicPage(params));
  expect(rootOnly).not.toContain("<h2>");
  expect(rootOnly).not.toContain("Overige hoofdstukken");
  expect(rootOnly.match(/class="portfolio-card color-card"/g)).toHaveLength(6);
  expect(await getThemes("space-6")).toEqual(themes);
});
