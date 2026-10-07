import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", async (importOriginal: () => Promise<typeof import("./auth")>) => ({
  ...await importOriginal(), requireAdminUser: vi.fn(async () => ({ id: "teacher", role: "teacher", status: "active" })),
}));
vi.mock("@/lib/authorization", async (importOriginal: () => Promise<typeof import("./authorization")>) => ({
  ...await importOriginal(), requireLearningSpaceManagement: vi.fn(),
}));

import { getDatabase, resetDatabaseForTests } from "./database";
import type { IndexedPortfolio, IndexedSourceTheme } from "./domain";
import {
  createTheme, getActiveLearningSpaceSource, getAdminPortfolios, getIndexedSourceManifest,
  getSyncPublicationSnapshot, getThemes, moveTheme, persistIndex, setExerciseNote,
  setPortfolioTheme, tryAcquireSyncLease, updateTheme,
} from "./repositories";
import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG } from "./source-profile-config";
import { sourceManifestFromIndex } from "./source-comparison";
import { LocalFilesystemProvider } from "./storage/local-filesystem-provider";
import { indexSource } from "./storage/portfolio-indexer";
import { deleteThemeAction, savePortfolioAction, setPortfolioThemeAction } from "@/app/admin/actions";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) {
    try {
      await rm(temporaryDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EBUSY") throw error;
    }
  }
  temporaryDirectory = undefined;
});

async function setupDatabase(themeMode: "folder" | "none" = "folder") {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-source-themes-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
  const database = await getDatabase();
  const config = structuredClone(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
  config.scanner.portfolio.themeMode = themeMode;
  await database.execute({
    sql: "UPDATE source_profiles SET config_json = ? WHERE id IN (SELECT source_profile_id FROM learning_space_source_profiles WHERE learning_space_id = 'space-6')",
    args: [JSON.stringify(config)],
  });
  return { database, config };
}

function fixture(code: string, sourceTheme?: IndexedSourceTheme): IndexedPortfolio {
  return {
    code, title: `Test ${code}`, relativePath: `${sourceTheme ? `${sourceTheme.relativePath}/` : ""}Portfolio ${code} Test`,
    ...(sourceTheme ? { sourceTheme } : {}),
    assignmentPdfPath: null, assignmentPdfSourceId: null, hintsDocumentPath: null, hintsDocumentSourceId: null,
    finalSolutionsPdfPath: null, finalSolutionsPdfSourceId: null, resourceAssets: [], sections: [],
    exercises: [{ code: "1", number: 1, suffix: "", assets: [] }], warnings: [],
  };
}

const analysisTheme: IndexedSourceTheme = { name: "02 Analyse & functies", relativePath: "02 Analyse & functies", sourceId: "opaque-folder-42" };

describe("source theme synchronization", () => {
  it("protects source identity after switching to none and permits safe manual deletion in folder mode", async () => {
    const { database, config } = await setupDatabase();
    await persistIndex([fixture("1", analysisTheme), fixture("2")], "local", "space-6");
    const source = (await getThemes("space-6"))[0];
    await createTheme("space-6", "Handmatig");
    const manual = (await getThemes("space-6")).find((item) => !item.sourceTheme)!;
    const request = (id: string) => {
      const form = new FormData();
      form.set("id", id);
      form.set("learningSpaceId", "space-6");
      return form;
    };
    await deleteThemeAction(request(manual.id));
    expect(await getThemes("space-6")).toEqual([source]);
    config.scanner.portfolio.themeMode = "none";
    await database.execute({
      sql: "UPDATE source_profiles SET config_json = ? WHERE id IN (SELECT source_profile_id FROM learning_space_source_profiles WHERE learning_space_id = 'space-6')",
      args: [JSON.stringify(config)],
    });
    await expect(deleteThemeAction(request(source.id))).rejects.toThrow("bepaald door de bronmappen");
    expect(await getThemes("space-6")).toEqual([source]);
    expect((await getAdminPortfolios("space-6")).map((item) => item.themeId)).toEqual([source.id, null]);
  });

  it.each(["none", "folder"] as const)("protects theme membership through both server actions while saving other settings (%s)", async (themeMode: "none" | "folder") => {
    await setupDatabase(themeMode);
    const indexed = [fixture("1", analysisTheme), fixture("2")];
    await persistIndex(indexed, "local", "space-6");
    await createTheme("space-6", "Handmatig");
    const manual = (await getThemes("space-6")).find((theme) => theme.name === "Handmatig")!;
    const original = (await getAdminPortfolios("space-6"))[0];
    const sourceThemeId = original.themeId;
    const themeRequest = (id: string, themeId: string | null) => {
      const form = new FormData();
      form.set("id", id);
      form.set("learningSpaceId", "space-6");
      form.set("themeId", themeId ?? "");
      return form;
    };
    await setPortfolioThemeAction(themeRequest(original.id, manual.id));
    expect((await getAdminPortfolios("space-6"))[0].themeId).toBe(themeMode === "folder" ? sourceThemeId : manual.id);
    const settings = themeRequest(original.id, manual.id);
    settings.set("title", "Eigen titel");
    settings.set("cardColor", "#ABCDEF");
    settings.set("mode", "hidden");
    settings.set("publicationMode", "hidden");
    settings.set("customText", "Eigen uitleg");
    settings.set("customTextPosition", "below_documents");
    if (themeMode === "folder") settings.delete("themeId"); // Disabled controls are absent in a normal request.
    await expect(savePortfolioAction(settings)).resolves.toEqual({ themeId: themeMode === "folder" ? sourceThemeId : manual.id });
    expect((await getAdminPortfolios("space-6"))[0]).toMatchObject({
      id: original.id, themeId: themeMode === "folder" ? sourceThemeId : manual.id,
      title: "Eigen titel", cardColor: "#ABCDEF", visible: false, customText: "Eigen uitleg", customTextPosition: "below_documents",
    });
    settings.set("themeId", manual.id); // A forged combined settings request must also retain source membership.
    await savePortfolioAction(settings);
    await setPortfolioThemeAction(themeRequest(original.id, null));
    const root = (await getAdminPortfolios("space-6"))[1];
    await setPortfolioTheme(root.id, "space-6", manual.id);
    if (themeMode === "folder") {
      expect((await getAdminPortfolios("space-6"))[1].themeId).toBeNull();
      await expect(deleteThemeAction(themeRequest(sourceThemeId!, null))).rejects.toThrow("bepaald door de bronmappen");
      expect((await getThemes("space-6")).some((theme) => theme.id === sourceThemeId)).toBe(true);
    }
    await persistIndex(indexed, "local", "space-6");
    expect((await getAdminPortfolios("space-6"))[0]).toMatchObject({
      id: original.id, themeId: themeMode === "folder" ? sourceThemeId : null, title: "Eigen titel", customText: "Eigen uitleg",
    });
  });

  it("persists scanner themes, shared membership and a mixed root without inventing a root theme", async () => {
    const { database, config } = await setupDatabase();
    const root = path.join(temporaryDirectory!, "source");
    for (const directory of ["02 Analyse & functies/Portfolio 1 Limieten", "02 Analyse & functies/Portfolio 2 Afgeleiden", "Meetkunde/Portfolio 3 Vectoren", "Portfolio 4 Basis"]) {
      await mkdir(path.join(root, directory), { recursive: true });
    }
    const indexed = await indexSource(new LocalFilesystemProvider(root), config);
    await persistIndex(indexed, "local", "space-6");
    const themes = await getThemes("space-6");
    expect(themes.map((theme) => theme.name)).toEqual(["02 Analyse & functies", "Meetkunde"]);
    const source = (await getActiveLearningSpaceSource("space-6"))!;
    expect(themes[0].sourceTheme).toEqual({ name: "02 Analyse & functies", relativePath: "02 Analyse & functies", sourceId: "02 Analyse & functies", scope: source.id });
    const portfolios = await getAdminPortfolios("space-6");
    expect(portfolios.map((portfolio) => [portfolio.code, portfolio.themeId])).toEqual([
      ["1", themes[0].id], ["2", themes[0].id], ["3", themes[1].id], ["4", null],
    ]);
    expect(await getIndexedSourceManifest("space-6")).toEqual(sourceManifestFromIndex(indexed));
    const before = (await database.execute("SELECT * FROM themes ORDER BY id")).rows;
    const ids = portfolios.map((portfolio) => portfolio.id);
    await persistIndex(await indexSource(new LocalFilesystemProvider(root), config), "local", "space-6");
    expect((await database.execute("SELECT * FROM themes ORDER BY id")).rows).toEqual(before);
    expect((await getAdminPortfolios("space-6")).map((portfolio) => portfolio.id)).toEqual(ids);
    expect((await database.execute("SELECT id FROM portfolios")).rows).toHaveLength(4);
  });

  it("retains portfolio identities, app metadata and edited theme names and order on identical sync", async () => {
    const { database } = await setupDatabase("none");
    const portfolio = fixture("1");
    await persistIndex([portfolio], "local", "space-6");
    const original = (await getAdminPortfolios("space-6"))[0];
    await database.execute({
      sql: "UPDATE portfolios SET title_override = 'Eigen titel', custom_text = 'Eigen uitleg', card_color = '#ABCDEF', visible = 0, publication_limited = 1, publish_from = '2099-01-01' WHERE id = ?",
      args: [original.id],
    });
    await setExerciseNote(original.exercises![0].id, "Bewaar de tip", "Tip", "below_solution");
    await createTheme("space-6", analysisTheme.name, 80);
    const manual = (await getThemes("space-6"))[0];
    const config = structuredClone(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
    config.scanner.portfolio.themeMode = "folder";
    await database.execute({
      sql: "UPDATE source_profiles SET config_json = ? WHERE id IN (SELECT source_profile_id FROM learning_space_source_profiles WHERE learning_space_id = 'space-6')",
      args: [JSON.stringify(config)],
    });
    const indexed = fixture("1", analysisTheme);
    await persistIndex([indexed], "local", "space-6");
    const automatic = (await getThemes("space-6")).find((theme) => theme.sourceTheme)!;
    expect(automatic.id).not.toBe(manual.id);
    expect(automatic.name).toBe(analysisTheme.name);
    expect(automatic.sortOrder).toBe(90);
    await updateTheme(automatic.id, "space-6", "Mijn analyse");
    await moveTheme(automatic.id, "space-6", "up");
    const before = (await database.execute("SELECT * FROM themes ORDER BY id")).rows;
    await persistIndex([indexed], "local", "space-6");
    expect((await database.execute("SELECT * FROM themes ORDER BY id")).rows).toEqual(before);
    expect((await database.execute({ sql: "SELECT * FROM portfolios WHERE id = ?", args: [original.id] })).rows[0]).toMatchObject({
      id: original.id, title_override: "Eigen titel", custom_text: "Eigen uitleg", card_color: "#ABCDEF",
      visible: 0, publication_limited: 1, publish_from: "2099-01-01", theme_id: automatic.id,
    });
    expect((await database.execute("SELECT id, custom_note, note_label FROM exercises")).rows).toEqual([
      expect.objectContaining({ id: original.exercises![0].id, custom_note: "Bewaar de tip", note_label: "Tip" }),
    ]);
  });

  it("preserves manual membership and ignores theme metadata in themeMode none", async () => {
    await setupDatabase("none");
    const indexed = fixture("1", analysisTheme);
    await persistIndex([indexed], "local", "space-6");
    expect(await getThemes("space-6")).toEqual([]);
    await createTheme("space-6", "Handmatig");
    const manual = (await getThemes("space-6"))[0];
    const portfolio = (await getAdminPortfolios("space-6"))[0];
    await setPortfolioTheme(portfolio.id, "space-6", manual.id);
    await persistIndex([fixture("1")], "local", "space-6");
    expect(await getThemes("space-6")).toEqual([manual]);
    expect((await getAdminPortfolios("space-6"))[0]).toMatchObject({ id: portfolio.id, themeId: manual.id });
  });

  it("clears root membership in folder mode without deleting the former manual theme", async () => {
    await setupDatabase();
    await createTheme("space-6", "Handmatig");
    const manual = (await getThemes("space-6"))[0];
    await persistIndex([fixture("1")], "local", "space-6");
    const portfolio = (await getAdminPortfolios("space-6"))[0];
    await setPortfolioTheme(portfolio.id, "space-6", manual.id);
    await persistIndex([fixture("1")], "local", "space-6");
    expect((await getAdminPortfolios("space-6"))[0].themeId).toBeNull();
    expect(await getThemes("space-6")).toEqual([manual]);
  });

  it("retains missing themes and memberships and reuses their exact identity when they return", async () => {
    const { database } = await setupDatabase();
    await persistIndex([fixture("1", analysisTheme)], "local", "space-6");
    const themes = await getThemes("space-6");
    const portfolioId = (await getAdminPortfolios("space-6"))[0].id;
    await persistIndex([], "local", "space-6");
    expect(await getThemes("space-6")).toEqual(themes);
    expect((await database.execute({ sql: "SELECT id, theme_id, is_indexed FROM portfolios WHERE id = ?", args: [portfolioId] })).rows[0])
      .toMatchObject({ id: portfolioId, theme_id: themes[0].id, is_indexed: 0 });
    await persistIndex([fixture("1", analysisTheme)], "local", "space-6");
    expect(await getThemes("space-6")).toEqual(themes);
    expect((await getAdminPortfolios("space-6"))[0]).toMatchObject({ id: portfolioId, themeId: themes[0].id });
  });

  it("scopes identical references to their configured source and learning space", async () => {
    const { database, config } = await setupDatabase();
    const source = (await getActiveLearningSpaceSource("space-6"))!;
    const indexed = fixture("1", analysisTheme);
    await persistIndex([indexed], "local", "space-6", { sourceId: source.id });
    const firstTheme = (await getThemes("space-6"))[0];
    await database.execute({
      sql: "INSERT INTO learning_space_sources (id, learning_space_id, role, provider_type, is_active, local_source_path, created_at, updated_at) VALUES ('theme-mirror', 'space-6', 'mirror', 'local', 0, 'other-root', '2026-10-05', '2026-10-05')",
      args: [],
    });
    await persistIndex([indexed], "local", "space-6", { sourceId: "theme-mirror" });
    const themes = await getThemes("space-6");
    expect(themes).toHaveLength(2);
    expect(themes.map((theme) => theme.sourceTheme!.scope).sort()).toEqual([source.id, "theme-mirror"].sort());
    const mirrorTheme = themes.find((theme) => theme.sourceTheme!.scope === "theme-mirror")!;
    expect(mirrorTheme.id).not.toBe(firstTheme.id);
    await persistIndex([indexed], "local", "space-6", { sourceId: "theme-mirror" });
    expect(await getThemes("space-6")).toEqual(themes);
    expect((await getAdminPortfolios("space-6"))[0].themeId).toBe(mirrorTheme.id);
    await database.execute({
      sql: "UPDATE source_profiles SET config_json = ? WHERE id IN (SELECT source_profile_id FROM learning_space_source_profiles WHERE learning_space_id = 'space-5')",
      args: [JSON.stringify(config)],
    });
    await persistIndex([indexed], "local", "space-5");
    const other = (await getThemes("space-5"))[0];
    expect(other.id).not.toBe(firstTheme.id);
    expect(other.sourceTheme!.sourceId).toBe(analysisTheme.sourceId);
  });

  it("retains detected themes without creating ambiguous portfolio memberships", async () => {
    await setupDatabase();
    await persistIndex([fixture("1", analysisTheme), fixture("1", { ...analysisTheme, sourceId: "other-folder" })], "local", "space-6");
    expect(await getThemes("space-6")).toHaveLength(2);
    expect(await getAdminPortfolios("space-6")).toEqual([]);
  });

  it("rolls back themes together with a failing index publication", async () => {
    const { database } = await setupDatabase();
    await persistIndex([fixture("1")], "local", "space-6");
    const before = (await database.execute("SELECT * FROM portfolios")).rows;
    const invalid = fixture("2", analysisTheme);
    invalid.title = null as unknown as string;
    await expect(persistIndex([invalid], "local", "space-6")).rejects.toThrow();
    expect(await getThemes("space-6")).toEqual([]);
    expect((await database.execute("SELECT * FROM portfolios")).rows).toEqual(before);
  });

  it("publishes themes through the existing guard and rejects a stale snapshot without writes", async () => {
    const { database } = await setupDatabase();
    const source = (await getActiveLearningSpaceSource("space-6"))!;
    const ownerId = "source-theme-worker";
    expect(await tryAcquireSyncLease("space-6", ownerId)).toBe(true);
    const snapshot = (await getSyncPublicationSnapshot("space-6", source.id))!;
    const options = { sourceId: source.id, publicationGuard: { ownerId, leaseSeconds: 600, snapshot } };
    await persistIndex([fixture("1", analysisTheme)], "local", "space-6", options);
    const themes = await getThemes("space-6");
    const before = (await database.execute("SELECT * FROM portfolios")).rows;
    await database.execute("UPDATE source_profiles SET updated_at = '2099-01-01' WHERE id IN (SELECT source_profile_id FROM learning_space_source_profiles WHERE learning_space_id = 'space-6')");
    await expect(persistIndex([fixture("2", { ...analysisTheme, sourceId: "new-folder" })], "local", "space-6", options)).rejects.toThrow();
    expect(await getThemes("space-6")).toEqual(themes);
    expect((await database.execute("SELECT * FROM portfolios")).rows).toEqual(before);
  });
});
