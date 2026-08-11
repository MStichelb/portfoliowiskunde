import { createClient, type Client, type InStatement } from "@libsql/client";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

let clientPromise: Promise<Client> | undefined;

const schema = [
  `CREATE TABLE IF NOT EXISTS portfolios (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    assignment_pdf_path TEXT,
    final_solutions_pdf_path TEXT,
    visible INTEGER NOT NULL DEFAULT 0,
    is_indexed INTEGER NOT NULL DEFAULT 1,
    indexed_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sections (
    id TEXT PRIMARY KEY,
    portfolio_id TEXT NOT NULL REFERENCES portfolios(id),
    sort_order INTEGER NOT NULL,
    title TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    is_indexed INTEGER NOT NULL DEFAULT 1,
    UNIQUE(portfolio_id, sort_order)
  )`,
  `CREATE TABLE IF NOT EXISTS exercises (
    id TEXT PRIMARY KEY,
    portfolio_id TEXT NOT NULL REFERENCES portfolios(id),
    section_id TEXT NOT NULL REFERENCES sections(id),
    exercise_code TEXT NOT NULL,
    exercise_number INTEGER NOT NULL,
    exercise_suffix TEXT NOT NULL,
    visible INTEGER NOT NULL DEFAULT 0,
    is_indexed INTEGER NOT NULL DEFAULT 1,
    UNIQUE(section_id, exercise_code)
  )`,
  `CREATE TABLE IF NOT EXISTS solution_variants (
    id TEXT PRIMARY KEY,
    exercise_id TEXT NOT NULL REFERENCES exercises(id),
    kind TEXT NOT NULL CHECK(kind IN ('standard', 'alternative')),
    label TEXT NOT NULL,
    UNIQUE(exercise_id, kind)
  )`,
  `CREATE TABLE IF NOT EXISTS solution_assets (
    id TEXT PRIMARY KEY,
    variant_id TEXT NOT NULL REFERENCES solution_variants(id),
    relative_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    extension TEXT NOT NULL,
    step INTEGER NOT NULL,
    UNIQUE(variant_id, relative_path)
  )`,
  `CREATE TABLE IF NOT EXISTS sync_runs (
    id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    portfolio_count INTEGER NOT NULL DEFAULT 0,
    warning_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sync_warnings (
    id TEXT PRIMARY KEY,
    sync_run_id TEXT NOT NULL REFERENCES sync_runs(id),
    severity TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    message TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
];

export async function getDatabase(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = createDatabaseClient();
  }
  return clientPromise;
}

async function createDatabaseClient(): Promise<Client> {
  const databasePath = process.env.PORTFOLIO_DATABASE_PATH
    ? path.resolve(process.env.PORTFOLIO_DATABASE_PATH)
    : path.join(process.cwd(), ".data", "portfolio.db");
  await mkdir(path.dirname(databasePath), { recursive: true });
  const client = createClient({ url: pathToFileURL(databasePath).href });
  await client.batch(schema.map((sql) => ({ sql, args: [] })), "write");
  return client;
}

export async function executeBatch(statements: InStatement[]): Promise<void> {
  const database = await getDatabase();
  await database.batch(statements, "write");
}
