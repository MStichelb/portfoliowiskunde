import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import { getActiveLearningSpaceSource, getAdminPortfolios, getLearningSpace, getThemes, persistIndex } from "./repositories";
import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG } from "./source-profile-config";
import { planSourceReconciliation } from "./source-reconciliation";
import { nativeBindingContext, sourceBindingFixture } from "@/test/source-binding-fixture";
import type { IndexedPortfolio } from "./domain";
import { synchronizeSource } from "./sync";

let temporaryDirectory: string | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) {
    try { await rm(temporaryDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EBUSY") throw error; }
  }
  temporaryDirectory = undefined;
}, 30_000);

async function setup(provider = "onedrive") {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-reconciliation-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
  const database = await getDatabase();
  const config = structuredClone(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
  config.scanner.portfolio.themeMode = "folder";
  await database.execute({ sql: "UPDATE learning_space_sources SET provider_type = ? WHERE learning_space_id IN ('space-6', 'space-5')", args: [provider] });
  await database.execute({ sql: "UPDATE source_profiles SET config_json = ?", args: [JSON.stringify(config)] });
  return database;
}

function themed(code = "91", themeId = "theme-a", name = "Analyse") {
  const indexed = sourceBindingFixture(code);
  indexed.sourceTheme = { sourceId: themeId, name, relativePath: name };
  indexed.relativePath = `${name}/${indexed.relativePath}`;
  indexed.sections[0].relativePath = `${indexed.relativePath}/1.1 Onderdeel`;
  return indexed;
}

async function state() {
  const database = await getDatabase();
  const tables = ["portfolios", "themes", "sections", "exercises", "source_entity_bindings", "solution_variants", "solution_assets",
    "source_resource_assets", "error_reports", "error_report_threads", "error_report_issues", "sync_runs", "sync_warnings", "learning_space_header_assets"];
  return Promise.all(tables.map(async (table) => (await database.execute(`SELECT * FROM ${table} ORDER BY id`)).rows));
}

describe("central source reconciliation", () => {
  it("plans native code rename and move without writes, preserves owned metadata and child/error identities on publication", async () => {
    const database = await setup();
    const indexed = themed();
    await persistIndex([indexed], "onedrive", "space-6");
    const original = (await getAdminPortfolios("space-6"))[0];
    const sectionId = original.sections[0].id;
    const exerciseId = original.sections[0].exercises[0].id;
    await database.batch([
      { sql: "UPDATE portfolios SET title_override = 'Eigen titel', visible = 0, publication_limited = 1, publish_from = '2099-01-01', publish_until = '2099-12-31', card_color = '#abcdef', custom_text = 'Bewaren', custom_text_position = 'below_documents' WHERE id = ?", args: [original.id] },
      { sql: "UPDATE sections SET visibility_mode = 'hidden', publication_limited = 1, publish_until = '2099-12-31' WHERE id = ?", args: [sectionId] },
      { sql: "UPDATE exercises SET custom_note = 'Oefening bewaren', visibility_mode = 'hidden', level_override_mode = 'level', level_override = 'uitdaging' WHERE id = ?", args: [exerciseId] },
      { sql: "INSERT INTO error_report_threads (id, learning_space_id, portfolio_id, exercise_id, exercise_code, created_at, updated_at) VALUES ('rename-thread', 'space-6', ?, ?, '1', 'old', 'old')", args: [original.id, exerciseId] },
      { sql: "INSERT INTO error_report_issues (id, thread_id, learning_space_id, portfolio_id, exercise_id, exercise_code, document_kind, created_at, updated_at) VALUES ('rename-issue', 'rename-thread', 'space-6', ?, ?, '1', 'exercise_solution', 'old', 'old')", args: [original.id, exerciseId] },
      { sql: "INSERT INTO error_reports (id, portfolio_id, section_id, exercise_id, issue_id, variant_kind, asset_snapshot, message, status, created_at, updated_at) VALUES ('rename-report', ?, ?, ?, 'rename-issue', 'standard', '[]', 'Bewaar', 'TODO', 'old', 'old')", args: [original.id, sectionId, exerciseId] },
    ]);
    const before = await state();
    indexed.code = "92"; indexed.title = "Nieuwe brontitel";
    indexed.sourceTheme = { sourceId: "theme-b", name: "Algebra", relativePath: "Algebra" };
    indexed.relativePath = "Algebra/Portfolio 92 Nieuw";
    indexed.sections[0].relativePath = `${indexed.relativePath}/1.1 Onderdeel`;
    const source = (await getActiveLearningSpaceSource("space-6"))!;
    const plan = await planSourceReconciliation(database, { learningSpaceId: "space-6", providerType: "onedrive", source,
      portfolios: [indexed], synchronizesThemes: true, newPortfolioId: (code) => `unused-${code}` });
    expect(plan.portfolios[0]).toMatchObject({ id: original.id, match: "native", codeChanged: true, sourceChanged: true, themeChanged: true });
    expect(await state()).toEqual(before);
    for (let repeat = 0; repeat < 3; repeat++) await persistIndex([indexed], "onedrive", "space-6");
    const after = await state();
    const refreshed = after[0][0];
    const sourceFields = new Set(["code", "portfolio_code", "title", "relative_path", "theme_id", "indexed_at", "last_seen_at"]);
    const ownedBefore = Object.fromEntries(Object.entries(before[0][0]).filter(([key]) => !sourceFields.has(key)));
    expect(refreshed).toMatchObject(ownedBefore);
    expect(refreshed).toMatchObject({ id: original.id, portfolio_code: "92", title: "Nieuwe brontitel", relative_path: indexed.relativePath });
    // New UUIDs in a read-only plan are regenerated on publication; resolve actual assignment.
    expect((await getThemes("space-6")).find((theme) => theme.sourceTheme?.sourceId === "theme-b")!.id).toBe(refreshed.theme_id);
    expect(after[2][0]).toMatchObject({ id: sectionId, visibility_mode: "hidden", publication_limited: 1, publish_until: "2099-12-31" });
    expect(after[3][0]).toMatchObject({ id: exerciseId, custom_note: "Oefening bewaren", visibility_mode: "hidden", level_override: "uitdaging" });
    expect(after[4]).toEqual(before[4]);
    expect(after.slice(8, 11)).toEqual(before.slice(8, 11));
    expect(after[0]).toHaveLength(1); expect(after[2]).toHaveLength(1); expect(after[3]).toHaveLength(1);
  });

  it("retains theme identity, display name and order on native rename/move, but creates a new theme for a new ID with the same name", async () => {
    const database = await setup();
    const indexed = themed();
    await persistIndex([indexed], "onedrive", "space-6");
    const original = (await getThemes("space-6"))[0];
    await database.execute({ sql: "UPDATE themes SET name = 'Eigen weergavenaam', sort_order = 80 WHERE id = ?", args: [original.id] });
    indexed.sourceTheme = { sourceId: "theme-a", name: "Functies", relativePath: "Functies" };
    indexed.relativePath = "Functies/Portfolio 91 Bron";
    for (let repeat = 0; repeat < 3; repeat++) await persistIndex([indexed], "onedrive", "space-6");
    expect((await getThemes("space-6"))[0]).toMatchObject({ id: original.id, name: "Eigen weergavenaam", sortOrder: 80,
      sourceTheme: { sourceId: "theme-a", name: "Functies", relativePath: "Functies" } });
    indexed.sourceTheme = { ...indexed.sourceTheme, sourceId: "theme-new" };
    await persistIndex([indexed], "onedrive", "space-6");
    expect(await getThemes("space-6")).toHaveLength(2);
    expect((await getAdminPortfolios("space-6"))[0].themeId).not.toBe(original.id);
  });

  it("retains portfolio identity through theme A to B, theme to root and root to theme without a fake root", async () => {
    await setup();
    const indexed = themed();
    await persistIndex([indexed], "onedrive", "space-6");
    const original = (await getAdminPortfolios("space-6"))[0];
    for (const theme of ["theme-b", null, "theme-a"]) {
      indexed.sourceTheme = theme ? { sourceId: theme, name: theme, relativePath: theme } : undefined;
      indexed.relativePath = `${theme ? `${theme}/` : ""}Portfolio 91 Bron`;
      for (let repeat = 0; repeat < 3; repeat++) await persistIndex([indexed], "onedrive", "space-6");
      const current = (await getAdminPortfolios("space-6"))[0];
      expect(current.id).toBe(original.id);
      expect(current.sections[0].id).toBe(original.sections[0].id);
      expect(current.themeId).toBe(theme ? (await getThemes("space-6")).find((item) => item.sourceTheme?.sourceId === theme)!.id : null);
    }
    expect(await getThemes("space-6")).toHaveLength(2);
  });

  it.each(["new-native-same-code", "delete-recreate", "same-native-two-codes", "same-native-same-code", "claimed-old-twice", "occupied-code", "theme-conflict", "wrong-type", "mixed-namespace", "changed-theme-context", "missing-native-context", "theme-used-as-section", "theme-used-as-portfolio"])(
    "rejects %s with the complete publication state unchanged", async (scenario) => {
      const database = await setup();
      await persistIndex([themed(), sourceBindingFixture("93")], "onedrive", "space-6");
      if (scenario === "delete-recreate") await persistIndex([], "onedrive", "space-6");
      const before = await state();
      const indexed = themed();
      const input: IndexedPortfolio[] = [indexed];
      if (scenario === "new-native-same-code" || scenario === "delete-recreate") indexed.sourceId = "replacement";
      if (scenario === "same-native-two-codes" || scenario === "claimed-old-twice") input.push({ ...sourceBindingFixture("92"), sourceId: indexed.sourceId });
      if (scenario === "same-native-same-code") input.push(structuredClone(indexed));
      if (scenario === "occupied-code") indexed.code = "93";
      if (scenario === "theme-conflict") input.push({ ...sourceBindingFixture("92"), sourceTheme: { sourceId: "theme-a", name: "Conflicting", relativePath: "Elsewhere" } });
      if (scenario === "wrong-type") indexed.sourceId = indexed.sections[0].sourceId;
      if (scenario === "mixed-namespace") input.push(sourceBindingFixture("92", { ...nativeBindingContext, providerNamespace: "another-drive" }));
      if (scenario === "changed-theme-context") indexed.sourceIdentityContext = { ...nativeBindingContext, providerNamespace: "another-root" };
      if (scenario === "missing-native-context") delete indexed.sourceIdentityContext;
      if (scenario === "theme-used-as-section") indexed.sections[0].sourceId = "theme-a";
      if (scenario === "theme-used-as-portfolio") { indexed.sourceId = "theme-a"; delete indexed.sourceTheme; }
      await expect(persistIndex(input, "onedrive", "space-6")).rejects.toThrow("bronidentiteit");
      expect(await state()).toEqual(before);
      expect((await database.execute("SELECT COUNT(*) AS count FROM sync_runs WHERE status = 'running'")).rows[0].count).toBe(0);
    },
  );

  it("never uses a foreign LearningSpace/source/provider namespace native binding for a code rename", async () => {
    const database = await setup();
    await persistIndex([sourceBindingFixture()], "onedrive", "space-6");
    const original = (await getAdminPortfolios("space-6"))[0];
    const renamed = sourceBindingFixture(); renamed.code = "92"; renamed.sections = [];
    await persistIndex([renamed], "onedrive", "space-5");
    expect((await getAdminPortfolios("space-5"))[0].id).not.toBe(original.id);
    const wrongSource = (await getActiveLearningSpaceSource("space-5"))!;
    const before = await state();
    await expect(persistIndex([renamed], "onedrive", "space-6", { sourceId: wrongSource.id })).rejects.toThrow();
    expect(await state()).toEqual(before);
    await database.execute("INSERT INTO learning_space_sources (id, learning_space_id, role, provider_type, is_active, created_at, updated_at) VALUES ('other-source', 'space-6', 'mirror', 'onedrive', 0, 'now', 'now')");
    await persistIndex([renamed], "onedrive", "space-6", { sourceId: "other-source" });
    expect((await getAdminPortfolios("space-6")).find((item) => item.code === "92")!.id).not.toBe(original.id);
    renamed.code = "94"; renamed.sourceIdentityContext = { ...nativeBindingContext, providerNamespace: "foreign-namespace" };
    await persistIndex([renamed], "onedrive", "space-6");
    expect((await getAdminPortfolios("space-6")).find((item) => item.code === "94")!.id).not.toBe(original.id);
  });

  it("creates an unbound different-code portfolio and permits old code reuse after a native rename without reusing its old generated ID", async () => {
    await setup();
    const unbound = sourceBindingFixture(); delete unbound.sourceIdentityContext;
    await persistIndex([unbound], "onedrive", "space-6");
    const old = (await getAdminPortfolios("space-6"))[0];
    const newUnbound = structuredClone(unbound); newUnbound.code = "95";
    await persistIndex([newUnbound], "onedrive", "space-6");
    expect((await getAdminPortfolios("space-6")).find((item) => item.code === "95")!.id).not.toBe(old.id);
    const native = sourceBindingFixture(); await persistIndex([native], "onedrive", "space-6");
    native.code = "92"; await persistIndex([native], "onedrive", "space-6");
    const replacement = sourceBindingFixture(); replacement.sourceId = "brand-new-folder"; replacement.sections = [];
    await persistIndex([native, replacement], "onedrive", "space-6");
    const current = await getAdminPortfolios("space-6");
    expect(current.find((item) => item.code === "92")!.id).toBe(old.id);
    expect(current.find((item) => item.code === "91")!.id).not.toBe(old.id);
  });

  it("uses Google native identity only within its Google scope", async () => {
    await setup("google_drive");
    const indexed = sourceBindingFixture("91", { providerType: "google_drive", providerNamespace: "google-account-root", identityKind: "native" });
    await persistIndex([indexed], "google_drive", "space-6");
    const old = (await getAdminPortfolios("space-6"))[0];
    indexed.code = "92";
    await persistIndex([indexed], "google_drive", "space-6");
    expect((await getAdminPortfolios("space-6"))[0].id).toBe(old.id);
  });

  it("does not interpret LocalFS path identity as native continuity on a code change or theme rename", async () => {
    await setup("local");
    const indexed = sourceBindingFixture("91", { providerType: "local", providerNamespace: "local-root", identityKind: "path" });
    indexed.sourceTheme = { sourceId: "Analyse", name: "Analyse", relativePath: "Analyse" };
    indexed.sourceId = indexed.relativePath;
    await persistIndex([indexed], "local", "space-6");
    const old = (await getAdminPortfolios("space-6"))[0];
    indexed.code = "92"; indexed.sections = [];
    indexed.sourceId = indexed.relativePath = "Functies/Portfolio 92 Bron";
    indexed.sourceTheme = { sourceId: "Functies", name: "Functies", relativePath: "Functies" };
    await persistIndex([indexed], "local", "space-6");
    expect((await getAdminPortfolios("space-6")).find((item) => item.code === "92")!.id).not.toBe(old.id);
    expect(await getThemes("space-6")).toHaveLength(2);
  });

  it("rolls back a native rename and theme creation if a later publication statement fails", async () => {
    const database = await setup();
    const indexed = themed(); await persistIndex([indexed], "onedrive", "space-6");
    const before = await state();
    indexed.code = "92"; indexed.sourceTheme = { sourceId: "new-theme", name: "Nieuw", relativePath: "Nieuw" };
    await database.execute("CREATE TRIGGER reject_rename_validation BEFORE UPDATE ON learning_space_sources BEGIN SELECT RAISE(ABORT, 'fixture failure'); END");
    const source = (await getActiveLearningSpaceSource("space-6"))!;
    await expect(persistIndex([indexed], "onedrive", "space-6", { sourceId: source.id })).rejects.toThrow();
    expect(await state()).toEqual(before);
  });

  it("reports an identity conflict through existing sync failure handling and retains the last published entities", async () => {
    const database = await setup();
    const indexed = sourceBindingFixture(); await persistIndex([indexed], "onedrive", "space-6");
    const entities = (await state()).slice(0, 11);
    const source = (await getActiveLearningSpaceSource("space-6"))!;
    indexed.sourceId = "replacement";
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(synchronizeSource("space-6", {
      getConfiguredProvider: async () => ({ type: "onedrive", space: (await getLearningSpace("space-6"))!,
        source, provider: { id: "onedrive", list: async () => [], readFile: async () => Buffer.alloc(0) } }),
      index: async () => [indexed],
    })).rejects.toThrow("bronidentiteit");
    expect((await state()).slice(0, 11)).toEqual(entities);
    expect((await database.execute("SELECT last_validation_status FROM learning_space_sources WHERE id = 'space-6:primary'")).rows[0]).toMatchObject({ last_validation_status: "invalid" });
    expect((await database.execute("SELECT status FROM sync_runs ORDER BY started_at DESC")).rows).toContainEqual({ status: "failed" });
  });
});
