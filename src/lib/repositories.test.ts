import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import type { IndexedPortfolio } from "./domain";
import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG } from "./source-profile-config";
import { adminExercisePortfolioHref } from "./admin-routes";
import { archiveLearningSpace, archiveMissingIndexItems, createErrorReport, createLearningSpace, createTheme, getActiveLearningSpaceSource, getActiveWarningCounts, getAdminErrorReports, getAdminExercise, getAdminLearningSpaceBySlug, getAdminPortfolio, getAdminPortfolioDocument, getAdminPortfolios, getLatestWarnings, getLearningSpace, getLearningSpaceBySlug, getLearningSpaces, getMissingIndexCounts, getPublicAsset, getPublicPortfolioDocument, getPublicResourceAsset, getAdminResourceAsset, getStudentPortfolios, getThemes, getVisibleExercise, hasValidLearningSpaceIndex, permanentlyDeleteLearningSpace, persistIndex, recordFailedSync, releaseSyncLease, restoreLearningSpace, setExerciseAlternativeVisibility, setExerciseNote, setExercisePublication, setLearningSpaceEditorsCanManageAccess, setPortfolioCardColor, setPortfolioExternalLinks, setPortfolioPublication, setPortfolioTheme, tryAcquireSyncLease, updateLearningSpace } from "./repositories";
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
  it("treats a section code change as a new section without guessing section metadata", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-section-code-identity-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();

    const originalIndex = exerciseMoveFixture(1, "basis", "section-code-old");
    await persistIndex([originalIndex], "local", "space-6");
    const database = await getDatabase();
    const originalSection = (await database.execute("SELECT id, portfolio_id FROM sections WHERE section_code = '1'")).rows[0];
    const originalSectionId = String(originalSection.id);
    expect(originalSectionId).toBe(`${String(originalSection.portfolio_id)}-section-1`);
    await database.execute({
      sql: "UPDATE sections SET visibility_mode = 'hidden', publication_limited = 1 WHERE id = ?",
      args: [originalSectionId],
    });

    const hierarchicalIndex = exerciseMoveFixture(1, "basis", "section-code-new");
    hierarchicalIndex.sections[0].code = "1.1";
    hierarchicalIndex.sections[0].relativePath = "H1B_Stelsels/1.1 Nieuwe sectie";
    await persistIndex([hierarchicalIndex], "local", "space-6");

    const sections = (await database.execute("SELECT id, section_code, sort_order, visibility_mode, publication_limited, is_indexed FROM sections ORDER BY section_code")).rows;
    expect(sections).toEqual([
      expect.objectContaining({ id: originalSectionId, section_code: "1", sort_order: 1, visibility_mode: "hidden", publication_limited: 1, is_indexed: 0 }),
      expect.objectContaining({ section_code: "1.1", sort_order: 1, visibility_mode: "visible", publication_limited: 0, is_indexed: 1 }),
    ]);
    expect(String(sections[1].id)).not.toBe(originalSectionId);
    expect(String(sections[1].id)).toBe(`${String(originalSection.portfolio_id)}-section-1.1`);
    expect((await database.execute("SELECT section_id, is_indexed FROM exercises WHERE exercise_code = '20a' AND archived_at IS NULL")).rows)
      .toEqual([expect.objectContaining({ section_id: sections[1].id, is_indexed: 1 })]);
    const adminSection = (await getAdminPortfolios("space-6"))[0].sections.find((section) => section.id === sections[1].id);
    expect(adminSection).toMatchObject({ id: sections[1].id, code: "1.1" });
    expect(adminSection).not.toHaveProperty("order");

    await setPortfolioPublication(String(originalSection.portfolio_id), "visible", false, null, null);
    const studentSection = (await getStudentPortfolios("space-6"))[0].sections.find((section) => section.id === sections[1].id);
    expect(studentSection).toMatchObject({ id: sections[1].id, code: "1.1" });
    expect(studentSection).not.toHaveProperty("order");
  });

  it("preserves exercise identity, teacher metadata and error-report links across a section move", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-exercise-move-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();

    await persistIndex([exerciseMoveFixture(1, "basis", "move-source-old")], "local", "space-6");
    const database = await getDatabase();
    const original = (await database.execute("SELECT id, portfolio_id FROM exercises WHERE exercise_code = '20a' AND archived_at IS NULL")).rows[0];
    const exerciseId = String(original.id);
    await database.execute({ sql: "UPDATE portfolios SET visible = 1 WHERE id = ?", args: [String(original.portfolio_id)] });
    const report = await createErrorReport({ exerciseId, variant: "standard", message: "Historische koppeling", rateLimitKey: "exercise-move" });
    await database.execute({
      sql: `UPDATE exercises SET custom_note = 'Bewaren', note_label = 'Aandacht', note_position = 'below_solution',
        visibility_mode = 'hidden', visible = 0, publish_from = '2026-10-01T08:00:00.000Z', publish_until = '2026-12-01T08:00:00.000Z',
        show_alternative_to_students = 0, level_override_mode = 'level', level_override = 'verdieping' WHERE id = ?`,
      args: [exerciseId],
    });

    await expect(persistIndex([exerciseMoveFixture(2, "uitdaging", "move-source-new")], "local", "space-6"))
      .resolves.toMatchObject({ added: 0, missing: 0 });

    const moved = (await database.execute({ sql: "SELECT * FROM exercises WHERE id = ?", args: [exerciseId] })).rows[0];
    expect(moved).toMatchObject({
      id: exerciseId,
      exercise_code: "20a",
      is_indexed: 1,
      archived_at: null,
      custom_note: "Bewaren",
      note_label: "Aandacht",
      note_position: "below_solution",
      visibility_mode: "hidden",
      visible: 0,
      publish_from: "2026-10-01T08:00:00.000Z",
      publish_until: "2026-12-01T08:00:00.000Z",
      show_alternative_to_students: 0,
      level_override_mode: "level",
      level_override: "verdieping",
      level_source: "uitdaging",
    });
    expect(String(moved.section_id)).toContain("-section-2");
    expect((await database.execute("SELECT id FROM exercises WHERE exercise_code = '20a' AND archived_at IS NULL")).rows).toHaveLength(1);
    expect((await database.execute({ sql: "SELECT exercise_id FROM error_report_threads WHERE id IN (SELECT thread_id FROM error_report_issues WHERE id = ?)", args: [report.issueId] })).rows[0].exercise_id).toBe(exerciseId);
    expect((await database.execute({ sql: "SELECT exercise_id FROM error_report_issues WHERE id = ?", args: [report.issueId] })).rows[0].exercise_id).toBe(exerciseId);
    expect((await database.execute({ sql: "SELECT exercise_id, section_id FROM error_reports WHERE issue_id = ?", args: [report.issueId] })).rows[0]).toMatchObject({
      exercise_id: exerciseId,
      section_id: moved.section_id,
    });
    expect((await getLatestWarnings("space-6")).some((warning) => /ontbreekt|onvolledig/i.test(warning.message))).toBe(false);
  }, 15_000);

  it("heals an existing old-missing and new-active split while retaining the original exercise and asset ids", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-exercise-split-heal-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();

    await persistIndex([exerciseMoveFixture(1, "basis", "split-source-old")], "local", "space-6");
    const database = await getDatabase();
    const original = (await database.execute("SELECT * FROM exercises WHERE exercise_code = '20a' AND archived_at IS NULL")).rows[0];
    const originalId = String(original.id);
    const portfolioId = String(original.portfolio_id);
    const targetSectionId = `${portfolioId}-section-2`;
    const duplicateId = `${targetSectionId}-exercise-20a`;
    const originalAsset = (await database.execute({
      sql: `SELECT solution_assets.* FROM solution_assets
        JOIN solution_variants ON solution_variants.id = solution_assets.variant_id WHERE solution_variants.exercise_id = ?`,
      args: [originalId],
    })).rows[0];
    const originalResource = (await database.execute({
      sql: "SELECT * FROM source_resource_assets WHERE exercise_id = ? AND resource_scope = 'exercise'",
      args: [originalId],
    })).rows[0];
    await database.batch([
      { sql: `INSERT INTO sections (id, portfolio_id, section_code, sort_order, title, relative_path, visibility_mode, is_indexed, last_seen_at)
        VALUES (?, ?, '2', 2, 'Nieuwe sectie', 'H1B_Stelsels/2 Nieuwe sectie', 'visible', 1, ?)`, args: [targetSectionId, portfolioId, "2026-10-04T10:00:00.000Z"] },
      { sql: `INSERT INTO exercises (id, portfolio_id, section_id, exercise_code, exercise_number, exercise_suffix, level_source,
        visibility_mode, visible, is_indexed, last_seen_at) VALUES (?, ?, ?, '20a', 20, 'a', 'uitdaging', 'visible', 1, 1, ?)`,
      args: [duplicateId, portfolioId, targetSectionId, "2026-10-04T10:00:00.000Z"] },
      { sql: "INSERT INTO solution_variants (id, exercise_id, kind, label, is_indexed) VALUES (?, ?, 'standard', 'Standaard', 1)", args: [`${duplicateId}-standard`, duplicateId] },
      { sql: `INSERT INTO solution_assets (id, variant_id, relative_path, source_id, file_name, extension, step, last_modified_at,
        source_version, is_indexed, missing_since) VALUES (?, ?, ?, ?, 'PF1B-Oef20a.png', 'png', 1, ?, 'v2', 1, NULL)`,
      args: ["split-new-asset", `${duplicateId}-standard`, "H1B_Stelsels/2 Nieuwe sectie/PF1B-Oef20a.png", "split-source-new", "2026-10-04T10:00:00.000Z"] },
      { sql: "UPDATE exercises SET custom_note = 'Historische notitie', note_label = 'Bewaren', note_position = 'below_solution', level_override_mode = 'none', level_override = NULL, is_indexed = 0 WHERE id = ?", args: [originalId] },
      { sql: "UPDATE solution_variants SET is_indexed = 0 WHERE exercise_id = ?", args: [originalId] },
      { sql: "UPDATE solution_assets SET is_indexed = 0, missing_since = ? WHERE id = ?", args: ["2026-10-04T09:00:00.000Z", String(originalAsset.id)] },
      { sql: `UPDATE source_resource_assets SET exercise_id = ?, source_id = 'split-source-new', relative_path = ?,
        is_indexed = 1, missing_since = NULL WHERE id = ?`,
      args: [duplicateId, "H1B_Stelsels/2 Nieuwe sectie/PF1B-Oef20a.png", String(originalResource.id)] },
    ]);

    await expect(persistIndex([exerciseMoveFixture(2, "uitdaging", "split-source-new")], "local", "space-6"))
      .resolves.toMatchObject({ added: 0, missing: 0 });

    const active = await database.execute("SELECT * FROM exercises WHERE exercise_code = '20a' AND archived_at IS NULL");
    expect(active.rows).toHaveLength(1);
    expect(active.rows[0]).toMatchObject({ id: originalId, custom_note: "Historische notitie", note_label: "Bewaren", note_position: "below_solution", level_override_mode: "none", is_indexed: 1 });
    expect(String(active.rows[0].section_id)).toBe(targetSectionId);
    expect((await database.execute({ sql: "SELECT archived_at, is_indexed FROM exercises WHERE id = ?", args: [duplicateId] })).rows[0]).toMatchObject({ is_indexed: 0, archived_at: expect.any(String) });
    expect((await database.execute("SELECT solution_assets.id, solution_variants.exercise_id, solution_assets.is_indexed, solution_assets.missing_since FROM solution_assets JOIN solution_variants ON solution_variants.id = solution_assets.variant_id")).rows).toEqual([
      expect.objectContaining({ id: String(originalAsset.id), exercise_id: originalId, is_indexed: 1, missing_since: null }),
    ]);
    expect((await database.execute("SELECT exercise_id, is_indexed, missing_since FROM source_resource_assets WHERE resource_scope = 'exercise'")).rows).toEqual([
      expect.objectContaining({ exercise_id: originalId, is_indexed: 1, missing_since: null }),
    ]);
    const adminMatches = (await getAdminPortfolios("space-6")).flatMap((portfolio) => portfolio.sections)
      .flatMap((section) => section.exercises).filter((exercise) => exercise.code === "20a");
    expect(adminMatches).toEqual([expect.objectContaining({ id: originalId, isIndexed: true, missingAssets: 0 })]);
    expect(Number((await database.execute({ sql: "SELECT COUNT(*) AS count FROM exercises WHERE portfolio_id = ? AND is_indexed = 0 AND archived_at IS NULL", args: [portfolioId] })).rows[0].count)).toBe(0);
    expect((await getLatestWarnings("space-6")).some((warning) => /ontbreekt|onvolledig/i.test(warning.message))).toBe(false);
  });

  it("does not guess when the same exercise code has multiple cross-section candidates", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-exercise-move-ambiguous-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();

    const first = exerciseMoveFixture(1, "basis", "ambiguous-one");
    const secondSection = exerciseMoveFixture(2, "basis", "ambiguous-two").sections[0];
    first.sections.push(secondSection);
    await persistIndex([first], "local", "space-6");
    const database = await getDatabase();
    const originalIds = (await database.execute("SELECT id FROM exercises WHERE exercise_code = '20a' ORDER BY id")).rows.map((row) => String(row.id));

    await persistIndex([exerciseMoveFixture(3, "uitdaging", "ambiguous-new")], "local", "space-6");

    const rows = await database.execute("SELECT id, is_indexed FROM exercises WHERE exercise_code = '20a' ORDER BY id");
    expect(rows.rows.filter((row) => Number(row.is_indexed) === 1)).toHaveLength(1);
    expect(originalIds).not.toContain(String(rows.rows.find((row) => Number(row.is_indexed) === 1)?.id));
    expect((await getLatestWarnings("space-6")).some((warning) => warning.message.includes("niet automatisch verplaatst"))).toBe(true);
  });

  it("does not transfer exercise metadata by source content when the exercise code changes", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-exercise-identity-code-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();

    const original = exerciseMoveFixture(1, "basis", "same-physical-source");
    await persistIndex([original], "local", "space-6");
    const database = await getDatabase();
    const originalId = String((await database.execute("SELECT id FROM exercises WHERE exercise_code = '20a'")).rows[0].id);
    await database.execute({ sql: "UPDATE exercises SET custom_note = 'Niet raden' WHERE id = ?", args: [originalId] });

    const renumbered = exerciseMoveFixture(1, "basis", "same-physical-source");
    const exercise = renumbered.sections[0].exercises[0];
    exercise.code = "21a";
    exercise.number = 21;
    exercise.assets[0].parsed = {
      ...exercise.assets[0].parsed,
      exerciseNumber: 21,
      exerciseCode: "21a",
    };
    await persistIndex([renumbered], "local", "space-6");

    const current = (await database.execute("SELECT id, exercise_code, custom_note, is_indexed FROM exercises ORDER BY exercise_code")).rows;
    expect(current.find((row) => row.exercise_code === "20a")).toMatchObject({ id: originalId, custom_note: "Niet raden", is_indexed: 0 });
    expect(current.find((row) => row.exercise_code === "21a")).toMatchObject({ custom_note: null, is_indexed: 1 });
    expect(String(current.find((row) => row.exercise_code === "21a")?.id)).not.toBe(originalId);
  });

  it("reconciles equivalent portfolio and section renames by logical identity while real deletion remains missing", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-rename-reconciliation-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();

    await persistIndex([renameReconciliationFixture({
      portfolioPath: "H1B_Stelsels oplossen",
      sectionPath: "H1B_Stelsels oplossen/2 Stelsels oplossen met Gauss-Jordan",
      fileName: "PF1B-Oef15-B.png",
      sourceId: "old-file-source",
      levelSource: "basis",
    })], "local", "space-6");
    const database = await getDatabase();
    const original = (await database.execute(`SELECT portfolios.id AS portfolio_id, sections.id AS section_id, exercises.id AS exercise_id,
      solution_assets.id AS asset_id FROM portfolios JOIN sections ON sections.portfolio_id = portfolios.id
      JOIN exercises ON exercises.section_id = sections.id JOIN solution_variants ON solution_variants.exercise_id = exercises.id
      JOIN solution_assets ON solution_assets.variant_id = solution_variants.id WHERE portfolios.learning_space_id = 'space-6'`)).rows[0];
    const portfolioId = String(original.portfolio_id);
    const sectionId = String(original.section_id);
    const exerciseId = String(original.exercise_id);
    const assetId = String(original.asset_id);
    const originalResourceAssetIds = (await database.execute("SELECT id FROM source_resource_assets ORDER BY id")).rows.map((row) => String(row.id));
    await database.batch([
      { sql: "UPDATE portfolios SET title_override = 'Eigen titel' WHERE id = ?", args: [portfolioId] },
      { sql: "UPDATE exercises SET custom_note = 'Bewaren' WHERE id = ?", args: [exerciseId] },
    ]);

    const renamed = await persistIndex([renameReconciliationFixture({
      portfolioPath: "H1B - Stelsels oplossen",
      sectionPath: "H1B - Stelsels oplossen/2_Stelsels oplossen met Gauss-Jordan",
      fileName: "PF1B-Oef15-U.png",
      sourceId: "renamed-file-source",
      levelSource: "uitdaging",
    })], "local", "space-6");

    expect(renamed).toMatchObject({ added: 0, missing: 0 });
    expect((await database.execute("SELECT id, relative_path, title_override FROM portfolios WHERE learning_space_id = 'space-6'")).rows).toEqual([
      expect.objectContaining({ id: portfolioId, relative_path: "H1B - Stelsels oplossen", title_override: "Eigen titel" }),
    ]);
    expect((await database.execute({ sql: "SELECT id, relative_path FROM sections WHERE portfolio_id = ?", args: [portfolioId] })).rows).toEqual([
      expect.objectContaining({ id: sectionId, relative_path: "H1B - Stelsels oplossen/2_Stelsels oplossen met Gauss-Jordan" }),
    ]);
    expect((await database.execute({ sql: "SELECT id, level_source, custom_note FROM exercises WHERE id = ?", args: [exerciseId] })).rows[0]).toMatchObject({
      id: exerciseId, level_source: "uitdaging", custom_note: "Bewaren",
    });
    expect((await database.execute("SELECT id, relative_path, source_id, is_indexed, missing_since FROM solution_assets")).rows).toEqual([
      expect.objectContaining({ id: assetId, relative_path: "H1B - Stelsels oplossen/2_Stelsels oplossen met Gauss-Jordan/PF1B-Oef15-U.png", source_id: "renamed-file-source", is_indexed: 1, missing_since: null }),
    ]);
    const reconciledResourceAssets = await database.execute("SELECT id, relative_path, is_indexed, missing_since FROM source_resource_assets ORDER BY id");
    expect(reconciledResourceAssets.rows.map((row) => String(row.id))).toEqual(originalResourceAssetIds);
    expect(reconciledResourceAssets.rows).toHaveLength(2);
    expect(reconciledResourceAssets.rows.every((row) => Number(row.is_indexed) === 1 && row.missing_since === null)).toBe(true);
    expect((await getLatestWarnings("space-6")).some((warning) => /ontbreekt|onvolledig/i.test(warning.message))).toBe(false);

    const deleted = await persistIndex([renameReconciliationFixture({
      portfolioPath: "H1B - Stelsels oplossen",
      sectionPath: "H1B - Stelsels oplossen/2. Stelsels oplossen met Gauss-Jordan",
      fileName: null,
      sourceId: null,
      levelSource: "uitdaging",
    })], "local", "space-6");
    expect(deleted.missing).toBe(1);
    expect((await getLatestWarnings("space-6")).some((warning) => /ontbreekt/i.test(warning.message))).toBe(true);
  });

  it("reconciles a rename when an archived resource row already occupies the returning source identity", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-rename-unique-key-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();

    await persistIndex([renameReconciliationFixture({
      portfolioPath: "H1B - Stelsels",
      sectionPath: "H1B - Stelsels/2_Stelsels",
      fileName: "PF1B-Oef15-U.png",
      sourceId: "current-source",
      levelSource: "uitdaging",
    })], "local", "space-6");
    const database = await getDatabase();
    const current = (await database.execute("SELECT * FROM source_resource_assets WHERE resource_scope = 'exercise' AND resource_id = 'worked-solution'")).rows[0];
    await database.execute({
      sql: `INSERT INTO source_resource_assets (id, learning_space_id, portfolio_id, exercise_id, resource_scope, resource_id,
        semantic_role, source_id, relative_path, file_name, extension, step, last_modified_at, source_version, is_indexed,
        missing_since, archived_at, last_seen_at) VALUES (?, ?, ?, ?, 'exercise', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      args: ["archived-returning-resource", String(current.learning_space_id), String(current.portfolio_id), String(current.exercise_id),
        String(current.resource_id), String(current.semantic_role), "returning-source", "H1B_Stelsels/2 Stelsels/PF1B-Oef15-B.png",
        "PF1B-Oef15-B.png", String(current.extension), Number(current.step), current.last_modified_at == null ? null : String(current.last_modified_at), current.source_version == null ? null : String(current.source_version),
        "2026-10-02T10:00:00.000Z", "2026-10-02T10:05:00.000Z", "2026-10-02T10:00:00.000Z"],
    });

    await expect(persistIndex([renameReconciliationFixture({
      portfolioPath: "H1B_Stelsels",
      sectionPath: "H1B_Stelsels/2 Stelsels",
      fileName: "PF1B-Oef15-B.png",
      sourceId: "returning-source",
      levelSource: "basis",
    })], "local", "space-6")).resolves.toMatchObject({ added: 0, missing: 0 });

    const rows = await database.execute("SELECT id, source_id, relative_path, is_indexed, archived_at FROM source_resource_assets WHERE resource_scope = 'exercise' AND resource_id = 'worked-solution'");
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({ source_id: "returning-source", relative_path: "H1B_Stelsels/2 Stelsels/PF1B-Oef15-B.png", is_indexed: 1, archived_at: null });
    expect((await getLatestWarnings("space-6")).some((warning) => /ontbreekt|onvolledig/i.test(warning.message))).toBe(false);
  });

  it("reconciles a renamed solution when an archived solution asset occupies the returning path", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-solution-rename-unique-key-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();

    await persistIndex([renameReconciliationFixture({
      portfolioPath: "H1B - Stelsels",
      sectionPath: "H1B - Stelsels/2_Stelsels",
      fileName: "PF1B-Oef15-U.png",
      sourceId: "current-source",
      levelSource: "uitdaging",
    })], "local", "space-6");
    const database = await getDatabase();
    const current = (await database.execute("SELECT * FROM solution_assets")).rows[0];
    await database.execute({
      sql: `INSERT INTO solution_assets (id, variant_id, relative_path, source_id, file_name, extension, step,
        last_modified_at, source_version, is_indexed, missing_since, archived_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      args: ["archived-returning-solution", String(current.variant_id), "H1B_Stelsels/2 Stelsels/PF1B-Oef15-B.png",
        "returning-source", "PF1B-Oef15-B.png", String(current.extension), Number(current.step),
        current.last_modified_at == null ? null : String(current.last_modified_at), current.source_version == null ? null : String(current.source_version),
        "2026-10-02T10:00:00.000Z", "2026-10-02T10:05:00.000Z"],
    });

    await expect(persistIndex([renameReconciliationFixture({
      portfolioPath: "H1B_Stelsels",
      sectionPath: "H1B_Stelsels/2 Stelsels",
      fileName: "PF1B-Oef15-B.png",
      sourceId: "returning-source",
      levelSource: "basis",
    })], "local", "space-6")).resolves.toMatchObject({ added: 0, missing: 0 });

    const rows = await database.execute("SELECT id, variant_id, source_id, relative_path, is_indexed, missing_since, archived_at FROM solution_assets");
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({
      id: String(current.id),
      variant_id: String(current.variant_id),
      source_id: "returning-source",
      relative_path: "H1B_Stelsels/2 Stelsels/PF1B-Oef15-B.png",
      is_indexed: 1,
      missing_since: null,
      archived_at: null,
    });
    expect((await getLatestWarnings("space-6")).some((warning) => /ontbreekt|onvolledig/i.test(warning.message))).toBe(false);
  });

  it("preserves standard and alternative variant assets and multi-step ordering across a section rename", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-solution-variant-rename-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();

    const original = renameReconciliationFixture({
      portfolioPath: "H1B_Stelsels",
      sectionPath: "H1B_Stelsels/2 Stelsels",
      fileName: "PF1B-Oef15-B(1).png",
      sourceId: "standard-step-1-old",
      levelSource: "basis",
    });
    addLegacySolutionAsset(original, "standard", 2, "PF1B-Oef15-B(2).png", "standard-step-2-old");
    addLegacySolutionAsset(original, "alternative", 1, "PF1B-Oef15-B-Alt.png", "alternative-step-1-old");
    await persistIndex([original], "local", "space-6");
    const database = await getDatabase();
    const before = (await database.execute(`SELECT solution_assets.id, solution_assets.step, solution_variants.id AS variant_id, solution_variants.kind
      FROM solution_assets JOIN solution_variants ON solution_variants.id = solution_assets.variant_id
      ORDER BY solution_variants.kind, solution_assets.step`)).rows;

    const renamed = renameReconciliationFixture({
      portfolioPath: "H1B_Stelsels",
      sectionPath: "H1B_Stelsels/2_Stelsels",
      fileName: "PF1B-Oef15-U(1).png",
      sourceId: "standard-step-1-new",
      levelSource: "uitdaging",
    });
    addLegacySolutionAsset(renamed, "standard", 2, "PF1B-Oef15-U(2).png", "standard-step-2-new");
    addLegacySolutionAsset(renamed, "alternative", 1, "PF1B-Oef15-U-Alt.png", "alternative-step-1-new");
    await expect(persistIndex([renamed], "local", "space-6")).resolves.toMatchObject({ added: 0, missing: 0 });

    const after = (await database.execute(`SELECT solution_assets.id, solution_assets.step, solution_assets.relative_path,
        solution_assets.is_indexed, solution_variants.id AS variant_id, solution_variants.kind
      FROM solution_assets JOIN solution_variants ON solution_variants.id = solution_assets.variant_id
      ORDER BY solution_variants.kind, solution_assets.step`)).rows;
    expect(after).toHaveLength(3);
    expect(after.map((row) => [String(row.id), String(row.variant_id), String(row.kind), Number(row.step)]))
      .toEqual(before.map((row) => [String(row.id), String(row.variant_id), String(row.kind), Number(row.step)]));
    expect(after.every((row) => Number(row.is_indexed) === 1 && String(row.relative_path).includes("/2_Stelsels/"))).toBe(true);
    expect(Number((await database.execute(`SELECT COUNT(*) AS count FROM (
      SELECT variant_id, relative_path FROM solution_assets GROUP BY variant_id, relative_path HAVING COUNT(*) > 1
    )`)).rows[0].count)).toBe(0);
    expect(Number((await database.execute("SELECT COUNT(*) AS count FROM source_resource_assets WHERE resource_scope = 'exercise' AND is_indexed = 1")).rows[0].count)).toBe(3);
    expect((await getLatestWarnings("space-6")).some((warning) => /ontbreekt|onvolledig/i.test(warning.message))).toBe(false);

    renamed.sections[0].exercises[0].assets = renamed.sections[0].exercises[0].assets
      .filter((asset) => asset.legacyVariant !== "standard" || asset.parsed.step !== 2);
    await expect(persistIndex([renamed], "local", "space-6")).resolves.toMatchObject({ missing: 1 });
    const partial = (await database.execute(`SELECT solution_assets.step, solution_assets.is_indexed, solution_variants.kind,
        solution_variants.is_indexed AS variant_is_indexed
      FROM solution_assets JOIN solution_variants ON solution_variants.id = solution_assets.variant_id
      ORDER BY solution_variants.kind, solution_assets.step`)).rows;
    expect(partial).toEqual([
      expect.objectContaining({ kind: "alternative", step: 1, is_indexed: 1, variant_is_indexed: 1 }),
      expect.objectContaining({ kind: "standard", step: 1, is_indexed: 1, variant_is_indexed: 1 }),
      expect.objectContaining({ kind: "standard", step: 2, is_indexed: 0, variant_is_indexed: 1 }),
    ]);
    expect((await getLatestWarnings("space-6")).filter((warning) => warning.message.includes("onvolledig"))).toHaveLength(1);
  });

  it("does not replace an unrelated archived solution asset that occupies a rename target", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-solution-rename-conflict-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();

    await persistIndex([renameReconciliationFixture({
      portfolioPath: "H1B - Stelsels",
      sectionPath: "H1B - Stelsels/2_Stelsels",
      fileName: "PF1B-Oef15-U.png",
      sourceId: "current-source",
      levelSource: "uitdaging",
    })], "local", "space-6");
    const database = await getDatabase();
    const current = (await database.execute("SELECT * FROM solution_assets")).rows[0];
    await database.execute({
      sql: `INSERT INTO solution_assets (id, variant_id, relative_path, source_id, file_name, extension, step,
        last_modified_at, source_version, is_indexed, missing_since, archived_at)
        VALUES (?, ?, ?, ?, ?, ?, 2, ?, ?, 0, ?, ?)`,
      args: ["archived-unrelated-solution", String(current.variant_id), "H1B_Stelsels/2 Stelsels/PF1B-Oef15-B.png",
        "unrelated-source", "PF1B-Oef15-B.png", String(current.extension), current.last_modified_at == null ? null : String(current.last_modified_at),
        current.source_version == null ? null : String(current.source_version), "2026-10-02T10:00:00.000Z", "2026-10-02T10:05:00.000Z"],
    });

    await expect(persistIndex([renameReconciliationFixture({
      portfolioPath: "H1B_Stelsels",
      sectionPath: "H1B_Stelsels/2 Stelsels",
      fileName: "PF1B-Oef15-B.png",
      sourceId: "returning-source",
      levelSource: "basis",
    })], "local", "space-6")).resolves.toMatchObject({ missing: 1 });

    const rows = await database.execute("SELECT id, step, source_id FROM solution_assets ORDER BY id");
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows).toContainEqual(expect.objectContaining({ id: "archived-unrelated-solution", step: 2, source_id: "unrelated-source" }));
    expect((await getLatestWarnings("space-6")).some((warning) => warning.message.includes("meerdere mogelijke historische bestanden"))).toBe(true);
  });

  it("keeps different resource identities separate while reconciling their renamed source metadata", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-rename-distinct-resources-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();

    const first = renameReconciliationFixture({
      portfolioPath: "H1B_Stelsels",
      sectionPath: "H1B_Stelsels/2 Stelsels",
      fileName: "PF1B-Oef15-B.png",
      sourceId: "shared-old-source",
      levelSource: "basis",
    });
    addDistinctExerciseResource(first, "hint", "hint", "shared-old-source", "PF1B-Oef15-B.png");
    await persistIndex([first], "local", "space-6");
    const database = await getDatabase();
    const before = (await database.execute("SELECT id, resource_id FROM source_resource_assets WHERE resource_scope = 'exercise' ORDER BY resource_id")).rows;

    const renamed = renameReconciliationFixture({
      portfolioPath: "H1B - Stelsels",
      sectionPath: "H1B - Stelsels/2_Stelsels",
      fileName: "PF1B-Oef15-U.png",
      sourceId: "shared-new-source",
      levelSource: "uitdaging",
    });
    addDistinctExerciseResource(renamed, "hint", "hint", "shared-new-source", "PF1B-Oef15-U.png");
    await expect(persistIndex([renamed], "local", "space-6")).resolves.toMatchObject({ missing: 0 });

    const after = (await database.execute("SELECT id, resource_id, source_id FROM source_resource_assets WHERE resource_scope = 'exercise' ORDER BY resource_id")).rows;
    expect(after).toHaveLength(2);
    expect(after.map((row) => [String(row.id), String(row.resource_id)])).toEqual(before.map((row) => [String(row.id), String(row.resource_id)]));
    expect(after.map((row) => String(row.source_id))).toEqual(["shared-new-source", "shared-new-source"]);
  });

  it("does not merge an ambiguous source identity that occurs for two logical exercises", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-rename-ambiguous-resource-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();

    const indexed = renameReconciliationFixture({
      portfolioPath: "H1B - Stelsels",
      sectionPath: "H1B - Stelsels/2 Stelsels",
      fileName: "gedeeld.png",
      sourceId: "ambiguous-source",
      levelSource: "basis",
    });
    const first = indexed.sections[0].exercises[0].assets[0];
    first.legacyVariant = null;
    indexed.sections[0].exercises.push({
      code: "16",
      number: 16,
      suffix: "",
      levelSource: "basis",
      assets: [{
        ...first,
        relativePath: `${indexed.sections[0].relativePath}/gedeeld-tweede.png`,
        parsed: { ...first.parsed, exerciseNumber: 16, exerciseCode: "16" },
      }],
    });

    await expect(persistIndex([indexed], "local", "space-6")).resolves.toMatchObject({ missing: 0 });
    const database = await getDatabase();
    expect(Number((await database.execute("SELECT COUNT(*) AS count FROM source_resource_assets WHERE resource_scope = 'exercise'")).rows[0].count)).toBe(0);
    expect((await getLatestWarnings("space-6")).filter((warning) => warning.message.includes("meerdere mogelijke onderdelen"))).toHaveLength(1);
  });

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

    source.setVersion("Portfolio 3 - Toepassingen van integralen/1 - Integralen/PF3-Oef2(1).png", "replacement-v2");
    source.setSourceId("Portfolio 3 - Toepassingen van integralen/1 - Integralen/PF3-Oef2(1).png", "google-replacement-id");
    await expect(persistIndex(await indexSource(source), "local")).resolves.toMatchObject({ updated: 1, missing: 0 });
    const updated = await database.execute({ sql: "SELECT source_id, source_version FROM solution_assets WHERE relative_path = ?", args: ["Portfolio 3 - Toepassingen van integralen/1 - Integralen/PF3-Oef2(1).png"] });
    expect(updated.rows[0].source_version).toBe("replacement-v2");
    expect(updated.rows[0].source_id).toBe("google-replacement-id");
    expect(Number((await database.execute("SELECT COUNT(*) AS count FROM solution_assets")).rows[0].count)).toBe(5);
  });

  it("persists an optional Hints-document and serves it from indexed metadata", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-hints-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    const base = createPortfolioProvider("1", "PF1-Oef1.png");
    const portfolioPath = "Portfolio 1 - Test";
    const hintsPath = `${portfolioPath}/Hints portfolio 1 - Test.png`;
    const hintsProvider: StorageProvider = {
      ...base,
      async list(relativePath = "") {
        const entries = await base.list(relativePath);
        return relativePath === portfolioPath
          ? [...entries, { name: "Hints portfolio 1 - Test.png", relativePath: hintsPath, sourceId: "hints-source-id", kind: "file" }]
          : entries;
      },
    };

    await persistIndex(await indexSource(hintsProvider), "local");
    expect((await getAdminPortfolios()).find((portfolio) => portfolio.id === "portfolio-1")?.hintsDocumentPath).toBe(hintsPath);
    await setPortfolioPublication("portfolio-1", "visible", false, null, null);
    expect((await getStudentPortfolios()).find((portfolio) => portfolio.id === "portfolio-1")?.hintsDocumentPath).toBe(hintsPath);
    expect(await getPublicPortfolioDocument("portfolio-1", "hints")).toMatchObject({
      sourceId: "hints-source-id",
      fileName: "Hints portfolio 1 - Test.png",
      extension: "png",
    });
    expect(await getAdminPortfolioDocument("portfolio-1", "hints")).toMatchObject({
      sourceId: "hints-source-id",
      fileName: "Hints portfolio 1 - Test.png",
      extension: "png",
    });
  });

  it("stores external resource URLs per portfolio, hides empty resources and preserves links across synchronization", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-external-links-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    const source = createTwoPortfolioProvider();
    await persistIndex(await indexSource(source), "local", "space-6");

    const database = await getDatabase();
    const activeProfileId = String((await database.execute("SELECT source_profile_id FROM learning_space_source_profiles WHERE learning_space_id = 'space-6'")).rows[0].source_profile_id);
    const configRow = (await database.execute({ sql: "SELECT config_json FROM source_profiles WHERE id = ?", args: [activeProfileId] })).rows[0];
    const config = JSON.parse(String(configRow.config_json));
    config.globalResources.push({ id: "video", kind: "external_link", label: "Instructievideo", icon: "monitor-play", order: 40, semanticRole: "generic" });
    await database.execute({ sql: "UPDATE source_profiles SET config_json = ?, updated_at = ? WHERE id = ?", args: [JSON.stringify(config), "2026-09-12T20:00:00.000Z", activeProfileId] });

    const portfolios = await getAdminPortfolios("space-6");
    const first = portfolios.find((portfolio) => portfolio.code === "3")!;
    const second = portfolios.find((portfolio) => portfolio.code === "4")!;
    expect(first.globalResources.find((resource) => resource.id === "video")).toMatchObject({ url: null, available: false, recognition: null });
    expect(second.globalResources.find((resource) => resource.id === "video")).toMatchObject({ url: null, available: false, recognition: null });
    expect(first.globalResources.find((resource) => resource.id === "assignments")?.recognition).toMatchObject({
      target: "file_name",
      operator: "starts_with",
      value: "Portfolio",
      fileExtensions: ["pdf"],
    });

    await setPortfolioExternalLinks(first.id, [{ resourceId: "video", url: "https://example.com/video" }]);
    await setPortfolioPublication(first.id, "visible", false, null, null);
    await setPortfolioPublication(second.id, "visible", false, null, null);

    expect((await getStudentPortfolios("space-6")).find((portfolio) => portfolio.id === first.id)?.globalResources.find((resource) => resource.id === "video"))
      .toMatchObject({ url: "https://example.com/video", available: true });
    expect((await getStudentPortfolios("space-6")).find((portfolio) => portfolio.id === second.id)?.globalResources.find((resource) => resource.id === "video"))
      .toBeUndefined();

    await persistIndex(await indexSource(source), "local", "space-6");
    expect((await getAdminPortfolios("space-6")).find((portfolio) => portfolio.id === first.id)?.globalResources.find((resource) => resource.id === "video"))
      .toMatchObject({ url: "https://example.com/video", available: true });

    await setPortfolioExternalLinks(first.id, [{ resourceId: "video", url: null }]);
    expect((await getAdminPortfolios("space-6")).find((portfolio) => portfolio.id === first.id)?.globalResources.find((resource) => resource.id === "video"))
      .toMatchObject({ url: null, available: false });
  });

  it("uses the active source profile during synchronization and exposes custom global resource identities", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-profile-driven-sync-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();

    const database = await getDatabase();
    const activeProfileId = String((await database.execute("SELECT source_profile_id FROM learning_space_source_profiles WHERE learning_space_id = 'space-6'")).rows[0].source_profile_id);
    const configRow = (await database.execute({ sql: "SELECT config_json FROM source_profiles WHERE id = ?", args: [activeProfileId] })).rows[0];
    const config = JSON.parse(String(configRow.config_json));
    config.globalResources = [
      {
        id: "werkblad", kind: "source_file", label: "Werkblad", icon: "file-text", order: 10, semanticRole: "assignment",
        recognition: { target: "file_name", operator: "starts_with", value: "Werkblad", caseSensitive: false, fileExtensions: ["pdf"] },
      },
      {
        id: "tips", kind: "source_file", label: "Tips", icon: "lightbulb", order: 20, semanticRole: "hint",
        recognition: { target: "file_name", operator: "ends_with", value: "Tips", caseSensitive: false, fileExtensions: ["png"] },
      },
      {
        id: "modelantwoord", kind: "source_file", label: "Modelantwoord", icon: "circle-check-big", order: 30, semanticRole: "final_answer",
        recognition: { target: "file_name", operator: "starts_with", value: "Modelantwoord", caseSensitive: false, fileExtensions: ["pdf"] },
      },
    ];
    await database.execute({ sql: "UPDATE source_profiles SET config_json = ?, updated_at = ? WHERE id = ?", args: [JSON.stringify(config), "2026-09-13T12:00:00.000Z", activeProfileId] });

    const provider = createProfileDrivenPortfolioProvider();
    const space = (await getLearningSpace("space-6"))!;
    await expect(synchronizeSource("space-6", {
      getConfiguredProvider: async () => ({ provider, type: "local", space: { ...space, sourceType: "local" } }),
    })).resolves.toMatchObject({ portfolios: 1, skipped: false });

    const portfolio = (await getAdminPortfolios("space-6")).find((item) => item.code === "1")!;
    expect(portfolio.assignmentPdfPath).toBe("Portfolio 1 - Test/Werkblad portfolio 1.pdf");
    expect(portfolio.hintsDocumentPath).toBe("Portfolio 1 - Test/Portfolio 1 - Tips.png");
    expect(portfolio.finalSolutionsPdfPath).toBe("Portfolio 1 - Test/Modelantwoord portfolio 1.pdf");
    expect(portfolio.globalResources).toEqual([
      expect.objectContaining({ id: "werkblad", documentKind: "assignment", available: true }),
      expect.objectContaining({ id: "tips", documentKind: "hints", available: true }),
      expect.objectContaining({ id: "modelantwoord", documentKind: "final-solutions", available: true }),
    ]);
  });

  it("persists generic portfolio and exercise resources and reconciles a stable source across rename, missing and restore", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-generic-resources-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();

    const database = await getDatabase();
    const profileId = String((await database.execute("SELECT source_profile_id FROM learning_space_source_profiles WHERE learning_space_id = 'space-6'")).rows[0].source_profile_id);
    const config = structuredClone(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
    config.globalResources.push({
      id: "lesson-video",
      kind: "source_file",
      label: "Lesvideo",
      icon: "monitor-play",
      order: 40,
      semanticRole: "generic",
      recognition: { target: "file_name", operator: "contains", value: "Lesvideo", caseSensitive: false, fileExtensions: ["png"] },
    });
    config.exerciseResources.unshift({
      id: "exercise-hint",
      kind: "source_file",
      label: "Hint per oefening",
      icon: "lightbulb",
      order: 5,
      semanticRole: "hint",
      location: { scope: "alongside_exercise" },
      recognition: {
        file: { target: "after_exercise_number", operator: "starts_with", value: "-hint", caseSensitive: false },
        directory: null,
        fileExtensions: ["png"],
      },
      allowMultiple: true,
      displayMode: "collapsible_each",
    });
    await database.execute({
      sql: "UPDATE source_profiles SET config_json = ?, updated_at = ? WHERE id = ?",
      args: [JSON.stringify(config), "2026-09-13T13:00:00.000Z", profileId],
    });

    const provider = createGenericResourceProvider();
    await persistIndex(await indexSource(provider, config), "local", "space-6");

    const lessonRow = (await database.execute("SELECT * FROM source_resource_assets WHERE resource_id = 'lesson-video'")).rows[0];
    const hintRow = (await database.execute("SELECT * FROM source_resource_assets WHERE resource_id = 'exercise-hint'")).rows[0];
    expect(lessonRow).toMatchObject({ resource_scope: "portfolio", source_id: "lesson-video-source", is_indexed: 1 });
    expect(hintRow).toMatchObject({ resource_scope: "exercise", source_id: "exercise-hint-source", is_indexed: 1, missing_since: null });

    const portfolio = (await getAdminPortfolios("space-6")).find((item) => item.code === "8")!;
    expect(portfolio.globalResources.find((resource) => resource.id === "lesson-video")).toMatchObject({
      available: true,
      documentKind: null,
      assetId: String(lessonRow.id),
    });
    const exerciseId = String(hintRow.exercise_id);
    expect((await getAdminExercise(exerciseId))?.resources.find((resource) => resource.id === "exercise-hint")).toMatchObject({
      available: true,
      legacyVariant: null,
      assets: [expect.objectContaining({ id: String(hintRow.id), source: "resource" })],
    });
    expect(await getAdminResourceAsset(String(hintRow.id), "space-6")).toMatchObject({ sourceId: "exercise-hint-source", extension: "png" });

    expect(await getPublicResourceAsset(String(hintRow.id), "space-6")).toBeNull();
    await setPortfolioPublication(portfolio.id, "visible", false, null, null);
    expect((await getVisibleExercise(exerciseId, "space-6"))?.resources.map((resource) => resource.id)).toEqual(["exercise-hint"]);
    expect(await getPublicResourceAsset(String(lessonRow.id), "space-6")).toMatchObject({ sourceId: "lesson-video-source", extension: "png" });
    expect(await getPublicResourceAsset(String(hintRow.id), "space-6")).toMatchObject({ sourceId: "exercise-hint-source", extension: "png" });
    expect((await getStudentPortfolios("space-6")).find((item) => item.id === portfolio.id)?.globalResources.find((resource) => resource.id === "lesson-video"))
      .toMatchObject({ available: true, assetId: String(lessonRow.id) });

    provider.renameExercise("PF8-Oef2-hint-extra.png");
    await persistIndex(await indexSource(provider, config), "local", "space-6");
    expect((await database.execute("SELECT id, relative_path, is_indexed, missing_since FROM source_resource_assets WHERE resource_id = 'exercise-hint'")).rows).toEqual([
      expect.objectContaining({ id: String(hintRow.id), relative_path: "Portfolio 8 - Test/1 - Test/PF8-Oef2-hint-extra.png", is_indexed: 1, missing_since: null }),
    ]);

    provider.removeExercise();
    await persistIndex(await indexSource(provider, config), "local", "space-6");
    expect((await database.execute("SELECT id, is_indexed, missing_since FROM source_resource_assets WHERE resource_id = 'exercise-hint'")).rows[0]).toMatchObject({
      id: String(hintRow.id), is_indexed: 0,
    });
    expect((await database.execute("SELECT missing_since FROM source_resource_assets WHERE resource_id = 'exercise-hint'")).rows[0].missing_since).not.toBeNull();
    expect(await getPublicResourceAsset(String(hintRow.id), "space-6")).toBeNull();

    provider.restoreExercise("PF8-Oef2-hint-restored.png");
    await persistIndex(await indexSource(provider, config), "local", "space-6");
    expect((await database.execute("SELECT id, relative_path, is_indexed, missing_since, archived_at FROM source_resource_assets WHERE resource_id = 'exercise-hint'")).rows).toEqual([
      expect.objectContaining({ id: String(hintRow.id), relative_path: "Portfolio 8 - Test/1 - Test/PF8-Oef2-hint-restored.png", is_indexed: 1, missing_since: null, archived_at: null }),
    ]);
  });

  it("keeps generic-only resource lifecycle counts coherent across delete, restore and archive", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-generic-lifecycle-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();

    const present = resourceLifecycleFixture("generic", true);
    const absent = resourceLifecycleFixture("generic", false);
    await expect(persistIndex([present], "local", "space-6")).resolves.toMatchObject({ added: 1, missing: 0 });
    const changed = resourceLifecycleFixture("generic", true);
    changed.sections[0].exercises[0].assets[0].sourceVersion = "v2";
    await expect(persistIndex([changed], "local", "space-6")).resolves.toMatchObject({ added: 0, updated: 1, missing: 0 });
    await expect(persistIndex([absent], "local", "space-6")).resolves.toMatchObject({ missing: 1 });
    await expect(getMissingIndexCounts("space-6")).resolves.toEqual({ exercises: 0, assets: 1 });
    expect((await getLatestWarnings("space-6")).filter((warning) => warning.message.includes("Bronbestand ontbreekt"))).toHaveLength(1);
    const database = await getDatabase();
    const exerciseId = String((await database.execute("SELECT id FROM exercises WHERE exercise_code = '1'")).rows[0].id);
    expect((await getAdminExercise(exerciseId, "space-6"))?.missingAssets).toBe(1);

    await expect(persistIndex([changed], "local", "space-6")).resolves.toMatchObject({ missing: 0 });
    await expect(getMissingIndexCounts("space-6")).resolves.toEqual({ exercises: 0, assets: 0 });

    await persistIndex([absent], "local", "space-6");
    await expect(archiveMissingIndexItems("space-6")).resolves.toEqual({ exercises: 0, assets: 1 });
    await expect(getMissingIndexCounts("space-6")).resolves.toEqual({ exercises: 0, assets: 0 });
    expect((await database.execute("SELECT is_indexed, archived_at FROM source_resource_assets WHERE resource_id = 'exercise-hint'")).rows[0])
      .toMatchObject({ is_indexed: 0, archived_at: expect.any(String) });
    expect((await getLatestWarnings("space-6")).filter((warning) => warning.message.includes("Bronbestand ontbreekt"))).toHaveLength(0);
  });

  it("keeps historical legacy-only solution lifecycle counts coherent", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-legacy-lifecycle-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();

    const present = resourceLifecycleFixture("solution", true);
    const absent = resourceLifecycleFixture("solution", false);
    await persistIndex([present], "local", "space-6");
    const database = await getDatabase();
    await database.execute("DELETE FROM source_resource_assets WHERE resource_id = 'worked-solution'");

    await expect(persistIndex([absent], "local", "space-6")).resolves.toMatchObject({ missing: 1 });
    await expect(getMissingIndexCounts("space-6")).resolves.toEqual({ exercises: 0, assets: 1 });
    const exerciseId = String((await database.execute("SELECT id FROM exercises WHERE exercise_code = '1'")).rows[0].id);
    expect((await getAdminExercise(exerciseId, "space-6"))?.missingAssets).toBe(1);

    await expect(persistIndex([present], "local", "space-6")).resolves.toMatchObject({ missing: 0 });
    await database.execute("DELETE FROM source_resource_assets WHERE resource_id = 'worked-solution'");
    await expect(getMissingIndexCounts("space-6")).resolves.toEqual({ exercises: 0, assets: 0 });

    await persistIndex([absent], "local", "space-6");
    await expect(archiveMissingIndexItems("space-6")).resolves.toEqual({ exercises: 0, assets: 1 });
    await expect(getMissingIndexCounts("space-6")).resolves.toEqual({ exercises: 0, assets: 0 });
    expect((await database.execute("SELECT is_indexed, archived_at FROM solution_assets")).rows[0])
      .toMatchObject({ is_indexed: 0, archived_at: expect.any(String) });
  });

  it("counts a mixed generic and legacy solution representation once throughout its lifecycle", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-mixed-lifecycle-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    const database = await getDatabase();

    const present = resourceLifecycleFixture("solution", true);
    const absent = resourceLifecycleFixture("solution", false);
    await expect(persistIndex([present], "local", "space-6")).resolves.toMatchObject({ added: 1, missing: 0 });
    const changed = resourceLifecycleFixture("solution", true);
    changed.sections[0].exercises[0].assets[0].sourceVersion = "v2";
    await expect(persistIndex([changed], "local", "space-6")).resolves.toMatchObject({ added: 0, updated: 1, missing: 0 });
    await expect(persistIndex([absent], "local", "space-6")).resolves.toMatchObject({ missing: 1 });
    await expect(getMissingIndexCounts("space-6")).resolves.toEqual({ exercises: 0, assets: 1 });
    expect((await getLatestWarnings("space-6")).filter((warning) => /ontbreekt|onvolledig/i.test(warning.message))).toHaveLength(1);
    const exerciseId = String((await database.execute("SELECT id FROM exercises WHERE exercise_code = '1'")).rows[0].id);
    expect((await getAdminExercise(exerciseId, "space-6"))?.missingAssets).toBe(1);

    await expect(persistIndex([changed], "local", "space-6")).resolves.toMatchObject({ missing: 0 });
    await expect(getMissingIndexCounts("space-6")).resolves.toEqual({ exercises: 0, assets: 0 });

    await persistIndex([absent], "local", "space-6");
    await expect(archiveMissingIndexItems("space-6")).resolves.toEqual({ exercises: 0, assets: 1 });
    await expect(getMissingIndexCounts("space-6")).resolves.toEqual({ exercises: 0, assets: 0 });
    expect(Number((await database.execute("SELECT COUNT(*) AS count FROM source_resource_assets WHERE archived_at IS NOT NULL")).rows[0].count)).toBe(1);
    expect(Number((await database.execute("SELECT COUNT(*) AS count FROM solution_assets WHERE archived_at IS NOT NULL")).rows[0].count)).toBe(1);
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
    const removed = "Portfolio 3 - Toepassingen van integralen/1 - Integralen/PF3-Oef2(1).png";
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
    const standardFirst = "Portfolio 3 - Toepassingen van integralen/1 - Integralen/PF3-Oef2(1).png";
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

  it("stores optional reporter names with trimming and a 100 character server limit", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-report-names-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    await persistIndex(await indexSource(createTwoPortfolioProvider()), "local");
    await setPortfolioPublication("portfolio-3", "visible", false, null, null);
    const database = await getDatabase();
    const exerciseId = String((await database.execute("SELECT id FROM exercises WHERE portfolio_id = 'portfolio-3' ORDER BY id LIMIT 1")).rows[0].id);

    await createErrorReport({ exerciseId, variant: "standard", message: "Anonieme melding", rateLimitKey: "anonymous" });
    await createErrorReport({ exerciseId, variant: "standard", message: "Melding met naam", reporterName: "  Noor Janssens  ", rateLimitKey: "named" });
    await createErrorReport({ exerciseId, variant: "standard", message: "Lege naam", reporterName: "   ", rateLimitKey: "blank-name" });
    await createErrorReport({ exerciseId, variant: "standard", message: "Naam op grens", reporterName: "A".repeat(100), rateLimitKey: "max-name" });
    await expect(createErrorReport({ exerciseId, variant: "standard", message: "Naam te lang", reporterName: "A".repeat(101), rateLimitKey: "long-name" })).rejects.toThrow("maximaal 100 tekens");

    const reports = new Map((await getAdminErrorReports()).map((report) => [report.message, report]));
    expect(reports.get("Anonieme melding")?.reporterName).toBeNull();
    expect(reports.get("Melding met naam")?.reporterName).toBe("Noor Janssens");
    expect(reports.get("Lege naam")?.reporterName).toBeNull();
    expect(reports.get("Naam op grens")?.reporterName).toBe("A".repeat(100));
    expect(reports.has("Naam te lang")).toBe(false);
  });

  it("only permits a solution asset when its full publication chain is effective", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-assets-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    await persistIndex(await indexSource(createTwoPortfolioProvider()), "local");
    const database = await getDatabase();
    const selected = (await database.execute(`SELECT solution_assets.id AS asset_id, exercises.id AS exercise_id
      FROM solution_assets JOIN solution_variants ON solution_variants.id = solution_assets.variant_id
      JOIN exercises ON exercises.id = solution_variants.exercise_id
      WHERE exercises.portfolio_id = 'portfolio-3' ORDER BY solution_assets.id LIMIT 1`)).rows[0];
    const assetId = String(selected.asset_id);
    const exerciseId = String(selected.exercise_id);
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

  it("keeps alternative solution assets private when their student flag is disabled and exposes profile-driven resource read models", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-alternatives-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    await persistIndex(await indexSource(createTwoPortfolioProvider()), "local");
    await setPortfolioPublication("portfolio-3", "visible", false, null, null);
    const database = await getDatabase();
    const row = (await database.execute("SELECT solution_assets.id AS asset_id, exercises.id AS exercise_id FROM solution_assets JOIN solution_variants ON solution_variants.id = solution_assets.variant_id JOIN exercises ON exercises.id = solution_variants.exercise_id WHERE solution_variants.kind = 'alternative' LIMIT 1")).rows[0];
    const genericAlternativeId = String((await database.execute({
      sql: "SELECT id FROM source_resource_assets WHERE exercise_id = ? AND resource_scope = 'exercise' AND semantic_role = 'alternative_solution' AND is_indexed = 1 LIMIT 1",
      args: [String(row.exercise_id)],
    })).rows[0].id);
    const profileId = String((await database.execute("SELECT source_profile_id FROM learning_space_source_profiles WHERE learning_space_id = 'space-6'")).rows[0].source_profile_id);
    const exerciseResources = [
      {
        id: "alternative-path", kind: "source_file" as const, label: "Andere aanpak", icon: "sparkles" as const, order: 10, semanticRole: "alternative_solution" as const,
        location: { scope: "alongside_exercise" as const },
        recognition: { target: "after_exercise_number" as const, operator: "starts_with" as const, value: "-alt", caseSensitive: false, fileExtensions: ["png" as const] },
        allowMultiple: true,
        displayMode: "collapsible_group" as const,
      },
      {
        id: "extra-explanation", kind: "source_file" as const, label: "Extra uitleg", icon: "book-open" as const, order: 20, semanticRole: "explanation" as const,
        location: { scope: "alongside_exercise" as const },
        recognition: { target: "after_exercise_number" as const, operator: "starts_with" as const, value: "-uitleg", caseSensitive: false, fileExtensions: ["png" as const] },
        allowMultiple: true,
        displayMode: "collapsible_group" as const,
      },
      {
        id: "worked-path", kind: "source_file" as const, label: "Modeluitwerking", icon: "circle-check-big" as const, order: 30, semanticRole: "worked_solution" as const,
        location: { scope: "alongside_exercise" as const },
        recognition: { target: "fallback" as const, fileExtensions: ["png" as const] },
        allowMultiple: true,
        displayMode: "collapsible_group" as const,
      },
    ];
    await database.execute({
      sql: "UPDATE source_profiles SET config_json = ? WHERE id = ?",
      args: [JSON.stringify({ ...BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG, exerciseResources }), profileId],
    });

    expect(await getPublicAsset(String(row.asset_id))).not.toBeNull();
    expect(await getPublicResourceAsset(genericAlternativeId, "space-6")).not.toBeNull();
    const adminBefore = await getAdminExercise(String(row.exercise_id));
    expect(adminBefore?.resources.map((resource) => [resource.id, resource.available, resource.legacyVariant])).toEqual([
      ["alternative-path", true, "alternative"],
      ["extra-explanation", false, null],
      ["worked-path", true, "standard"],
    ]);
    const portfolioExercise = (await getAdminPortfolios("space-6"))
      .flatMap((portfolio) => portfolio.sections)
      .flatMap((section) => section.exercises)
      .find((exercise) => exercise.id === String(row.exercise_id));
    expect(portfolioExercise?.resources.map((resource) => [resource.id, resource.available])).toEqual([
      ["alternative-path", true],
      ["extra-explanation", false],
      ["worked-path", true],
    ]);
    expect((await getVisibleExercise(String(row.exercise_id), "space-6"))?.resources.map((resource) => resource.id)).toEqual([
      "alternative-path",
      "worked-path",
    ]);

    await setExerciseAlternativeVisibility(String(row.exercise_id), false);
    expect(await getPublicAsset(String(row.asset_id))).toBeNull();
    expect(await getPublicResourceAsset(genericAlternativeId, "space-6")).toBeNull();
    expect((await getVisibleExercise(String(row.exercise_id), "space-6"))?.resources.map((resource) => resource.id)).toEqual(["worked-path"]);
    expect((await getAdminExercise(String(row.exercise_id)))?.resources.map((resource) => resource.id)).toEqual([
      "alternative-path",
      "extra-explanation",
      "worked-path",
    ]);
    await setExerciseAlternativeVisibility(String(row.exercise_id), true);
    expect(await getPublicResourceAsset(genericAlternativeId, "space-6")).not.toBeNull();
  });

  it("does not reinterpret an existing index with changed profile semantics before a successful resync", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-profile-index-alignment-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    const source = createTwoPortfolioProvider();
    await persistIndex(await indexSource(source), "local", "space-6");
    await setPortfolioPublication("portfolio-3", "visible", false, null, null);

    const database = await getDatabase();
    const exerciseId = String((await database.execute(`SELECT exercises.id FROM exercises
      JOIN portfolios ON portfolios.id = exercises.portfolio_id
      WHERE portfolios.id = 'portfolio-3' AND exercises.exercise_code = '2'`)).rows[0].id);
    await setExerciseAlternativeVisibility(exerciseId, true);
    await database.execute({
      sql: "UPDATE sync_runs SET finished_at = '2026-01-01T00:00:00.000Z' WHERE learning_space_id = ? AND status = 'completed'",
      args: ["space-6"],
    });

    const profileRow = (await database.execute({
      sql: `SELECT source_profiles.id, source_profiles.config_json FROM source_profiles
        JOIN learning_space_source_profiles ON learning_space_source_profiles.source_profile_id = source_profiles.id
        WHERE learning_space_source_profiles.learning_space_id = ?`,
      args: ["space-6"],
    })).rows[0];
    const changedConfig = structuredClone(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
    changedConfig.exerciseResources = changedConfig.exerciseResources.map((resource) => ({
      ...resource,
      id: resource.semanticRole === "worked_solution"
        ? "current-worked"
        : resource.semanticRole === "alternative_solution" ? "current-alternative" : resource.id,
      label: resource.semanticRole === "worked_solution"
        ? "Actuele uitwerking"
        : resource.semanticRole === "alternative_solution" ? "Actueel alternatief" : resource.label,
    }));
    await database.execute({
      sql: "UPDATE source_profiles SET config_json = ?, updated_at = ? WHERE id = ?",
      args: [JSON.stringify(changedConfig), "2026-02-01T00:00:00.000Z", String(profileRow.id)],
    });

    const staleAdmin = await getAdminExercise(exerciseId, "space-6");
    expect(staleAdmin?.resources.filter((resource) => resource.available).map((resource) => [resource.id, resource.legacyVariant])).toEqual([
      ["worked-solution", "standard"],
      ["alternative-solution", "alternative"],
    ]);
    expect((await getVisibleExercise(exerciseId, "space-6"))?.resources.map((resource) => [resource.id, resource.legacyVariant])).toEqual([
      ["worked-solution", "standard"],
      ["alternative-solution", "alternative"],
    ]);
    const oldGenericIds = (await database.execute({
      sql: "SELECT resource_id FROM source_resource_assets WHERE exercise_id = ? ORDER BY resource_id",
      args: [exerciseId],
    })).rows.map((row) => String(row.resource_id));

    await recordFailedSync("local", new Error("Testfout"), "space-6");
    expect((await getAdminExercise(exerciseId, "space-6"))?.resources.filter((resource) => resource.available)
      .map((resource) => resource.id)).toEqual(["worked-solution", "alternative-solution"]);
    expect((await database.execute({
      sql: "SELECT resource_id FROM source_resource_assets WHERE exercise_id = ? ORDER BY resource_id",
      args: [exerciseId],
    })).rows.map((row) => String(row.resource_id))).toEqual(oldGenericIds);

    await persistIndex(await indexSource(source, changedConfig), "local", "space-6");
    const currentAdmin = await getAdminExercise(exerciseId, "space-6");
    expect(currentAdmin?.resources.filter((resource) => resource.available).map((resource) => [resource.id, resource.legacyVariant])).toEqual([
      ["current-worked", "standard"],
      ["current-alternative", "alternative"],
    ]);
    expect((await getVisibleExercise(exerciseId, "space-6"))?.resources.map((resource) => [resource.id, resource.legacyVariant])).toEqual([
      ["current-worked", "standard"],
      ["current-alternative", "alternative"],
    ]);
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
    await createTheme("space-6", "Meetkunde", 1);
    const foreignTheme = (await getThemes("space-6"))[0];
    await expect(setPortfolioTheme(fifthPortfolio.id, "space-5", "theme-does-not-exist")).rejects.toThrow("Thema niet gevonden");
    await expect(setPortfolioTheme(fifthPortfolio.id, "space-5", foreignTheme.id)).rejects.toThrow("Thema niet gevonden");
    expect((await getAdminPortfolios("space-5")).find((portfolio) => portfolio.id === fifthPortfolio.id)?.themeName).toBe("Analyse");
    expect((await getAdminPortfolios("space-6")).find((portfolio) => portfolio.id === sixthPortfolio.id)?.themeName).toBeNull();
    const database = await getDatabase();
    const fifthAsset = String((await database.execute({ sql: "SELECT solution_assets.id FROM solution_assets JOIN solution_variants ON solution_variants.id = solution_assets.variant_id JOIN exercises ON exercises.id = solution_variants.exercise_id WHERE exercises.portfolio_id = ? LIMIT 1", args: [fifthPortfolio.id] })).rows[0].id);
    expect(await getPublicAsset(fifthAsset, "space-5")).not.toBeNull();
    expect(await getPublicAsset(fifthAsset, "space-6")).toBeNull();
    await persistIndex([], "local", "space-5");
    expect((await getAdminPortfolios("space-6")).find((portfolio) => portfolio.id === sixthPortfolio.id)?.isIndexed).toBe(true);
  });

  it("scopes the admin portfolio detail to one portfolio and its learning space", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-detail-scope-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    const index = await indexSource(createTwoPortfolioProvider());
    await persistIndex(index, "local", "space-5");
    await persistIndex(index, "local", "space-6");

    const fifthPortfolios = await getAdminPortfolios("space-5");
    const fifthTarget = fifthPortfolios.find((portfolio) => portfolio.code === "3")!;
    const fifthOther = fifthPortfolios.find((portfolio) => portfolio.code === "4")!;
    const sixthTarget = (await getAdminPortfolios("space-6")).find((portfolio) => portfolio.code === "3")!;

    const detail = await getAdminPortfolio(fifthTarget.id, "space-5");
    expect(detail).toMatchObject({ id: fifthTarget.id, learningSpaceId: "space-5", code: "3" });
    expect(detail?.sections.flatMap((section) => section.exercises).map((exercise) => exercise.id))
      .toEqual(fifthTarget.sections.flatMap((section) => section.exercises).map((exercise) => exercise.id));
    expect(detail?.id).not.toBe(fifthOther.id);
    await expect(getAdminPortfolio(fifthTarget.id, "space-6")).resolves.toBeNull();
    await expect(getAdminPortfolio(sixthTarget.id, "space-5")).resolves.toBeNull();
  });

  it("returns the exact parent ID for a Google PF1 exercise preview and keeps the local PF1 separate", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-admin-routing-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    await updateLearningSpace("space-5", {
      subjectId: "subject-wiskunde", name: "Google", slug: "google", shortLabel: "G", sortOrder: 50, sourceType: "google_drive", googleDriveFolderId: "google-root-id",
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
    await expect(createLearningSpace({ subjectId: "subject-wiskunde", name: "Fysica 4de jaar", slug: "fysica-4", shortLabel: "F4", sortOrder: 40, sourceType: "local", localSourcePath: null })).resolves.toMatchObject({ slug: "fysica-4", sourceType: "local", isActive: true, archivedAt: null, editorsCanManageAccess: false });
    await expect(createLearningSpace({ subjectId: "subject-wiskunde", name: "Dubbel", slug: "fysica-4", shortLabel: "D", sortOrder: 41, sourceType: "local", localSourcePath: null })).rejects.toThrow();
  });

  it("persists editor delegation without changing its safe default", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-editor-delegation-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();

    expect(await getLearningSpace("space-5")).toMatchObject({ editorsCanManageAccess: false });
    await setLearningSpaceEditorsCanManageAccess("space-5", true);
    expect(await getLearningSpace("space-5")).toMatchObject({ editorsCanManageAccess: true });
    await setLearningSpaceEditorsCanManageAccess("space-5", false);
    expect(await getLearningSpace("space-5")).toMatchObject({ editorsCanManageAccess: false });
  });

  it("persists presentation metadata and keeps portfolio colors across resync", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-card-metadata-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    await updateLearningSpace("space-5", {
      subjectId: "subject-wiskunde", name: "Vijfde jaar", slug: "5", shortLabel: "5WIS", description: "Publieke beschrijving",
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

  it("persists exercise notes in admin and public reads across resync", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-exercise-note-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    const index = await indexSource(createTwoPortfolioProvider());
    await persistIndex(index, "local", "space-5");
    const portfolio = (await getAdminPortfolios("space-5"))[0];
    const exercise = portfolio.sections[0].exercises[0];
    await setExerciseNote(exercise.id, "Eerste regel\nTweede regel", "Hint", "below_solution");
    await setPortfolioPublication(portfolio.id, "visible", false, null, null);

    expect((await getAdminPortfolios("space-5"))[0].sections[0].exercises[0]).toMatchObject({
      hasNote: true,
      noteLabel: "Hint",
      customNote: "Eerste regel\nTweede regel",
      notePosition: "below_solution",
    });
    expect(await getVisibleExercise(exercise.id, "space-5")).toMatchObject({
      noteLabel: "Hint",
      customNote: "Eerste regel\nTweede regel",
      notePosition: "below_solution",
    });

    await persistIndex(index, "local", "space-5");
    expect((await getAdminPortfolios("space-5"))[0].sections[0].exercises[0]).toMatchObject({
      hasNote: true,
      noteLabel: "Hint",
      customNote: "Eerste regel\nTweede regel",
      notePosition: "below_solution",
    });
  });

  it("preserves dormant OneDrive and Google Drive configuration while switching providers", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-space-switch-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    await updateLearningSpace("space-5", {
      subjectId: "subject-wiskunde", name: "5de jaar", slug: "5", shortLabel: "5", sortOrder: 50, sourceType: "onedrive",
      oneDriveDriveId: "drive-five", oneDriveFolderId: "folder-five", oneDriveFolderPath: "Wiskunde/5",
    });
    await updateLearningSpace("space-5", {
      subjectId: "subject-wiskunde", name: "5de jaar", slug: "5", shortLabel: "5", sortOrder: 50, sourceType: "google_drive",
      googleDriveFolderId: "google-folder-five", googleDriveFolderLabel: "Mirror 5de jaar",
    });
    expect((await getLearningSpaces()).find((space) => space.id === "space-5")).toMatchObject({
      sourceType: "google_drive", oneDriveDriveId: "drive-five", oneDriveFolderId: "folder-five",
      googleDriveFolderId: "google-folder-five", googleDriveFolderLabel: "Mirror 5de jaar",
    });
    await updateLearningSpace("space-5", {
      subjectId: "subject-wiskunde", name: "5de jaar", slug: "5", shortLabel: "5", sortOrder: 50, sourceType: "onedrive",
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
    await updateLearningSpace("space-5", { subjectId: "subject-wiskunde", name: "5de jaar", slug: "5", shortLabel: "V", sortOrder: 55, sourceType: "google_drive", googleDriveFolderId: "mirror-five", googleDriveFolderLabel: "Mirror vijf" });
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
    expect(source.has("Portfolio 3 - Toepassingen van integralen/1 - Integralen/PF3-Oef2(1).png")).toBe(true);
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
    await database.execute({ sql: "INSERT INTO portfolio_external_links (portfolio_id, resource_id, url, updated_at) VALUES (?, 'video', 'https://example.com', ?)", args: [String(references.portfolio_id), "2026-09-12T20:00:00.000Z"] });
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
    expect((await database.execute("SELECT portfolio_id FROM portfolio_external_links")).rows).toEqual([]);
    expect((await database.execute("SELECT id FROM sync_warnings WHERE id = 'warning-space-5'")).rows).toEqual([]);
    expect((await database.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
    expect((await getAdminPortfolios("space-6")).map((portfolio) => portfolio.id)).toEqual(retainedPortfolioIds);
    expect(await getThemes("space-6")).toEqual([expect.objectContaining({ name: "Te behouden thema" })]);
    expect(source.has("Portfolio 3 - Toepassingen van integralen/1 - Integralen/PF3-Oef2(1).png")).toBe(true);
  });

  it("normalizes missing and inaccessible local source paths without changing existing indexed state", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-source-error-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    await persistIndex(await indexSource(createTwoPortfolioProvider()), "local", "space-6");
    await updateLearningSpace("space-5", { subjectId: "subject-wiskunde", name: "5de jaar", slug: "5", shortLabel: "5", sortOrder: 50, sourceType: "local", localSourcePath: null });
    await expect(synchronizeSource("space-5")).rejects.toBeInstanceOf(SourceConfigurationError);
    await updateLearningSpace("space-5", { subjectId: "subject-wiskunde", name: "5de jaar", slug: "5", shortLabel: "5", sortOrder: 50, sourceType: "local", localSourcePath: path.join(temporaryDirectory, "does-not-exist") });
    await expect(synchronizeSource("space-5")).rejects.toBeInstanceOf(SourceAccessError);
    expect((await getAdminPortfolios("space-6")).some((portfolio) => portfolio.code === "3")).toBe(true);
  });

  it("keeps the last valid index when a Google Drive scan fails before persistence", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-google-source-error-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    await persistIndex(await indexSource(createTwoPortfolioProvider()), "local", "space-6");
    await (await getDatabase()).execute({
      sql: "UPDATE learning_space_sources SET provider_type = 'google_drive', google_drive_folder_id = 'root-id', updated_at = ? WHERE learning_space_id = 'space-6' AND is_active = 1",
      args: [new Date().toISOString()],
    });
    const space = (await getLearningSpace("space-6"))!;
    const activeSource = (await getActiveLearningSpaceSource("space-6"))!;
    let indexStarted = false;
    const inaccessibleProvider = {
      id: "google-drive",
      async assertReadyForIndex() { throw new SourceAccessError("De Google Drive-mirror is momenteel niet volledig. De laatst geldige index blijft actief."); },
      async list() { indexStarted = true; return []; },
      async readFile() { return Buffer.from(""); },
    } satisfies StorageProvider;
    await expect(synchronizeSource("space-6", {
      getConfiguredProvider: async () => ({ provider: inaccessibleProvider, type: "google_drive", space: { ...space, sourceType: "google_drive", googleDriveFolderId: "root-id" }, source: activeSource }),
    })).rejects.toThrow("laatst geldige index blijft actief");
    expect(indexStarted).toBe(false);
    expect((await getAdminPortfolios("space-6")).filter((portfolio) => portfolio.isIndexed)).toHaveLength(2);
  });

  it("allows synchronization after a successful Google mirror guard", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-google-marker-valid-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    await getDatabase();
    await (await getDatabase()).execute({
      sql: "UPDATE learning_space_sources SET provider_type = 'google_drive', google_drive_folder_id = 'root-id', updated_at = ? WHERE learning_space_id = 'space-6' AND is_active = 1",
      args: [new Date().toISOString()],
    });
    const space = (await getLearningSpace("space-6"))!;
    const activeSource = (await getActiveLearningSpaceSource("space-6"))!;
    const source = createTwoPortfolioProvider();
    let markerChecks = 0;
    const provider = { ...source, async assertReadyForIndex() { markerChecks += 1; } } satisfies StorageProvider;

    await expect(synchronizeSource("space-6", {
      getConfiguredProvider: async () => ({ provider, type: "google_drive", space: { ...space, sourceType: "google_drive", googleDriveFolderId: "root-id" }, source: activeSource }),
    })).resolves.toMatchObject({ portfolios: 2, skipped: false });
    expect(markerChecks).toBe(1);
  });

  it.each(["local", "onedrive"] as const)("does not require a mirror marker for %s synchronization", async (sourceType) => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), `portfolio-${sourceType}-marker-free-`));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    await getDatabase();
    await (await getDatabase()).execute({
      sql: "UPDATE learning_space_sources SET provider_type = ?, updated_at = ? WHERE learning_space_id = 'space-6' AND is_active = 1",
      args: [sourceType, new Date().toISOString()],
    });
    const space = (await getLearningSpace("space-6"))!;
    const activeSource = (await getActiveLearningSpaceSource("space-6"))!;

    await expect(synchronizeSource("space-6", {
      getConfiguredProvider: async () => ({ provider: createTwoPortfolioProvider(), type: sourceType, space: { ...space, sourceType }, source: activeSource }),
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
    const genericBefore = await database.execute("SELECT id, resource_id, source_id, relative_path, is_indexed FROM source_resource_assets ORDER BY id");
    await database.execute(`CREATE TRIGGER fail_running_sync BEFORE INSERT ON sync_runs
      WHEN NEW.status = 'running' BEGIN SELECT RAISE(ABORT, 'forced internal persistence failure'); END`);

    await expect(synchronizeSource("space-6", {
      getConfiguredProvider: async () => ({ provider, type: "local", space: (await getLearningSpace("space-6"))!, source }),
    })).rejects.toThrow("forced internal persistence failure");
    expect((await getActiveLearningSpaceSource("space-6"))?.lastValidationStatus).toBe("valid");
    expect((await database.execute("SELECT id, source_id, is_indexed FROM solution_assets ORDER BY id")).rows).toEqual(before.rows);
    expect((await database.execute("SELECT id, resource_id, source_id, relative_path, is_indexed FROM source_resource_assets ORDER BY id")).rows).toEqual(genericBefore.rows);
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

function addDistinctExerciseResource(
  portfolio: IndexedPortfolio,
  resourceId: string,
  semanticRole: "hint",
  sourceId: string,
  fileName: string,
): void {
  const exercise = portfolio.sections[0].exercises[0];
  const source = exercise.assets[0];
  exercise.assets.push({
    ...source,
    resourceId,
    semanticRole,
    legacyVariant: null,
    sourceId,
    fileName,
    relativePath: `${portfolio.sections[0].relativePath}/${fileName}`,
  });
}

function addLegacySolutionAsset(
  portfolio: IndexedPortfolio,
  variant: "standard" | "alternative",
  step: number,
  fileName: string,
  sourceId: string,
): void {
  const exercise = portfolio.sections[0].exercises[0];
  const source = exercise.assets[0];
  exercise.assets.push({
    ...source,
    resourceId: variant === "standard" ? "worked-solution" : "alternative-solution",
    semanticRole: variant === "standard" ? "worked_solution" : "alternative_solution",
    legacyVariant: variant,
    relativePath: `${portfolio.sections[0].relativePath}/${fileName}`,
    sourceId,
    fileName,
    parsed: { ...source.parsed, variant, step },
  });
}

function renameReconciliationFixture({
  portfolioPath,
  sectionPath,
  fileName,
  sourceId,
  levelSource,
}: {
  portfolioPath: string;
  sectionPath: string;
  fileName: string | null;
  sourceId: string | null;
  levelSource: "basis" | "uitdaging";
}): IndexedPortfolio {
  const asset = fileName && sourceId ? {
    resourceId: "worked-solution",
    semanticRole: "worked_solution" as const,
    legacyVariant: "standard" as const,
    relativePath: `${sectionPath}/${fileName}`,
    sourceId,
    fileName,
    lastModifiedAt: "2026-10-03T10:00:00.000Z",
    sourceVersion: "v1",
    parsed: {
      portfolioCode: "1B",
      exerciseNumber: 15,
      exerciseSuffix: "",
      exerciseCode: "15",
      variant: "standard" as const,
      step: 1,
      extension: "png" as const,
    },
  } : null;
  return {
    code: "1B",
    title: "Stelsels oplossen",
    relativePath: portfolioPath,
    assignmentPdfPath: null,
    assignmentPdfSourceId: null,
    hintsDocumentPath: null,
    hintsDocumentSourceId: null,
    finalSolutionsPdfPath: null,
    finalSolutionsPdfSourceId: null,
    resourceAssets: [{
      resourceId: "header",
      semanticRole: "generic",
      relativePath: `${portfolioPath}/header.png`,
      sourceId: `${portfolioPath}/header.png`,
      fileName: "header.png",
      extension: "png",
      lastModifiedAt: "2026-10-03T10:00:00.000Z",
      sourceVersion: "v1",
    }],
    sections: [{
      code: "2",
      sortOrder: 2,
      title: "Stelsels oplossen met Gauss-Jordan",
      relativePath: sectionPath,
      exercises: [{ code: "15", number: 15, suffix: "", levelSource, assets: asset ? [asset] : [] }],
    }],
    warnings: [],
  };
}

function resourceLifecycleFixture(kind: "generic" | "solution", present: boolean): IndexedPortfolio {
  const portfolioPath = "Portfolio 9 - Lifecycle";
  const sectionPath = `${portfolioPath}/1 - Lifecycle`;
  const fixture = renameReconciliationFixture({
    portfolioPath,
    sectionPath,
    fileName: present ? "PF9-Oef1.png" : null,
    sourceId: present ? "lifecycle-source" : null,
    levelSource: "basis",
  });
  fixture.code = "9";
  fixture.title = "Lifecycle";
  fixture.resourceAssets = [];
  const exercise = fixture.sections[0].exercises[0];
  exercise.code = "1";
  exercise.number = 1;
  if (exercise.assets[0]) {
    exercise.assets[0].parsed = {
      ...exercise.assets[0].parsed,
      portfolioCode: "9",
      exerciseNumber: 1,
      exerciseCode: "1",
    };
    if (kind === "generic") {
      exercise.assets[0].resourceId = "exercise-hint";
      exercise.assets[0].semanticRole = "hint";
      exercise.assets[0].legacyVariant = null;
    }
  }
  return fixture;
}

function exerciseMoveFixture(
  sectionOrder: number,
  levelSource: "basis" | "uitdaging",
  sourceId: string,
): IndexedPortfolio {
  const portfolioPath = "H1B_Stelsels";
  const sectionPath = `${portfolioPath}/${sectionOrder} ${sectionOrder === 1 ? "Oude" : "Nieuwe"} sectie`;
  const fixture = renameReconciliationFixture({
    portfolioPath,
    sectionPath,
    fileName: "PF1B-Oef20a.png",
    sourceId,
    levelSource,
  });
  const section = fixture.sections[0];
  section.code = String(sectionOrder);
  section.sortOrder = sectionOrder;
  section.title = sectionOrder === 1 ? "Oude sectie" : "Nieuwe sectie";
  const exercise = section.exercises[0];
  exercise.code = "20a";
  exercise.number = 20;
  exercise.suffix = "a";
  exercise.assets[0].parsed = {
    ...exercise.assets[0].parsed,
    exerciseNumber: 20,
    exerciseSuffix: "a",
    exerciseCode: "20a",
  };
  return fixture;
}

function createTwoPortfolioProvider() {
  const versions = new Map<string, string>();
  const sourceIds = new Map<string, string>();
  const file = (relativePath: string): StorageEntry => ({ name: relativePath.split("/").at(-1)!, relativePath, sourceId: sourceIds.get(relativePath) ?? relativePath, kind: "file", sourceVersion: versions.get(relativePath) ?? "v1", lastModifiedAt: "2026-08-11T10:00:00.000Z" });
  const directory = (relativePath: string): StorageEntry => ({ name: relativePath.split("/").at(-1)!, relativePath, sourceId: relativePath, kind: "directory" });
  const p3 = "Portfolio 3 - Toepassingen van integralen";
  const p4 = "Portfolio 4 - De bepaalde integraal";
  const p3Section = `${p3}/1 - Integralen`;
  const p4Section = `${p4}/1 - Bepaalde integraal`;
  const tree: Record<string, StorageEntry[]> = {
    "": [directory(p3), directory(p4)],
    [p3]: [file(`${p3}/Portfolio 3 - Toepassingen van integralen.pdf`), file(`${p3}/Eindoplossingen portfolio 3.pdf`), directory(p3Section)],
    [p3Section]: [file(`${p3Section}/PF3-Oef2(1).png`), file(`${p3Section}/PF3-Oef2(2).png`), file(`${p3Section}/PF3-Oef2-alt(1).png`)],
    [p4]: [file(`${p4}/Portfolio 4 - De bepaalde integraal.pdf`), file(`${p4}/Eindoplossingen portfolio 4.pdf`), directory(p4Section)],
    [p4Section]: [file(`${p4Section}/PF4-Oef1.png`), file(`${p4Section}/PF4-Oef1-alt.png`)],
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

function createProfileDrivenPortfolioProvider(): StorageProvider {
  const portfolio = "Portfolio 1 - Test";
  const solutions = `${portfolio}/Uitwerkingen`;
  return {
    id: "profile-driven-fixture",
    async list(relativePath = "") {
      if (relativePath === "") return [{ name: portfolio, relativePath: portfolio, kind: "directory" as const }];
      if (relativePath === portfolio) return [
        { name: "Werkblad portfolio 1.pdf", relativePath: `${portfolio}/Werkblad portfolio 1.pdf`, kind: "file" as const },
        { name: "Portfolio 1 - Tips.png", relativePath: `${portfolio}/Portfolio 1 - Tips.png`, kind: "file" as const },
        { name: "Modelantwoord portfolio 1.pdf", relativePath: `${portfolio}/Modelantwoord portfolio 1.pdf`, kind: "file" as const },
        { name: "Uitwerkingen", relativePath: solutions, kind: "directory" as const },
      ];
      if (relativePath === solutions) return [];
      return [];
    },
    async readFile() { return Buffer.from(""); },
  };
}

function createGenericResourceProvider() {
  const portfolio = "Portfolio 8 - Test";
  const section = `${portfolio}/1 - Test`;
  let exerciseFileName: string | null = "PF8-Oef2-hint.png";

  const file = (name: string, relativePath: string, sourceId: string): StorageEntry => ({
    name,
    relativePath,
    sourceId,
    kind: "file",
    sourceVersion: "v1",
    lastModifiedAt: "2026-09-13T10:00:00.000Z",
  });

  return {
    id: "generic-resource-fixture",
    async list(relativePath = "") {
      if (relativePath === "") return [{ name: portfolio, relativePath: portfolio, sourceId: "portfolio-8-directory", kind: "directory" as const }];
      if (relativePath === portfolio) return [
        file("Portfolio 8 - Test.pdf", `${portfolio}/Portfolio 8 - Test.pdf`, "portfolio-8-assignment"),
        file("Eindoplossingen portfolio 8.pdf", `${portfolio}/Eindoplossingen portfolio 8.pdf`, "portfolio-8-final"),
        file("Lesvideo portfolio 8.png", `${portfolio}/Lesvideo portfolio 8.png`, "lesson-video-source"),
        { name: "1 - Test", relativePath: section, sourceId: "portfolio-8-section-1", kind: "directory" as const },
      ];
      if (relativePath === section) return exerciseFileName
        ? [file(exerciseFileName, `${section}/${exerciseFileName}`, "exercise-hint-source")]
        : [];
      return [];
    },
    async readFile() { return Buffer.from(""); },
    renameExercise(fileName: string) { exerciseFileName = fileName; },
    removeExercise() { exerciseFileName = null; },
    restoreExercise(fileName: string) { exerciseFileName = fileName; },
  } satisfies StorageProvider & {
    renameExercise(fileName: string): void;
    removeExercise(): void;
    restoreExercise(fileName: string): void;
  };
}

function createSingleAssetProvider(fileName: string) {
  return createPortfolioProvider("8", fileName);
}

function createPortfolioProvider(code: string, fileName: string) {
  const portfolio = `Portfolio ${code} - Test`;
  const section = `${portfolio}/1 - Test`;
  const file = (): StorageEntry => ({ name: fileName, relativePath: `${section}/${fileName}`, sourceId: `${section}/${fileName}`, kind: "file", sourceVersion: "v1", lastModifiedAt: "2026-08-12T10:00:00.000Z" });
  return {
    id: "single-asset-fixture",
    async list(relativePath = "") {
      if (relativePath === "") return [{ name: portfolio, relativePath: portfolio, kind: "directory" as const }];
      if (relativePath === portfolio) return [{ name: `Portfolio ${code} - Test.pdf`, relativePath: `${portfolio}/Portfolio ${code} - Test.pdf`, kind: "file" as const }, { name: `Eindoplossingen portfolio ${code}.pdf`, relativePath: `${portfolio}/Eindoplossingen portfolio ${code}.pdf`, kind: "file" as const }, { name: "1 - Test", relativePath: section, kind: "directory" as const }];
      if (relativePath === section) return [file()];
      return [];
    },
    async readFile() { return Buffer.from(""); },
  } satisfies StorageProvider;
}
