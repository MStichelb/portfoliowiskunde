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
  guardedBatch(guard: InStatement, statements: InStatement[]): Promise<boolean>;
  withMigrationLock?(work: (database: DatabaseClient) => Promise<void>): Promise<void>;
}

let clientPromise: Promise<DatabaseClient> | undefined;
let localClient: ReturnType<typeof createClient> | undefined;
const POSTGRES_MIGRATION_LOCK_ID = "741824936501";

export function getDatabase(): Promise<DatabaseClient> {
  if (!clientPromise) {
    const initialization = createDatabaseClient();
    clientPromise = initialization;
    void initialization.catch(() => {
      if (clientPromise === initialization) clientPromise = undefined;
    });
  }
  return clientPromise;
}

async function createDatabaseClient(): Promise<DatabaseClient> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const configurationProblem = getDatabaseConfigurationProblem();
  if (configurationProblem) throw new Error(configurationProblem);
  const isPostgres = databaseUrl?.startsWith("postgres://") || databaseUrl?.startsWith("postgresql://");
  const client = isPostgres
    ? createPostgresClient(databaseUrl!)
    : await createLibsqlClient(databaseUrl);

  await runMigrations(client, Boolean(isPostgres));
  return client;
}

export function getDatabaseConfigurationProblem(environment: NodeJS.ProcessEnv = process.env): string | null {
  if (environment.NODE_ENV !== "production") return null;
  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) return "DATABASE_URL ontbreekt; productie gebruikt nooit een lokale databasefile.";
  if (!databaseUrl.startsWith("postgres://") && !databaseUrl.startsWith("postgresql://")) {
    return "DATABASE_URL moet in productie naar PostgreSQL verwijzen.";
  }
  return null;
}

async function createLibsqlClient(databaseUrl?: string): Promise<DatabaseClient> {
  const configuredUrl = databaseUrl || process.env.TURSO_DATABASE_URL?.trim();
  const url = configuredUrl || await localDatabaseUrl();
  const client = createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN?.trim() || process.env.TURSO_AUTH_TOKEN?.trim(),
  });
  localClient = client;

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
    async guardedBatch(guard, statements) {
      const transaction = await client.transaction("write");
      try {
        const result = await transaction.execute({ sql: guard.sql, args: guard.args ?? [] });
        if (result.rows.length === 0) {
          await transaction.rollback();
          return false;
        }
        if (statements.length > 0) {
          await transaction.batch(statements.map((statement) => ({ sql: statement.sql, args: statement.args ?? [] })));
        }
        await transaction.commit();
        return true;
      } catch (error) {
        if (!transaction.closed) await transaction.rollback();
        throw error;
      } finally {
        transaction.close();
      }
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

  const database = createPostgresQueryClient(client, async (work) => {
    const wrapped = await client.begin(async (transaction) => ({ result: await work(transaction) }));
    return wrapped.result;
  });
  return {
    ...database,
    async withMigrationLock(work) {
      const reserved = await client.reserve();
      const reservedDatabase = createPostgresQueryClient(
        reserved,
        (transactionWork) => runReservedPostgresTransaction(reserved, transactionWork),
      );
      try {
        await reservedDatabase.execute(`SELECT pg_advisory_lock(${POSTGRES_MIGRATION_LOCK_ID})`);
        try {
          await work(reservedDatabase);
        } finally {
          await reservedDatabase.execute(`SELECT pg_advisory_unlock(${POSTGRES_MIGRATION_LOCK_ID})`);
        }
      } finally {
        reserved.release();
      }
    },
  };
}

type PostgresQueryExecutor = Pick<ReturnType<typeof postgres>, "unsafe">;
type PostgresTransactionRunner = <T>(work: (transaction: PostgresQueryExecutor) => Promise<T>) => Promise<T>;

function createPostgresQueryClient(client: PostgresQueryExecutor, runTransaction: PostgresTransactionRunner): DatabaseClient {
  return {
    async execute(statement) {
      const query = normaliseStatement(statement);
      const rows = await client.unsafe(toPostgresParameters(query.sql), (query.args ?? []) as never[]);
      return { rows: rows as unknown as DatabaseRow[] };
    },
    async batch(statements) {
      if (statements.length === 0) return;
      await runTransaction(async (transaction) => {
        for (const statement of statements) {
          await transaction.unsafe(toPostgresParameters(statement.sql), (statement.args ?? []) as never[]);
        }
      });
    },
    async guardedBatch(guard, statements) {
      return runTransaction(async (transaction) => {
        const rows = await transaction.unsafe(toPostgresParameters(guard.sql), (guard.args ?? []) as never[]);
        if (rows.length === 0) return false;
        for (const statement of statements) {
          await transaction.unsafe(toPostgresParameters(statement.sql), (statement.args ?? []) as never[]);
        }
        return true;
      });
    },
  };
}

async function runReservedPostgresTransaction<T>(
  client: PostgresQueryExecutor,
  work: (transaction: PostgresQueryExecutor) => Promise<T>,
): Promise<T> {
  await client.unsafe("BEGIN", []);
  try {
    const result = await work(client);
    await client.unsafe("COMMIT", []);
    return result;
  } catch (error) {
    try {
      await client.unsafe("ROLLBACK", []);
    } catch {
      // Preserve the statement or commit error that caused the transaction to fail.
    }
    throw error;
  }
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

async function runMigrations(database: DatabaseClient, isPostgres: boolean): Promise<void> {
  if (isPostgres) {
    if (!database.withMigrationLock) throw new Error("De PostgreSQL-adapter ondersteunt geen migration lock.");
    await database.withMigrationLock((lockedDatabase) => applyMigrations(lockedDatabase, "postgres"));
    return;
  }
  await applyMigrations(database, "sqlite");
}

async function applyMigrations(database: DatabaseClient, dialect: "sqlite" | "postgres"): Promise<void> {
  await database.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const applied = await database.execute("SELECT version FROM schema_migrations");
  const knownVersions = new Set(applied.rows.map((row) => String(row.version)));

  for (const migration of migrations) {
    if (knownVersions.has(migration.version)) continue;
    await assertNoMigrationConflicts(database, migration);
    const statements = dialect === "postgres" ? migration.postgresStatements ?? migration.statements : migration.statements;
    try {
      if (dialect === "sqlite" && migration.sqliteForeignKeysDisabled) await database.execute("PRAGMA foreign_keys = OFF");
      await database.batch([
        ...statements.map((sql) => ({ sql, args: [] })),
        { sql: "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", args: [migration.version, new Date().toISOString()] },
      ]);
    } catch (error) {
      await assertNoMigrationConflicts(database, migration);
      throw error;
    } finally {
      if (dialect === "sqlite" && migration.sqliteForeignKeysDisabled) await database.execute("PRAGMA foreign_keys = ON");
    }
    if (dialect === "sqlite" && migration.sqliteForeignKeysDisabled) {
      const violations = await database.execute("PRAGMA foreign_key_check");
      if (violations.rows.length > 0) throw new Error(`Migratie ${migration.version} heeft ongeldige foreign keys achtergelaten: ${JSON.stringify(violations.rows)}.`);
    }
  }
}

async function assertNoMigrationConflicts(database: DatabaseClient, migration: (typeof migrations)[number]): Promise<void> {
  if (!migration.conflictCheck) return;
  const result = await database.execute(migration.conflictCheck.sql);
  if (result.rows.length === 0) return;
  const conflicts = result.rows.map((row) => String(row.conflict)).join("; ");
  throw new Error(`${migration.conflictCheck.message} ${conflicts}`);
}

export async function executeBatch(statements: InStatement[]): Promise<void> {
  await (await getDatabase()).batch(statements);
}

export async function executeGuardedBatch(guard: InStatement, statements: InStatement[]): Promise<boolean> {
  return (await getDatabase()).guardedBatch(guard, statements);
}

export function resetDatabaseForTests() {
  localClient?.close();
  localClient = undefined;
  clientPromise = undefined;
}
