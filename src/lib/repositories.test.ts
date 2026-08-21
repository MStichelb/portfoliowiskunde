import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import { adminExercisePortfolioHref } from "./admin-routes";
import { archiveLearningSpace, archiveMissingIndexItems, createErrorReport, createLearningSpace, createTheme, deleteErrorReport, deleteOldDoneErrorReports, getActiveLearningSpaceSource, getActiveWarningCounts, getAdminErrorReports, getAdminExercise, getAdminLearningSpaceBySlug, getAdminPortfolios, getLatestWarnings, getLearningSpace, getLearningSpaceBySlug, getLearningSpaces, getOldDoneErrorReportCount, getOpenErrorReportCount, getPublicAsset, getStudentPortfolios, getThemes, hasValidLearningSpaceIndex, permanentlyDeleteLearningSpace, persistIndex, recordFailedSync, releaseSyncLease, restoreLearningSpace, saveErrorReportNote, setErrorReportStatus, setExerciseAlternativeVisibility, setExercisePublication, setPortfolioCardColor, setPortfolioPublication, setPortfolioTheme, toggleErrorReportPin, tryAcquireSyncLease, updateLearningSpace } from "./repositories";
import { synchronizeSource } from "./sync";
import { SourceAccessError, SourceConfigurationError } from "./source-errors";
import { indexSource } from "./storage/portfolio-indexer";
import type { StorageEntry, StorageProvider } from "./storage/provider";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) {
    try {
      await rm(temporaryDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EBUSY") throw error;
    }
  }
  temporaryDirectory = undefined;
});

describe("persistIndex", () => {
  it("coordinates synchronization with an expiring database lease", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-lease-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    await getDatabase();
    const now = new Date("2026-08-12T12:00:00.000Z");
    expect(await tryAcquireSyncLease("space-6", "owner-a", now, 120)).toBe(true);
    expect(await tryAcquireSyncLease("space-6", "owner-b", new Date(now.getTime() + 60_000), 120)).toBe(false);
    await releaseSyncLease("space-6", "owner-a");
    expect(await tryAcquireSyncLease("space-6", "owner-b", new Date(now.getTime() + 61_000), 120)).toBe(true);
  });

  it("is idempotent for multiple portfolios and updates a replaced source file", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-sync-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    const source = createTwoPortfolioProvider();
    const firstIndex = await indexSource(source);

    expect(firstIndex).toHaveLength(2);
    expect(firstIndex.flatMap((portfolio) => portfolio.sections).flatMap((section) => section.exercises).flatMap((exercise) => exercise.assets)).toHaveLength(5);
    expect(await hasValidLearningSpaceIndex("space-6")).toBe(false);
    await persistIndex(firstIndex, "local");
    expect(await hasValidLearningSpaceIndex("space-6")).toBe(true);
    const database = await getDatabase();
    const original = await database.execute("SELECT id, variant_id, relative_path FROM solution_assets ORDER BY id LIMIT 1");
    await database.execute({ sql: "UPDATE solution_assets SET id = ? WHERE id = ?", args: ["legacy-v02-asset-id", String(original.rows[0].id)] });
    const exercise = await database.execute("SELECT id FROM exercises ORDER BY id LIMIT 1");
    await setExercisePublication([String(exercise.rows[0].id)], "visible", null, null);

    await expect(persistIndex(await indexSource(source), "local")).resolves.toMatchObject({ added: 0, missing: 0 });
    expect(Number((await database.execute("SELECT COUNT(*) AS count FROM solution_assets")).rows[0].count)).toBe(5);
    expect(Number((await database.execute({ sql: "SELECT visible FROM exercises WHERE id = ?", args: [String(exercise.rows[0].id)] })).rows[0].visible)).toBe(1);

    source.setVersion("Portfolio 3 - Toepassingen van integralen/Uitwerkingen/1 - Integralen/PF3-Oef2(1).png", "replacement-v2");
    source.setSourceId("Portfolio 3 - Toepassingen van integralen/Uitwerkingen/1 - Integralen/PF3-Oef2(1).png", "google-replacement-id");
    await expect(persistIndex(await indexSource(source), "local")).resolves.toMatchObject({ updated: 1, missing: 0 });
    const updated = await database.execute({ sql: "SELECT source_id, source_version FROM solution_assets WHERE relative_path = ?", args: ["Portfolio 3 - Toepassingen van integralen/Uitwerkingen/1 - Integralen/PF3-Oef2(1).png"] });
    expect(updated.rows[0].source_version).toBe("replacement-v2");
    expect(updated.rows[0].source_id).toBe("google-replacement-id");
    expect(Number((await database.execute("SELECT COUNT(*) AS count FROM solution_assets")).rows[0].count)).toBe(5);
  });

  it("uses natural portfolio-ID ordering in admin and public read models", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-order-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    const codes = ["12", "2B", "3", "X", "10", "2", "A", "1", "2A", "11"];
    const indexed = (await Promise.all(codes.map((code) => indexSource(createPortfolioProvider(code, `PF${code}-Oef1.png`))))).flat();
    indexed.find((portfolio) => portfolio.code === "X")!.warnings.push({
      severity: "warning", path: "Portfolio X - Test", message: "Testwaarschuwing",
    });
    await persistIndex(indexed, "local");

    const expected = ["1", "2", "2A", "2B", "3", "10", "11", "12", "A", "X"];
    const adminPortfolios = await getAdminPortfolios();
    expect(adminPortfolios.map((portfolio) => portfolio.code)).toEqual(expected);
    expect((await getActiveWarningCounts()).get(adminPortfolios.find((portfolio) => portfolio.code === "X")!.id)).toBe(1);
    for (const portfolio of adminPortfolios) await setPortfolioPublication(portfolio.id, "visible", false, null, null);
    expect((await getStudentPortfolios()).map((portfolio) => portfolio.code)).toEqual(expected);
  });

  it("lets visible sections and exercises follow a visible portfolio without resetting overrides", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-visibility-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    const source = createTwoPortfolioProvider();
    await persistIndex(await indexSource(source), "local");
    await setPortfolioPublication("portfolio-3", "visible", false, null, null);
    const visiblePortfolio = (await getStudentPortfolios()).find((portfolio) => portfolio.id === "portfolio-3");
    expect(visiblePortfolio?.sections.flatMap((section) => section.exercises).every((exercise) => exercise.visible)).toBe(true);

    const database = await getDatabase();
    const exerciseId = String((await database.execute("SELECT id FROM exercises WHERE portfolio_id = 'portfolio-3' ORDER BY id LIMIT 1")).rows[0].id);
    await setExercisePublication([exerciseId], "hidden", null, null);
    expect((await getStudentPortfolios()).find((portfolio) => portfolio.id === "portfolio-3")?.sections.flatMap((section) => section.exercises).find((exercise) => exercise.id === exerciseId)?.visible).toBe(false);
    await persistIndex(await indexSource(source), "local");
    expect((await database.execute({ sql: "SELECT visibility_mode FROM exercises WHERE id = ?", args: [exerciseId] })).rows[0].visibility_mode).toBe("hidden");
    expect((await database.execute("SELECT COUNT(*) AS count FROM sections WHERE visibility_mode = 'visible'")).rows[0].count).not.toBe(0);
    expect((await database.execute("SELECT COUNT(*) AS count FROM exercises WHERE visibility_mode = 'visible'")).rows[0].count).not.toBe(0);
  });

  it("marks removed source exercises as missing, then archives them without touching other index metadata", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-missing-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    const source = createTwoPortfolioProvider();
    await persistIndex(await indexSource(source), "local");
    const removed = "Portfolio 3 - Toepassingen van integralen/Uitwerkingen/1 - Integralen/PF3-Oef2(1).png";
    source.remove(removed);
    source.remove(removed.replace("(1)", "(2)"));
    source.remove(removed.replace("(1)", "-alt(1)"));
    await persistIndex(await indexSource(source), "local");
    const beforeCleanup = (await getAdminPortfolios()).find((portfolio) => portfolio.code === "3")!;
    const missingExercise = beforeCleanup.sections.flatMap((section) => section.exercises).find((exercise) => exercise.code === "2");
    expect(missingExercise?.isIndexed).toBe(false);
    expect((await getLatestWarnings()).some((warning) => warning.message.includes("Bronbestand ontbreekt"))).toBe(true);
    await archiveMissingIndexItems("space-6");
    const afterCleanup = (await getAdminPortfolios()).find((portfolio) => portfolio.code === "3")!;
    expect(afterCleanup.sections.flatMap((section) => section.exercises).some((exercise) => exercise.code === "2")).toBe(false);
    expect((await getAdminPortfolios()).find((portfolio) => portfolio.code === "4")?.sections.flatMap((section) => section.exercises).some((exercise) => exercise.code === "1")).toBe(true);
    expect(source.has(removed)).toBe(false);
  });

  it("warns for each missing step while keeping partial standard and alternative solutions usable", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-partial-missing-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    const source = createTwoPortfolioProvider();
    const standardFirst = "Portfolio 3 - Toepassingen van integralen/Uitwerkingen/1 - Integralen/PF3-Oef2(1).png";
    const standardSecond = standardFirst.replace("(1)", "(2)");
    const alternativeSecond = standardFirst.replace("(1)", "-alt(2)");
    source.add(alternativeSecond);
    await persistIndex(await indexSource(source), "local");
    source.remove(standardSecond);
    source.remove(alternativeSecond);
    await persistIndex(await indexSource(source), "local");

    const exercise = (await getAdminPortfolios()).find((portfolio) => portfolio.code === "3")!.sections.flatMap((section) => section.exercises).find((item) => item.code === "2")!;
    expect(exercise.isIndexed).toBe(true);
    expect(exercise.standardAssets).toBe(1);
    expect(exercise.alternativeAssets).toBe(1);
    expect(exercise.missingAssets).toBe(2);
    expect((await getLatestWarnings()).filter((warning) => warning.message.includes("onvolledig"))).toHaveLength(2);
    expect((await getLatestWarnings()).some((warning) => warning.message.includes("Alternatieve uitwerking is onvolledig"))).toBe(true);
    expect((await getLatestWarnings()).some((warning) => warning.message.includes("PF3-Oef2(2).png"))).toBe(true);
    expect((await getLatestWarnings()).some((warning) => warning.message.includes("PF3-Oef2-alt(2).png"))).toBe(true);

    await archiveMissingIndexItems("space-6");
    const afterCleanup = (await getAdminPortfolios()).find((portfolio) => portfolio.code === "3")!.sections.flatMap((section) => section.exercises).find((item) => item.code === "2")!;
    expect(afterCleanup.isIndexed).toBe(true);
    expect(afterCleanup.missingAssets).toBe(0);
    expect((await getLatestWarnings()).filter((warning) => warning.message.includes("onvolledig"))).toHaveLength(0);

    source.add(standardSecond);
    source.add(alternativeSecond);
    await persistIndex(await indexSource(source), "local");
    expect((await getLatestWarnings()).filter((warning) => warning.message.includes("onvolledig"))).toHaveLength(0);
    expect((await getAdminPortfolios()).find((portfolio) => portfolio.code === "3")!.sections.flatMap((section) => section.exercises).find((item) => item.code === "2")?.missingAssets).toBe(0);
  });

  it("never infers a missing asset from a single file or a first step alone", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-single-asset-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    const source = createSingleAssetProvider("PF8-Oef2.png");
    await persistIndex(await indexSource(source), "local");
    let exercise = (await getAdminPortfolios()).find((portfolio) => portfolio.code === "8")!.sections[0].exercises[0];
    expect(exercise).toMatchObject({ isIndexed: true, standardAssets: 1, alternativeAssets: 0, missingAssets: 0 });
    expect(await getLatestWarnings()).toHaveLength(0);

    const firstStepOnly = createSingleAssetProvider("PF8-Oef2(1).png");
    await persistIndex(await indexSource(firstStepOnly), "local", "space-5");
    exercise = (await getAdminPortfolios("space-5")).find((portfolio) => portfolio.code === "8")!.sections[0].exercises[0];
    expect(exercise).toMatchObject({ isIndexed: true, standardAssets: 1, alternativeAssets: 0, missingAssets: 0 });
    expect(await getLatestWarnings("space-5")).toHaveLength(0);
  });

  it("keeps error reports actionable with TODO, DONE, pinning and notes", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-reports-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    await persistIndex(await indexSource(createTwoPortfolioProvider()), "local");
    await setPortfolioPublication("portfolio-3", "visible", false, null, null);
    const database = await getDatabase();
    const exerciseId = String((await database.execute("SELECT id FROM exercises WHERE portfolio_id = 'portfolio-3' ORDER BY id LIMIT 1")).rows[0].id);
    await createErrorReport({ exerciseId, variant: "standard", message: "Stap twee bevat een fout.", rateLimitKey: "test-report" });
    expect(await getOpenErrorReportCount()).toBe(1);
    const report = (await getAdminErrorReports())[0];
    expect(report.createdAt).toBeTruthy();
    await toggleErrorReportPin(report.id);
    await saveErrorReportNote(report.id, "Later nakijken.");
    let updated = (await getAdminErrorReports())[0];
    expect(updated).toMatchObject({ status: "TODO", pinned: true, adminNote: "Later nakijken.", completedAt: null });
    await setErrorReportStatus(report.id, "DONE");
    updated = (await getAdminErrorReports())[0];
    expect(updated).toMatchObject({ status: "DONE", pinned: true, adminNote: "Later nakijken." });
    expect(updated.completedAt).toBeTruthy();
    expect(await getOpenErrorReportCount()).toBe(0);
    await setErrorReportStatus(report.id, "TODO");
    updated = (await getAdminErrorReports())[0];
    expect(updated.completedAt).toBeNull();
    expect(await getOpenErrorReportCount()).toBe(1);
  });

  it("deletes individual reports and only old completed reports in bulk", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-delete-")); process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db"); resetDatabaseForTests();
    await persistIndex(await indexSource(createTwoPortfolioProvider()), "local"); await setPortfolioPublication("portfolio-3", "visible", false, null, null);
    const database = await getDatabase(); const exercise = String((await database.execute("SELECT id FROM exercises WHERE portfolio_id = 'portfolio-3' LIMIT 1")).rows[0].id);
    for (const key of ["old", "edge", "recent", "todo"]) await createErrorReport({ exerciseId: exercise, variant: "standard", message: `Melding ${key}`, rateLimitKey: key });
    const reports = await getAdminErrorReports(); const byMessage = new Map(reports.map((report) => [report.message, report]));
    await deleteErrorReport(byMessage.get("Melding recent")!.id); expect((await getAdminErrorReports()).some((report) => report.message === "Melding recent")).toBe(false);
    const now = new Date("2026-08-20T12:00:00.000Z");
    await database.batch([
      { sql: "UPDATE error_reports SET status = 'DONE', completed_at = ? WHERE id = ?", args: ["2026-08-06T11:59:59.999Z", byMessage.get("Melding old")!.id] },
      { sql: "UPDATE error_reports SET status = 'DONE', completed_at = ? WHERE id = ?", args: ["2026-08-06T12:00:00.000Z", byMessage.get("Melding edge")!.id] },
    ]);
    expect(await getOldDoneErrorReportCount(now)).toBe(1); await deleteOldDoneErrorReports(now);
    const remaining = await getAdminErrorReports(); expect(remaining.map((report) => report.message)).toContain("Melding edge"); expect(remaining.map((report) => report.message)).toContain("Melding todo"); expect(remaining.map((report) => report.message)).not.toContain("Melding old");
  });

  it("only permits a solution asset when its full publication chain is effective", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-assets-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    await persistIndex(await indexSource(createTwoPortfolioProvider()), "local");
    const database = await getDatabase();
    const assetId = String((await database.execute("SELECT id FROM solution_assets ORDER BY id LIMIT 1")).rows[0].id);
    const exerciseId = String((await database.execute("SELECT id FROM exercises WHERE portfolio_id = 'portfolio-3' ORDER BY id LIMIT 1")).rows[0].id);
    expect(await getPublicAsset(assetId)).toBeNull();
    await setPortfolioPublication("portfolio-3", "visible", false, null, null);
    expect(await getPublicAsset(assetId)).not.toBeNull();
    await setExercisePublication([exerciseId], "hidden", null, null);
    expect(await getPublicAsset(assetId)).toBeNull();
    expect(await getAdminExercise(exerciseId)).not.toBeNull();
    await setExercisePublication([exerciseId], "visible", null, null);
    await setPortfolioPublication("portfolio-3", "visible", true, "2030-01-01T00:00:00.000Z", null);
    expect(await getPublicAsset(assetId)).toBeNull();
  });

  it("keeps alternative solution assets private when their student flag is disabled", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-alternatives-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    await persistIndex(await indexSource(createTwoPortfolioProvider()), "local");
    await setPortfolioPublication("portfolio-3", "visible", false, null, null);
    const database = await getDatabase();
    const row = (await database.execute("SELECT solution_assets.id AS asset_id, exercises.id AS exercise_id FROM solution_assets JOIN solution_variants ON solution_variants.id = solution_assets.variant_id JOIN exercises ON exercises.id = solution_variants.exercise_id WHERE solution_variants.kind = 'alternative' LIMIT 1")).rows[0];
    expect(await getPublicAsset(String(row.asset_id))).not.toBeNull();
    await setExerciseAlternativeVisibility(String(row.exercise_id), false);
    expect(await getPublicAsset(String(row.asset_id))).toBeNull();
    expect(await getAdminExercise(String(row.exercise_id))).not.toBeNull();
  });

  it("shows only warnings from the latest successful sync and keeps them after a failed run", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-warnings-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    const database = await getDatabase();
    await database.batch([
      { sql: "INSERT INTO sync_runs (id, started_at, finished_at, status) VALUES ('sync-a', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:01.000Z', 'completed')" },
      { sql: "INSERT INTO sync_warnings (id, sync_run_id, severity, relative_path, message) VALUES ('warning-a', 'sync-a', 'warning', 'Portfolio 3 - Test/file.png', 'Oud probleem')" },
    ]);
    expect(await getLatestWarnings()).toHaveLength(1);
    await database.execute("INSERT INTO sync_runs (id, started_at, finished_at, status) VALUES ('sync-b', '2026-01-02T00:00:00.000Z', '2026-01-02T00:00:01.000Z', 'completed')");
    expect(await getLatestWarnings()).toHaveLength(0);
    await database.batch([
      { sql: "INSERT INTO sync_runs (id, started_at, finished_at, status) VALUES ('sync-c', '2026-01-03T00:00:00.000Z', '2026-01-03T00:00:01.000Z', 'completed')" },
      { sql: "INSERT INTO sync_warnings (id, sync_run_id, severity, relative_path, message) VALUES ('warning-c', 'sync-c', 'warning', 'Portfolio 3 - Test/file.png', 'Blijvend probleem')" },
    ]);
    expect(await getLatestWarnings()).toMatchObject([{ message: "Blijvend probleem" }]);
    await recordFailedSync("local", new Error("Testfout"));
    expect(await getLatestWarnings()).toMatchObject([{ message: "Blijvend probleem" }]);
  });

  it("isolates duplicate portfolio codes, warnings, themes, reports and assets by learning space", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-spaces-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    const source = createTwoPortfolioProvider();
    const index = await indexSource(source);
    await persistIndex(index, "local", "space-5");
    await persistIndex(index, "local", "space-6");
    const fifth = await getAdminPortfolios("space-5");
    const sixth = await getAdminPortfolios("space-6");
    expect(fifth.find((portfolio) => portfolio.code === "3")?.id).not.toBe(sixth.find((portfolio) => portfolio.code === "3")?.id);
    const fifthPortfolio = fifth.find((portfolio) => portfolio.code === "3")!;
    const sixthPortfolio = sixth.find((portfolio) => portfolio.code === "3")!;
    await Promise.all([setPortfolioPublication(fifthPortfolio.id, "visible", false, null, null), setPortfolioPublication(sixthPortfolio.id, "visible", false, null, null)]);
    const fifthExercise = fifthPortfolio.sections[0].exercises[0].id;
    const sixthExercise = sixthPortfolio.sections[0].exercises[0].id;
    await createErrorReport({ exerciseId: fifthExercise, variant: "standard", message: "Fout in vijf.", rateLimitKey: "space-five" });
    await createErrorReport({ exerciseId: sixthExercise, variant: "standard", message: "Fout in zes.", rateLimitKey: "space-six" });
    expect(await getAdminErrorReports("space-5")).toHaveLength(1);
    expect(await getAdminErrorReports("space-6")).toHaveLength(1);
    await createTheme("space-5", "Analyse", 1);
    const theme = (await getThemes("space-5"))[0];
    await setPortfolioTheme(fifthPortfolio.id, "space-5", theme.id);
    expect((await getAdminPortfolios("space-5")).find((portfolio) => portfolio.id === fifthPortfolio.id)?.themeName).toBe("Analyse");
    expect((await getAdminPortfolios("space-6")).find((portfolio) => portfolio.id === sixthPortfolio.id)?.themeName).toBeNull();
    const database = await getDatabase();
    const fifthAsset = String((await database.execute({ sql: "SELECT solution_assets.id FROM solution_assets JOIN solution_variants ON solution_variants.id = solution_assets.variant_id JOIN exercises ON exercises.id = solution_variants.exercise_id WHERE exercises.portfolio_id = ? LIMIT 1", args: [fifthPortfolio.id] })).rows[0].id);
    expect(await getPublicAsset(fifthAsset, "space-5")).not.toBeNull();
    expect(await getPublicAsset(fifthAsset, "space-6")).toBeNull();
    await persistIndex([], "local", "space-5");
    expect((await getAdminPortfolios("space-6")).find((portfolio) => portfolio.id === sixthPortfolio.id)?.isIndexed).toBe(true);
  });

  it("returns the exact parent ID for a Google PF1 exercise preview and keeps the local PF1 separate", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-admin-routing-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    await updateLearningSpace("space-5", {
      name: "Google", slug: "google", shortLabel: "G", sortOrder: 50, sourceType: "google_drive", googleDriveFolderId: "google-root-id",
    });
    const index = await indexSource(createPortfolioProvider("1", "PF1-Oef1.png"));
    await persistIndex(index, "google_drive", "space-5");
    await persistIndex(index, "local", "space-6");

    const googlePortfolio = (await getAdminPortfolios("space-5")).find((portfolio) => portfolio.code === "1")!;
    const localPortfolio = (await getAdminPortfolios("space-6")).find((portfolio) => portfolio.code === "1")!;
    const googleExercise = await getAdminExercise(googlePortfolio.sections[0].exercises[0].id, "space-5");
    const localExercise = await getAdminExercise(localPortfolio.sections[0].exercises[0].id, "space-6");

    expect(googlePortfolio.id).not.toBe("portfolio-1");
    expect(googleExercise).toMatchObject({ portfolioId: googlePortfolio.id, learningSpaceId: "space-5" });
    expect(localExercise).toMatchObject({ portfolioId: localPortfolio.id, learningSpaceId: "space-6" });
    expect(adminExercisePortfolioHref("google", googleExercise!.portfolioId, googleExercise!.id)).toBe(
      `/admin/google/portfolio/${googlePortfolio.id}#exercise-${googleExercise!.id}`,
    );
    expect(adminExercisePortfolioHref("6", localExercise!.portfolioId, localExercise!.id)).toBe(
      `/admin/6/portfolio/${localPortfolio.id}#exercise-${localExercise!.id}`,
    );
  });

  it("creates generic learning spaces with a unique URL-safe slug", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-space-create-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    await expect(createLearningSpace({ name: "Fysica 4de jaar", slug: "fysica-4", shortLabel: "F4", sortOrder: 40, sourceType: "local", localSourcePath: null })).resolves.toMatchObject({ slug: "fysica-4", sourceType: "local", isActive: true, archivedAt: null });
    await expect(createLearningSpace({ name: "Dubbel", slug: "fysica-4", shortLabel: "D", sortOrder: 41, sourceType: "local", localSourcePath: null })).rejects.toThrow();
  });

  it("persists presentation metadata and keeps portfolio colors across resync", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-card-metadata-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    await updateLearningSpace("space-5", {
      name: "Vijfde jaar", slug: "5", shortLabel: "5WIS", description: "Publieke beschrijving",
      cardColor: "#A1B2C3", sortOrder: 50, sourceType: "local", localSourcePath: null,
    });
    expect(await getLearningSpace("space-5")).toMatchObject({
      name: "Vijfde jaar", shortLabel: "5WIS", description: "Publieke beschrijving", cardColor: "#A1B2C3",
    });

    const index = await indexSource(createTwoPortfolioProvider());
    await persistIndex(index, "local", "space-5");
    const portfolio = (await getAdminPortfolios("space-5"))[0];
    await setPortfolioCardColor(portfolio.id, "#C4D5E6");
    await setPortfolioPublication(portfolio.id, "visible", false, null, null);
    await persistIndex(index, "local", "space-5");
    expect((await getAdminPortfolios("space-5")).find((item) => item.id === portfolio.id)?.cardColor).toBe("#C4D5E6");
    expect((await getStudentPortfolios("space-5")).find((item) => item.id === portfolio.id)?.cardColor).toBe("#C4D5E6");
  });

  it("preserves dormant OneDrive and Google Drive configuration while switching providers", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-space-switch-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    await updateLearningSpace("space-5", {
      name: "5de jaar", slug: "5", shortLabel: "5", sortOrder: 50, sourceType: "onedrive",
      oneDriveDriveId: "drive-five", oneDriveFolderId: "folder-five", oneDriveFolderPath: "Wiskunde/5",
    });
    await updateLearningSpace("space-5", {
      name: "5de jaar", slug: "5", shortLabel: "5", sortOrder: 50, sourceType: "google_drive",
      googleDriveFolderId: "google-folder-five", googleDriveFolderLabel: "Mirror 5de jaar",
    });
    expect((await getLearningSpaces()).find((space) => space.id === "space-5")).toMatchObject({
      sourceType: "google_drive", oneDriveDriveId: "drive-five", oneDriveFolderId: "folder-five",
      googleDriveFolderId: "google-folder-five", googleDriveFolderLabel: "Mirror 5de jaar",
    });
    await updateLearningSpace("space-5", {
      name: "5de jaar", slug: "5", shortLabel: "5", sortOrder: 50, sourceType: "onedrive",
      oneDriveDriveId: "drive-five", oneDriveFolderId: "folder-five", oneDriveFolderPath: "Wiskunde/5",
    });
    expect((await getLearningSpaces()).find((space) => space.id === "space-5")).toMatchObject({
      sourceType: "onedrive", googleDriveFolderId: "google-folder-five", googleDriveFolderLabel: "Mirror 5de jaar",
    });
  });

  it("archives and restores a LearningSpace without losing settings or linked metadata", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-space-archive-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    const source = createTwoPortfolioProvider();
    await updateLearningSpace("space-5", { name: "5de jaar", slug: "5", shortLabel: "V", sortOrder: 55, sourceType: "google_drive", googleDriveFolderId: "mirror-five", googleDriveFolderLabel: "Mirror vijf" });
    await persistIndex(await indexSource(source), "local", "space-5");
    await persistIndex(await indexSource(source), "local", "space-6");
    await createTheme("space-5", "Integralen", 3);
    const initialPortfolios = await getAdminPortfolios("space-5");
    await setPortfolioPublication(initialPortfolios[0].id, "visible", true, "2026-09-01T08:00:00.000Z", "2027-06-30T16:00:00.000Z");
    const portfolioIds = initialPortfolios.map((portfolio) => portfolio.id);
    expect(await getLearningSpaceBySlug("5")).toMatchObject({ isActive: true });

    expect(await archiveLearningSpace("space-5")).toBe(true);
    expect(await getLearningSpaceBySlug("5")).toBeNull();
    expect(await getAdminLearningSpaceBySlug("5")).toMatchObject({
      isActive: false, shortLabel: "V", sortOrder: 55, sourceType: "google_drive", googleDriveFolderId: "mirror-five", googleDriveFolderLabel: "Mirror vijf",
    });
    expect((await getLearningSpaces(true)).some((space) => space.id === "space-5")).toBe(false);
    expect((await getLearningSpaces()).some((space) => space.id === "space-5" && !space.isActive && Boolean(space.archivedAt))).toBe(true);
    expect((await getAdminPortfolios("space-5")).map((portfolio) => portfolio.id)).toEqual(portfolioIds);
    expect((await getAdminPortfolios("space-5"))[0]).toMatchObject({ visible: true, limited: true, publishFrom: "2026-09-01T08:00:00.000Z", publishUntil: "2027-06-30T16:00:00.000Z" });
    expect(await getThemes("space-5")).toEqual([expect.objectContaining({ name: "Integralen", sortOrder: 3 })]);
    let providerRequested = false;
    await expect(synchronizeSource("space-5", {
      getConfiguredProvider: async () => { providerRequested = true; throw new Error("Provider mag niet worden geopend."); },
    })).resolves.toMatchObject({ skipped: true, skipReason: "archived" });
    expect(providerRequested).toBe(false);

    expect(await restoreLearningSpace("space-5")).toBe(true);
    expect(await getLearningSpaceBySlug("5")).toMatchObject({ isActive: true, archivedAt: null, googleDriveFolderId: "mirror-five" });
    expect((await getAdminPortfolios("space-5")).map((portfolio) => portfolio.id)).toEqual(portfolioIds);
    expect((await getAdminPortfolios("space-5"))[0]).toMatchObject({ visible: true, limited: true, publishFrom: "2026-09-01T08:00:00.000Z", publishUntil: "2027-06-30T16:00:00.000Z" });
    expect(await getThemes("space-5")).toHaveLength(1);
    expect((await getAdminPortfolios("space-6")).some((portfolio) => portfolio.code === "3")).toBe(true);
    expect(source.has("Portfolio 3 - Toepassingen van integralen/Uitwerkingen/1 - Integralen/PF3-Oef2(1).png")).toBe(true);
  });

  it("refuses to permanently delete an active LearningSpace", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-space-active-delete-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();

    expect(await permanentlyDeleteLearningSpace("space-5")).toBe(false);
    expect(await getLearningSpace("space-5")).toMatchObject({ isActive: true, archivedAt: null });
  });

  it("permanently deletes only one archived LearningSpace and its database-owned metadata", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-space-permanent-delete-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    const source = createTwoPortfolioProvider();
    await persistIndex(await indexSource(source), "local", "space-5");
    await persistIndex(await indexSource(source), "local", "space-6");
    await createTheme("space-5", "Te verwijderen thema", 1);
    await createTheme("space-6", "Te behouden thema", 1);
    await tryAcquireSyncLease("space-5", "delete-test-owner");
    const database = await getDatabase();
    const references = (await database.execute(`SELECT exercises.id AS exercise_id, exercises.section_id, exercises.portfolio_id
      FROM exercises JOIN portfolios ON portfolios.id = exercises.portfolio_id WHERE portfolios.learning_space_id = 'space-5' LIMIT 1`)).rows[0];
    const syncRunId = String((await database.execute("SELECT id FROM sync_runs WHERE learning_space_id = 'space-5' LIMIT 1")).rows[0]?.id);
    await database.execute({ sql: `INSERT INTO error_reports (id, portfolio_id, section_id, exercise_id, variant_kind, asset_snapshot, message, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'standard', '[]', 'Lifecycle test', 'TODO', ?, ?)`, args: ["report-space-5", String(references.portfolio_id), String(references.section_id), String(references.exercise_id), "2026-08-14T10:00:00.000Z", "2026-08-14T10:00:00.000Z"] });
    await database.execute({ sql: "INSERT INTO sync_warnings (id, sync_run_id, severity, relative_path, message) VALUES (?, ?, 'warning', 'test', 'Lifecycle test')", args: ["warning-space-5", syncRunId] });
    const retainedPortfolioIds = (await getAdminPortfolios("space-6")).map((portfolio) => portfolio.id);

    expect(await archiveLearningSpace("space-5")).toBe(true);
    expect(await permanentlyDeleteLearningSpace("space-5")).toBe(true);
    expect(await getLearningSpace("space-5")).toBeNull();
    expect(await getAdminLearningSpaceBySlug("5")).toBeNull();
    expect((await getLearningSpaces()).some((space) => space.id === "space-5")).toBe(false);
    expect(await getAdminPortfolios("space-5")).toEqual([]);
    expect(await getThemes("space-5")).toEqual([]);
    expect((await database.execute("SELECT id FROM sync_runs WHERE learning_space_id = 'space-5'")).rows).toEqual([]);
    expect((await database.execute("SELECT learning_space_id FROM sync_leases WHERE learning_space_id = 'space-5'")).rows).toEqual([]);
    expect((await database.execute("SELECT id FROM learning_space_sources WHERE learning_space_id = 'space-5'")).rows).toEqual([]);
    expect((await database.execute("SELECT id FROM error_reports WHERE id = 'report-space-5'")).rows).toEqual([]);
    expect((await database.execute("SELECT id FROM sync_warnings WHERE id = 'warning-space-5'")).rows).toEqual([]);
    expect((await database.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
    expect((await getAdminPortfolios("space-6")).map((portfolio) => portfolio.id)).toEqual(retainedPortfolioIds);
    expect(await getThemes("space-6")).toEqual([expect.objectContaining({ name: "Te behouden thema" })]);
    expect(source.has("Portfolio 3 - Toepassingen van integralen/Uitwerkingen/1 - Integralen/PF3-Oef2(1).png")).toBe(true);
  });

  it("normalizes missing and inaccessible local source paths without changing existing indexed state", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-source-error-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    await persistIndex(await indexSource(createTwoPortfolioProvider()), "local", "space-6");
    await updateLearningSpace("space-5", { name: "5de jaar", slug: "5", shortLabel: "5", sortOrder: 50, sourceType: "local", localSourcePath: null });
    await expect(synchronizeSource("space-5")).rejects.toBeInstanceOf(SourceConfigurationError);
    await updateLearningSpace("space-5", { name: "5de jaar", slug: "5", shortLabel: "5", sortOrder: 50, sourceType: "local", localSourcePath: path.join(temporaryDirectory, "does-not-exist") });
    await expect(synchronizeSource("space-5")).rejects.toBeInstanceOf(SourceAccessError);
    expect((await getAdminPortfolios("space-6")).some((portfolio) => portfolio.code === "3")).toBe(true);
  });

  it("keeps the last valid index when a Google Drive scan fails before persistence", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-google-source-error-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    await persistIndex(await indexSource(createTwoPortfolioProvider()), "local", "space-6");
    const space = (await getLearningSpace("space-6"))!;
    let indexStarted = false;
    const inaccessibleProvider = {
      id: "google-drive",
      async assertReadyForIndex() { throw new SourceAccessError("De Google Drive-mirror is momenteel niet volledig. De laatst geldige index blijft actief."); },
      async list() { indexStarted = true; return []; },
      async readFile() { return Buffer.from(""); },
    } satisfies StorageProvider;
    await expect(synchronizeSource("space-6", {
      getConfiguredProvider: async () => ({ provider: inaccessibleProvider, type: "google_drive", space: { ...space, sourceType: "google_drive", googleDriveFolderId: "root-id" } }),
    })).rejects.toThrow("laatst geldige index blijft actief");
    expect(indexStarted).toBe(false);
    expect((await getAdminPortfolios("space-6")).filter((portfolio) => portfolio.isIndexed)).toHaveLength(2);
  });

  it("allows synchronization after a successful Google mirror guard", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-google-marker-valid-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    await getDatabase();
    const space = (await getLearningSpace("space-6"))!;
    const source = createTwoPortfolioProvider();
    let markerChecks = 0;
    const provider = { ...source, async assertReadyForIndex() { markerChecks += 1; } } satisfies StorageProvider;

    await expect(synchronizeSource("space-6", {
      getConfiguredProvider: async () => ({ provider, type: "google_drive", space: { ...space, sourceType: "google_drive", googleDriveFolderId: "root-id" } }),
    })).resolves.toMatchObject({ portfolios: 2, skipped: false });
    expect(markerChecks).toBe(1);
  });

  it.each(["local", "onedrive"] as const)("does not require a mirror marker for %s synchronization", async (sourceType) => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), `portfolio-${sourceType}-marker-free-`));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    await getDatabase();
    const space = (await getLearningSpace("space-6"))!;

    await expect(synchronizeSource("space-6", {
      getConfiguredProvider: async () => ({ provider: createTwoPortfolioProvider(), type: sourceType, space: { ...space, sourceType } }),
    })).resolves.toMatchObject({ portfolios: 2, skipped: false });
  });

  it("keeps a valid source and existing index intact when persistence fails internally", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-sync-persist-failure-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    const source = (await getActiveLearningSpaceSource("space-6"))!;
    const provider = createTwoPortfolioProvider();
    await persistIndex(await indexSource(provider), "local", "space-6", { sourceId: source.id });
    const database = await getDatabase();
    const before = await database.execute("SELECT id, source_id, is_indexed FROM solution_assets ORDER BY id");
    await database.execute(`CREATE TRIGGER fail_running_sync BEFORE INSERT ON sync_runs
      WHEN NEW.status = 'running' BEGIN SELECT RAISE(ABORT, 'forced internal persistence failure'); END`);

    await expect(synchronizeSource("space-6", {
      getConfiguredProvider: async () => ({ provider, type: "local", space: (await getLearningSpace("space-6"))!, source }),
    })).rejects.toThrow("forced internal persistence failure");
    expect((await getActiveLearningSpaceSource("space-6"))?.lastValidationStatus).toBe("valid");
    expect((await database.execute("SELECT id, source_id, is_indexed FROM solution_assets ORDER BY id")).rows).toEqual(before.rows);
  });

  it("marks a source invalid only for an explicit source configuration failure", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-sync-config-failure-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    const source = (await getActiveLearningSpaceSource("space-6"))!;
    const provider: StorageProvider = {
      id: "invalid-source",
      async assertReadyForIndex() { throw new SourceConfigurationError("Bronconfiguratie is ongeldig."); },
      async list() { return []; },
      async readFile() { return Buffer.from(""); },
    };
    await expect(synchronizeSource("space-6", {
      getConfiguredProvider: async () => ({ provider, type: "local", space: (await getLearningSpace("space-6"))!, source }),
    })).rejects.toBeInstanceOf(SourceConfigurationError);
    expect((await getActiveLearningSpaceSource("space-6"))?.lastValidationStatus).toBe("invalid");
  });
});

function createTwoPortfolioProvider() {
  const versions = new Map<string, string>();
  const sourceIds = new Map<string, string>();
  const file = (relativePath: string): StorageEntry => ({ name: relativePath.split("/").at(-1)!, relativePath, sourceId: sourceIds.get(relativePath) ?? relativePath, kind: "file", sourceVersion: versions.get(relativePath) ?? "v1", lastModifiedAt: "2026-08-11T10:00:00.000Z" });
  const directory = (relativePath: string): StorageEntry => ({ name: relativePath.split("/").at(-1)!, relativePath, sourceId: relativePath, kind: "directory" });
  const p3 = "Portfolio 3 - Toepassingen van integralen";
  const p4 = "Portfolio 4 - De bepaalde integraal";
  const tree: Record<string, StorageEntry[]> = {
    "": [directory(p3), directory(p4)],
    [p3]: [file(`${p3}/Portfolio 3 - Toepassingen van integralen.pdf`), file(`${p3}/Eindoplossingen portfolio 3.pdf`), directory(`${p3}/Uitwerkingen`)],
    [`${p3}/Uitwerkingen`]: [directory(`${p3}/Uitwerkingen/1 - Integralen`)],
    [`${p3}/Uitwerkingen/1 - Integralen`]: [file(`${p3}/Uitwerkingen/1 - Integralen/PF3-Oef2(1).png`), file(`${p3}/Uitwerkingen/1 - Integralen/PF3-Oef2(2).png`), file(`${p3}/Uitwerkingen/1 - Integralen/PF3-Oef2-alt(1).png`)],
    [p4]: [file(`${p4}/Portfolio 4 - De bepaalde integraal.pdf`), file(`${p4}/Eindoplossingen portfolio 4.pdf`), directory(`${p4}/Uitwerkingen`)],
    [`${p4}/Uitwerkingen`]: [file(`${p4}/Uitwerkingen/Uitgewerkte oefeningen - versie 2324.docx`), directory(`${p4}/Uitwerkingen/1 - Bepaalde integraal`)],
    [`${p4}/Uitwerkingen/1 - Bepaalde integraal`]: [file(`${p4}/Uitwerkingen/1 - Bepaalde integraal/PF4-Oef1.png`), file(`${p4}/Uitwerkingen/1 - Bepaalde integraal/PF4-Oef1-alt.png`)],
  };
  return {
    id: "fixture",
    async list(relativePath = "") {
      return (tree[relativePath] ?? []).map((entry) => entry.kind === "file"
        ? { ...entry, sourceId: sourceIds.get(entry.relativePath) ?? entry.relativePath, sourceVersion: versions.get(entry.relativePath) ?? "v1" }
        : entry);
    },
    async readFile() { return Buffer.from(""); },
    setVersion(relativePath: string, version: string) { versions.set(relativePath, version); },
    setSourceId(relativePath: string, sourceId: string) { sourceIds.set(relativePath, sourceId); },
    add(relativePath: string) { const parent = relativePath.split("/").slice(0, -1).join("/"); if (!tree[parent]?.some((entry) => entry.relativePath === relativePath)) tree[parent]?.push(file(relativePath)); },
    remove(relativePath: string) { for (const entries of Object.values(tree)) { const index = entries.findIndex((entry) => entry.relativePath === relativePath); if (index >= 0) entries.splice(index, 1); } },
    has(relativePath: string) { return Object.values(tree).flat().some((entry) => entry.relativePath === relativePath); },
  } satisfies StorageProvider & { setVersion(relativePath: string, version: string): void; setSourceId(relativePath: string, sourceId: string): void; add(relativePath: string): void; remove(relativePath: string): void; has(relativePath: string): boolean };
}

function createSingleAssetProvider(fileName: string) {
  return createPortfolioProvider("8", fileName);
}

function createPortfolioProvider(code: string, fileName: string) {
  const portfolio = `Portfolio ${code} - Test`;
  const section = `${portfolio}/Uitwerkingen/1 - Test`;
  const file = (): StorageEntry => ({ name: fileName, relativePath: `${section}/${fileName}`, sourceId: `${section}/${fileName}`, kind: "file", sourceVersion: "v1", lastModifiedAt: "2026-08-12T10:00:00.000Z" });
  return {
    id: "single-asset-fixture",
    async list(relativePath = "") {
      if (relativePath === "") return [{ name: portfolio, relativePath: portfolio, kind: "directory" as const }];
      if (relativePath === portfolio) return [{ name: `Portfolio ${code} - Test.pdf`, relativePath: `${portfolio}/Portfolio ${code} - Test.pdf`, kind: "file" as const }, { name: `Eindoplossingen portfolio ${code}.pdf`, relativePath: `${portfolio}/Eindoplossingen portfolio ${code}.pdf`, kind: "file" as const }, { name: "Uitwerkingen", relativePath: `${portfolio}/Uitwerkingen`, kind: "directory" as const }];
      if (relativePath === `${portfolio}/Uitwerkingen`) return [{ name: "1 - Test", relativePath: section, kind: "directory" as const }];
      if (relativePath === section) return [file()];
      return [];
    },
    async readFile() { return Buffer.from(""); },
  } satisfies StorageProvider;
}
