import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import type { IndexedPortfolio } from "./domain";
import {
  archiveMissingIndexItems,
  getAdminExercise,
  getAdminPortfolios,
  getLearningSpace,
  getStudentPortfolios,
  getVisibleExercise,
  persistIndex,
  setExerciseLevelOverride,
  setPortfolioPublication,
} from "./repositories";
import { synchronizeSource } from "./sync";

let temporaryDirectory: string | undefined;

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-exercise-level-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
  await getDatabase();
});

afterEach(async () => {
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

describe("exercise level repository", () => {
  it("stores all override modes and exposes one centralized effective level in existing readmodels", async () => {
    await persistIndex(indexFixture(), "local", "space-5");
    const portfolio = (await getAdminPortfolios("space-5"))[0];
    const exercise = portfolio.sections[0].exercises[0];
    expect(exercise).toMatchObject({
      levelSource: null, levelOverrideMode: "inherit", levelOverride: null, effectiveLevel: null,
    });

    const database = await getDatabase();
    await database.execute({ sql: "UPDATE exercises SET level_source = 'basis' WHERE id = ?", args: [exercise.id] });
    await setExerciseLevelOverride(exercise.id, { mode: "level", level: "uitdaging" });
    expect(await getAdminExercise(exercise.id, "space-5")).toMatchObject({
      levelSource: "basis", levelOverrideMode: "level", levelOverride: "uitdaging", effectiveLevel: "uitdaging",
    });

    await setExerciseLevelOverride(exercise.id, { mode: "none" });
    expect(await getAdminExercise(exercise.id, "space-5")).toMatchObject({
      levelSource: "basis", levelOverrideMode: "none", levelOverride: null, effectiveLevel: null,
    });

    await setExerciseLevelOverride(exercise.id, { mode: "inherit" });
    expect((await getAdminPortfolios("space-5"))[0].sections[0].exercises[0]).toMatchObject({
      levelSource: "basis", levelOverrideMode: "inherit", levelOverride: null, effectiveLevel: "basis",
    });

    await setPortfolioPublication(portfolio.id, "visible", false, null, null);
    expect((await getStudentPortfolios("space-5"))[0].sections[0].exercises[0]).toMatchObject({ effectiveLevel: "basis" });
    expect(await getVisibleExercise(exercise.id, "space-5")).toMatchObject({ effectiveLevel: "basis" });
  });

  it("rejects an invalid runtime override before persistence", async () => {
    await persistIndex(indexFixture(), "local", "space-5");
    const exercise = (await getAdminPortfolios("space-5"))[0].sections[0].exercises[0];

    await expect(setExerciseLevelOverride(exercise.id, { mode: "level" } as never)).rejects.toThrow("geldig oefeningniveau");
    expect(await getAdminExercise(exercise.id, "space-5")).toMatchObject({
      levelOverrideMode: "inherit", levelOverride: null, effectiveLevel: null,
    });
  });

  it("clears unmatched source metadata while preserving manual override state across resync and restoration", async () => {
    const index = indexFixture();
    await persistIndex(index, "local", "space-5");
    const exercise = (await getAdminPortfolios("space-5"))[0].sections[0].exercises[0];
    const database = await getDatabase();
    await database.execute({ sql: "UPDATE exercises SET level_source = 'opwarmer' WHERE id = ?", args: [exercise.id] });
    await setExerciseLevelOverride(exercise.id, { mode: "level", level: "verdieping" });

    await persistIndex(index, "local", "space-5");
    expect(await getAdminExercise(exercise.id, "space-5")).toMatchObject({
      isIndexed: true, levelSource: null, levelOverrideMode: "level", levelOverride: "verdieping", effectiveLevel: "verdieping",
    });

    await setExerciseLevelOverride(exercise.id, { mode: "none" });
    await persistIndex([], "local", "space-5");
    expect(await getAdminExercise(exercise.id, "space-5")).toMatchObject({
      isIndexed: false, levelSource: null, levelOverrideMode: "none", levelOverride: null, effectiveLevel: null,
    });

    await archiveMissingIndexItems("space-5");
    expect((await database.execute({
      sql: "SELECT level_source, level_override_mode, level_override, archived_at FROM exercises WHERE id = ?",
      args: [exercise.id],
    })).rows[0]).toMatchObject({
      level_source: null, level_override_mode: "none", level_override: null,
    });
    expect((await database.execute({ sql: "SELECT archived_at FROM exercises WHERE id = ?", args: [exercise.id] })).rows[0].archived_at)
      .not.toBeNull();

    await persistIndex(index, "local", "space-5");
    expect(await getAdminExercise(exercise.id, "space-5")).toMatchObject({
      isIndexed: true, levelSource: null, levelOverrideMode: "none", levelOverride: null, effectiveLevel: null,
    });
  });

  it("updates only source levels on successful authoritative sync and leaves mirror sync non-authoritative", async () => {
    const initial = indexFixture();
    initial[0].sections[0].exercises[0].levelSource = "basis";
    await persistIndex(initial, "local", "space-5");
    const exercise = (await getAdminPortfolios("space-5"))[0].sections[0].exercises[0];

    await setExerciseLevelOverride(exercise.id, { mode: "level", level: "verdieping" });
    const changed = indexFixture();
    changed[0].sections[0].exercises[0].levelSource = "uitdaging";
    await persistIndex(changed, "local", "space-5");
    expect(await getAdminExercise(exercise.id, "space-5")).toMatchObject({
      levelSource: "uitdaging", levelOverrideMode: "level", levelOverride: "verdieping", effectiveLevel: "verdieping",
    });

    await setExerciseLevelOverride(exercise.id, { mode: "none" });
    changed[0].sections[0].exercises[0].levelSource = "opwarmer";
    await persistIndex(changed, "local", "space-5");
    expect(await getAdminExercise(exercise.id, "space-5")).toMatchObject({ levelSource: "opwarmer", levelOverrideMode: "none", effectiveLevel: null });

    await setExerciseLevelOverride(exercise.id, { mode: "inherit" });
    changed[0].sections[0].exercises[0].levelSource = null;
    await persistIndex(changed, "local", "space-5");
    expect(await getAdminExercise(exercise.id, "space-5")).toMatchObject({ levelSource: null, levelOverrideMode: "inherit", effectiveLevel: null });

    const database = await getDatabase();
    const source = (await database.execute({ sql: "SELECT id FROM learning_space_sources WHERE learning_space_id = ? LIMIT 1", args: ["space-5"] })).rows[0];
    expect(source).toBeTruthy();
    await database.execute({ sql: "UPDATE learning_space_sources SET role = 'mirror' WHERE id = ?", args: [String(source.id)] });
    await database.execute({ sql: "UPDATE exercises SET level_source = 'basis' WHERE id = ?", args: [exercise.id] });
    changed[0].sections[0].exercises[0].levelSource = "uitdaging";
    await persistIndex(changed, "local", "space-5", { sourceId: String(source.id) });
    expect(await getAdminExercise(exercise.id, "space-5")).toMatchObject({ levelSource: "basis", levelOverrideMode: "inherit", effectiveLevel: "basis" });
  });

  it("keeps the last valid source level when indexing fails before persistence", async () => {
    const initial = indexFixture();
    initial[0].sections[0].exercises[0].levelSource = "basis";
    await persistIndex(initial, "local", "space-5");
    const exercise = (await getAdminPortfolios("space-5"))[0].sections[0].exercises[0];
    const space = (await getLearningSpace("space-5"))!;
    const provider = { id: "failing", async list() { return []; }, async readFile() { return Buffer.from(""); } };

    await expect(synchronizeSource("space-5", {
      getConfiguredProvider: async () => ({ provider, type: "local", space, source: space.primarySource ?? undefined }),
      index: async () => { throw new Error("Indexing failed"); },
    })).rejects.toThrow("Indexing failed");

    expect(await getAdminExercise(exercise.id, "space-5")).toMatchObject({ levelSource: "basis", effectiveLevel: "basis" });
  });
});

function indexFixture(): IndexedPortfolio[] {
  return [{
    code: "91",
    title: "Niveautest",
    relativePath: "Portfolio 91 - Niveautest",
    assignmentPdfPath: null,
    assignmentPdfSourceId: null,
    hintsDocumentPath: null,
    hintsDocumentSourceId: null,
    finalSolutionsPdfPath: null,
    finalSolutionsPdfSourceId: null,
    resourceAssets: [],
    warnings: [],
    sections: [{
      code: "1",
      sortOrder: 1,
      title: "Basis",
      relativePath: "Portfolio 91 - Niveautest/Uitwerkingen/1 - Basis",
      exercises: [
        { code: "1", number: 1, suffix: "", assets: [] },
        { code: "2", number: 2, suffix: "", assets: [] },
      ],
    }],
  }];
}

async function removeTemporaryDirectory(directory: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EBUSY") throw error;
      if (attempt === 9) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
