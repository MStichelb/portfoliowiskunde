import { createClient, type InValue } from "@libsql/client";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

import { migrations } from "@/lib/database-migrations";

export interface InStatement {
  sql: string;
  args?: InValue[];
}

export type DatabaseRow = Record<string, unknown>;

export interface QueryResult {
  rows: DatabaseRow[];
}

export interface DatabaseClient {
  execute(statement: string | InStatement): Promise<QueryResult>;
  batch(statements: InStatement[]): Promise<void>;
}

let clientPromise: Promise<DatabaseClient> | undefined;

export async function getDatabase(): Promise<DatabaseClient> {
  if (!clientPromise) clientPromise = createDatabaseClient();
  return clientPromise;
}

async function createDatabaseClient(): Promise<DatabaseClient> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const client = databaseUrl?.startsWith("postgres://") || databaseUrl?.startsWith("postgresql://")
    ? createPostgresClient(databaseUrl)
    : await createLibsqlClient(databaseUrl);

  await runMigrations(client);
  return client;
}

async function createLibsqlClient(databaseUrl?: string): Promise<DatabaseClient> {
  const configuredUrl = databaseUrl || process.env.TURSO_DATABASE_URL?.trim();
  const url = configuredUrl || await localDatabaseUrl();
  const client = createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN?.trim() || process.env.TURSO_AUTH_TOKEN?.trim(),
  });

  return {
    async execute(statement) {
      const query = normaliseStatement(statement);
      const result = await client.execute({ sql: query.sql, args: query.args ?? [] });
      return { rows: result.rows as DatabaseRow[] };
    },
    async batch(statements) {
      if (statements.length === 0) return;
      await client.batch(statements.map((statement) => ({ sql: statement.sql, args: statement.args ?? [] })), "write");
    },
  };
}

function createPostgresClient(connectionString: string): DatabaseClient {
  const client = postgres(connectionString, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });

  return {
    async execute(statement) {
      const query = normaliseStatement(statement);
      const rows = await client.unsafe(toPostgresParameters(query.sql), (query.args ?? []) as never[]);
      return { rows: rows as unknown as DatabaseRow[] };
    },
    async batch(statements) {
      if (statements.length === 0) return;
      await client.begin(async (transaction) => {
        for (const statement of statements) {
          await transaction.unsafe(toPostgresParameters(statement.sql), (statement.args ?? []) as never[]);
        }
      });
    },
  };
}

function normaliseStatement(statement: string | InStatement): InStatement {
  return typeof statement === "string" ? { sql: statement, args: [] } : statement;
}

function toPostgresParameters(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

async function localDatabaseUrl(): Promise<string> {
  const databasePath = process.env.PORTFOLIO_DATABASE_PATH
    ? path.resolve(process.env.PORTFOLIO_DATABASE_PATH)
    : path.join(process.cwd(), ".data", "portfolio.db");
  await mkdir(path.dirname(databasePath), { recursive: true });
  return `file:${databasePath.replace(/\\/g, "/")}`;
}

async function runMigrations(database: DatabaseClient): Promise<void> {
  await database.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const applied = await database.execute("SELECT version FROM schema_migrations");
  const knownVersions = new Set(applied.rows.map((row) => String(row.version)));

  for (const migration of migrations) {
    if (knownVersions.has(migration.version)) continue;
    await database.batch([
      ...migration.statements.map((sql) => ({ sql, args: [] })),
      { sql: "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", args: [migration.version, new Date().toISOString()] },
    ]);
  }
}

export async function executeBatch(statements: InStatement[]): Promise<void> {
  await (await getDatabase()).batch(statements);
}

export function resetDatabaseForTests() {
  clientPromise = undefined;
}
