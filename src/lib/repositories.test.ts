import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import { createErrorReport, getAdminErrorReports, getOpenErrorReportCount, getStudentPortfolios, persistIndex, saveErrorReportNote, setErrorReportStatus, setExercisePublication, setPortfolioPublication, toggleErrorReportPin } from "./repositories";
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
  it("is idempotent for multiple portfolios and updates a replaced source file", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-sync-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    const source = createTwoPortfolioProvider();
    const firstIndex = await indexSource(source);

    expect(firstIndex).toHaveLength(2);
    expect(firstIndex.flatMap((portfolio) => portfolio.sections).flatMap((section) => section.exercises).flatMap((exercise) => exercise.assets)).toHaveLength(5);
    await persistIndex(firstIndex, "local");
    const database = await getDatabase();
    const original = await database.execute("SELECT id, variant_id, relative_path FROM solution_assets ORDER BY id LIMIT 1");
    await database.execute({ sql: "UPDATE solution_assets SET id = ? WHERE id = ?", args: ["legacy-v02-asset-id", String(original.rows[0].id)] });
    const exercise = await database.execute("SELECT id FROM exercises ORDER BY id LIMIT 1");
    await setExercisePublication([String(exercise.rows[0].id)], "visible", null, null);

    await expect(persistIndex(await indexSource(source), "local")).resolves.toMatchObject({ added: 0, missing: 0 });
    expect(Number((await database.execute("SELECT COUNT(*) AS count FROM solution_assets")).rows[0].count)).toBe(5);
    expect(Number((await database.execute({ sql: "SELECT visible FROM exercises WHERE id = ?", args: [String(exercise.rows[0].id)] })).rows[0].visible)).toBe(1);

    source.setVersion("Portfolio 3 - Toepassingen van integralen/Uitwerkingen/1 - Integralen/PF3-Oef2(1).png", "replacement-v2");
    await expect(persistIndex(await indexSource(source), "local")).resolves.toMatchObject({ updated: 1, missing: 0 });
    const updated = await database.execute({ sql: "SELECT source_version FROM solution_assets WHERE relative_path = ?", args: ["Portfolio 3 - Toepassingen van integralen/Uitwerkingen/1 - Integralen/PF3-Oef2(1).png"] });
    expect(updated.rows[0].source_version).toBe("replacement-v2");
    expect(Number((await database.execute("SELECT COUNT(*) AS count FROM solution_assets")).rows[0].count)).toBe(5);
  });

  it("lets inherited sections and exercises follow a visible portfolio without resetting overrides", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-visibility-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    const source = createTwoPortfolioProvider();
    await persistIndex(await indexSource(source), "local");
    await setPortfolioPublication("portfolio-3", "visible", null, null);
    const visiblePortfolio = (await getStudentPortfolios()).find((portfolio) => portfolio.id === "portfolio-3");
    expect(visiblePortfolio?.sections.flatMap((section) => section.exercises).every((exercise) => exercise.visible)).toBe(true);

    const database = await getDatabase();
    const exerciseId = String((await database.execute("SELECT id FROM exercises WHERE portfolio_id = 'portfolio-3' ORDER BY id LIMIT 1")).rows[0].id);
    await setExercisePublication([exerciseId], "hidden", null, null);
    expect((await getStudentPortfolios()).find((portfolio) => portfolio.id === "portfolio-3")?.sections.flatMap((section) => section.exercises).find((exercise) => exercise.id === exerciseId)?.visible).toBe(false);
    await persistIndex(await indexSource(source), "local");
    expect((await database.execute({ sql: "SELECT visibility_mode FROM exercises WHERE id = ?", args: [exerciseId] })).rows[0].visibility_mode).toBe("hidden");
    expect((await database.execute("SELECT COUNT(*) AS count FROM exercises WHERE visibility_mode = 'inherit'")).rows[0].count).not.toBe(0);
  });

  it("keeps error reports actionable with TODO, DONE, pinning and notes", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-reports-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    await persistIndex(await indexSource(createTwoPortfolioProvider()), "local");
    await setPortfolioPublication("portfolio-3", "visible", null, null);
    const database = await getDatabase();
    const exerciseId = String((await database.execute("SELECT id FROM exercises WHERE portfolio_id = 'portfolio-3' ORDER BY id LIMIT 1")).rows[0].id);
    await createErrorReport({ exerciseId, variant: "standard", message: "Stap twee bevat een fout.", rateLimitKey: "test-report" });
    expect(await getOpenErrorReportCount()).toBe(1);
    const report = (await getAdminErrorReports())[0];
    await toggleErrorReportPin(report.id);
    await saveErrorReportNote(report.id, "Later nakijken.");
    await setErrorReportStatus(report.id, "DONE");
    let updated = (await getAdminErrorReports())[0];
    expect(updated).toMatchObject({ status: "DONE", pinned: true, adminNote: "Later nakijken." });
    expect(updated.completedAt).toBeTruthy();
    expect(await getOpenErrorReportCount()).toBe(0);
    await setErrorReportStatus(report.id, "TODO");
    updated = (await getAdminErrorReports())[0];
    expect(updated.completedAt).toBeNull();
    expect(await getOpenErrorReportCount()).toBe(1);
  });
});

function createTwoPortfolioProvider() {
  const versions = new Map<string, string>();
  const file = (relativePath: string): StorageEntry => ({ name: relativePath.split("/").at(-1)!, relativePath, sourceId: relativePath, kind: "file", sourceVersion: versions.get(relativePath) ?? "v1", lastModifiedAt: "2026-08-11T10:00:00.000Z" });
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
        ? { ...entry, sourceVersion: versions.get(entry.relativePath) ?? "v1" }
        : entry);
    },
    async readFile() { return Buffer.from(""); },
    setVersion(relativePath: string, version: string) { versions.set(relativePath, version); },
  } satisfies StorageProvider & { setVersion(relativePath: string, version: string): void };
}
