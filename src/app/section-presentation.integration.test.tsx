import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
vi.mock("@/lib/learning-space-access", () => ({ requirePublicLearningSpaceAccess: async () => ({ id: "student", role: "student" }) }));
vi.mock("@/lib/public-index", () => ({ preparePublicIndex: vi.fn(), isNextPrefetchRequest: () => false }));
vi.mock("@/app/components/portfolio-documents-with-message", () => ({ PortfolioDocumentsWithMessage: () => null }));
vi.mock("@/app/components/portfolio-error-report-form", () => ({ PortfolioErrorReportForm: () => null }));

import PublicPortfolioPage from "./[spaceSlug]/portfolio/[id]/page";
import { getDatabase, resetDatabaseForTests } from "@/lib/database";
import { getAdminPortfolio, getAdminPortfolios, getStudentPortfolio, persistIndex, setPortfolioPublication, setSectionPublication } from "@/lib/repositories";
import { indexSource } from "@/lib/storage/portfolio-indexer";
import { LocalFilesystemProvider } from "@/lib/storage/local-filesystem-provider";

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

it("renders a section-to-root move without the empty heading while preserving the real section and its publication metadata", async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "section-presentation-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(directory, "metadata.db");
  resetDatabaseForTests();
  const sourcePath = path.join(directory, "source");
  const portfolioPath = path.join(sourcePath, "Portfolio 1B Stelsels");
  const sectionPath = path.join(portfolioPath, "1 Basis");
  const fileName = "PF1B-Oef20a.png";
  await mkdir(sectionPath, { recursive: true });
  await writeFile(path.join(sectionPath, fileName), "solution");
  const provider = new LocalFilesystemProvider(sourcePath);
  await persistIndex(await indexSource(provider), "local", "space-6");
  const original = (await getAdminPortfolios("space-6"))[0];
  const sectionId = original.sections[0].id;
  const exerciseId = original.sections[0].exercises[0].id;
  await setPortfolioPublication(original.id, "visible", false, null, null);
  await setSectionPublication(sectionId, "hidden", true, "2099-01-01", "2099-12-31");
  const database = await getDatabase();
  const sectionMetadata = async () => (await database.execute({
    sql: "SELECT id, portfolio_id, section_code, title, relative_path, visibility_mode, publication_limited, publish_from, publish_until, archived_at, is_indexed FROM sections WHERE id = ?",
    args: [sectionId],
  })).rows[0];
  const beforeMetadata = await sectionMetadata();
  const params = { params: Promise.resolve({ spaceSlug: "6", id: original.id }) };
  const beforeMarkup = renderToStaticMarkup(await PublicPortfolioPage(params));
  expect(beforeMarkup).toContain("<h2>1. Basis</h2>");
  expect(beforeMarkup).toContain("Niet beschikbaar");
  expect(beforeMarkup).not.toContain(`/6/oefening/${exerciseId}`);

  await rename(path.join(sectionPath, fileName), path.join(portfolioPath, fileName));
  for (let run = 0; run < 2; run += 1) {
    await persistIndex(await indexSource(provider), "local", "space-6");
    const admin = await getAdminPortfolio(original.id, "space-6");
    expect(admin?.sections).toEqual([expect.objectContaining({
      id: sectionId, isIndexed: true, exercises: [], visibilityMode: "hidden", limited: true,
      publishFrom: "2099-01-01", publishUntil: "2099-12-31",
    })]);
    expect(admin?.exercises).toEqual([expect.objectContaining({ id: exerciseId })]);
    expect(await getStudentPortfolio(original.id, "space-6")).toMatchObject({
      sections: [expect.objectContaining({ id: sectionId, exercises: [] })],
      exercises: [expect.objectContaining({ id: exerciseId, visible: true })],
    });
    const markup = renderToStaticMarkup(await PublicPortfolioPage(params));
    expect(markup).not.toContain("<h2>");
    expect(markup).not.toContain("Basis");
    expect(markup).not.toContain("Zonder onderdeel");
    expect(markup.match(/class="exercise-grid"/g)).toHaveLength(1);
    expect(markup.match(/class="exercise-link"/g)).toHaveLength(1);
    expect(markup).toContain(`href="/6/oefening/${exerciseId}"`);
    expect(await sectionMetadata()).toEqual(beforeMetadata);
    expect(await getAdminPortfolio(original.id, "space-6")).toEqual(admin);
  }
});
