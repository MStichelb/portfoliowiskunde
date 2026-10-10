import { createClient } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getDatabase, resetDatabaseForTests } from "./database";
import { migrations } from "./database-migrations";

let directory: string | undefined;
afterEach(async () => {
  resetDatabaseForTests(); delete process.env.PORTFOLIO_DATABASE_PATH;
  if (directory) {
    try { await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EBUSY") throw error; }
  }
  directory = undefined;
}, 30_000);

describe("source reconciliation release migration integrity", () => {
  it("upgrades populated 059 through 060–062 and reopens through the real migrationrunner without replay or data changes", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "source-release-upgrade-"));
    const file = path.join(directory, "metadata.db");
    const legacy = createClient({ url: `file:${file.replaceAll("\\", "/")}` });
    await legacy.execute("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const migration of migrations.filter((item) => Number(item.version.slice(0, 3)) <= 59)) await legacy.batch([
      ...migration.statements.map((sql) => ({ sql, args: [] })), { sql: "INSERT INTO schema_migrations VALUES (?, 'checkpoint')", args: [migration.version] },
    ], "write");
    await legacy.batch([
      { sql: "INSERT INTO portfolios (id, code, portfolio_code, learning_space_id, title, title_override, relative_path, indexed_at, visible) VALUES ('p', 'space-6:91', '91', 'space-6', 'Bron', 'Eigen titel', 'Bron', 'old', 0)" },
      { sql: "INSERT INTO sections (id, portfolio_id, section_code, sort_order, title, relative_path) VALUES ('s', 'p', '1.1', 1, 'Basis', 'Bron/1.1')" },
      { sql: "INSERT INTO exercises (id, portfolio_id, section_id, exercise_code, exercise_number, exercise_suffix, custom_note) VALUES ('e', 'p', 's', '1', 1, '', 'Bewaar')" },
      { sql: "INSERT INTO solution_variants (id, exercise_id, kind, label) VALUES ('v', 'e', 'standard', 'Standaard')" },
      { sql: "INSERT INTO solution_assets (id, variant_id, relative_path, file_name, extension, step, source_id) VALUES ('a', 'v', 'Bron/1.png', '1.png', 'png', 1, NULL)" },
      { sql: "INSERT INTO source_resource_assets (id, learning_space_id, portfolio_id, exercise_id, resource_scope, resource_id, semantic_role, source_id, relative_path, file_name, extension, step, last_seen_at) VALUES ('g', 'space-6', 'p', 'e', 'exercise', 'worked-solution', 'worked_solution', 'raw-file', 'Bron/1.png', '1.png', 'png', 1, 'old')" },
    ], "write");
    const tables = (await legacy.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'schema_migrations' ORDER BY name")).rows.map((row) => String(row.name));
    const before = await Promise.all(tables.map(async (table) => (await legacy.execute(`SELECT * FROM ${table} ORDER BY 1`)).rows));
    legacy.close();
    process.env.PORTFOLIO_DATABASE_PATH = file; resetDatabaseForTests();
    let database = await getDatabase();
    for (const [index, table] of tables.entries()) {
      const after = (await database.execute(`SELECT * FROM ${table} ORDER BY 1`)).rows;
      if (["source_resource_assets", "solution_assets"].includes(table)) {
        expect(after.map(({ storage_context_key, ...row }) => { expect(storage_context_key).toBeNull(); return row; })).toEqual(before[index]);
      } else expect(after, table).toEqual(before[index]);
    }
    expect((await database.execute("SELECT * FROM source_entity_bindings")).rows).toEqual([]);
    expect((await database.execute("SELECT * FROM source_asset_bindings")).rows).toEqual([]);
    expect((await database.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
    const versions = (await database.execute("SELECT * FROM schema_migrations ORDER BY version")).rows;
    expect(versions.map((row) => row.version)).toEqual(migrations.map((migration) => migration.version));
    const indexes = (await database.execute("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex%' ORDER BY name")).rows;
    expect(indexes.map((row) => row.name)).toEqual(expect.arrayContaining([
      "source_entity_bindings_portfolio_unique", "source_entity_bindings_section_unique", "resource_assets_legacy_identity",
      "resource_assets_scoped_identity", "solution_assets_legacy_path", "solution_assets_scoped_path", "solution_assets_scoped_identity",
    ]));
    const upgradedTables = [...tables, "source_entity_bindings", "source_asset_bindings"];
    const upgraded = await Promise.all(upgradedTables.map((table) => database.execute(`SELECT * FROM ${table} ORDER BY 1`).then((result) => result.rows)));
    resetDatabaseForTests(); database = await getDatabase();
    expect((await database.execute("SELECT * FROM schema_migrations ORDER BY version")).rows).toEqual(versions);
    expect((await database.execute("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex%' ORDER BY name")).rows).toEqual(indexes);
    for (const [index, table] of upgradedTables.entries()) expect((await database.execute(`SELECT * FROM ${table} ORDER BY 1`)).rows, table).toEqual(upgraded[index]);
    expect((await database.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });
});
