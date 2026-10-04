import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const postgresMocks = vi.hoisted(() => ({
  begin: vi.fn(),
  poolTransactionEvents: [] as string[],
  poolUnsafe: vi.fn(),
  release: vi.fn(),
  reserve: vi.fn(),
  reservedUnsafe: vi.fn(),
  transactionUnsafe: vi.fn(),
}));

vi.mock("postgres", () => ({
  default: vi.fn(() => ({
    begin: postgresMocks.begin,
    reserve: postgresMocks.reserve,
    unsafe: postgresMocks.poolUnsafe,
  })),
}));

import { getDatabase, resetDatabaseForTests } from "./database";
import { migrations } from "./database-migrations";

describe("PostgreSQL migration locking", () => {
  beforeEach(() => {
    postgresMocks.poolUnsafe.mockReset();
    postgresMocks.reservedUnsafe.mockReset();
    postgresMocks.release.mockReset();
    postgresMocks.begin.mockReset();
    postgresMocks.reserve.mockReset();
    postgresMocks.transactionUnsafe.mockReset();
    postgresMocks.poolTransactionEvents.length = 0;
    postgresMocks.begin.mockImplementation(async (work: (transaction: { unsafe: typeof postgresMocks.transactionUnsafe }) => unknown) => {
      postgresMocks.poolTransactionEvents.push("BEGIN");
      try {
        const result = await work({ unsafe: postgresMocks.transactionUnsafe });
        postgresMocks.poolTransactionEvents.push("COMMIT");
        return result;
      } catch (error) {
        postgresMocks.poolTransactionEvents.push("ROLLBACK");
        throw error;
      }
    });
    postgresMocks.reservedUnsafe.mockImplementation(async (sql: string) => {
      if (sql === "SELECT version FROM schema_migrations") {
        return migrations.map((migration) => ({ version: migration.version }));
      }
      return [];
    });
    postgresMocks.reserve.mockResolvedValue({
      release: postgresMocks.release,
      unsafe: postgresMocks.reservedUnsafe,
    });
    vi.stubEnv("DATABASE_URL", "postgresql://example.invalid/portfolio");
    vi.stubEnv("NODE_ENV", "test");
    resetDatabaseForTests();
  });

  afterEach(() => {
    resetDatabaseForTests();
    vi.unstubAllEnvs();
  });

  it("runs the lock, migration checks and unlock on one reserved session", async () => {
    await getDatabase();

    expect(postgresMocks.reserve).toHaveBeenCalledOnce();
    expect(postgresMocks.poolUnsafe).not.toHaveBeenCalled();
    expect(postgresMocks.reservedUnsafe.mock.calls.map(([sql]) => sql)).toEqual([
      "SELECT pg_advisory_lock(741824936501)",
      "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
      "SELECT version FROM schema_migrations",
      "SELECT pg_advisory_unlock(741824936501)",
    ]);
    expect(postgresMocks.release).toHaveBeenCalledOnce();
  });

  it("runs a pending migration transaction on the locked reserved session", async () => {
    const pendingMigration = migrations.at(-1)!;
    postgresMocks.reservedUnsafe.mockImplementation(async (sql: string) => {
      if (sql === "SELECT version FROM schema_migrations") {
        return migrations.slice(0, -1).map((migration) => ({ version: migration.version }));
      }
      return [];
    });

    await getDatabase();

    expect(postgresMocks.begin).not.toHaveBeenCalled();
    expect(postgresMocks.poolUnsafe).not.toHaveBeenCalled();
    expect(postgresMocks.reservedUnsafe.mock.calls.map(([sql]) => sql)).toEqual([
      "SELECT pg_advisory_lock(741824936501)",
      "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
      "SELECT version FROM schema_migrations",
      "BEGIN",
      ...(pendingMigration.postgresStatements ?? pendingMigration.statements),
      "INSERT INTO schema_migrations (version, applied_at) VALUES ($1, $2)",
      "COMMIT",
      "SELECT pg_advisory_unlock(741824936501)",
    ]);
    expect(postgresMocks.release).toHaveBeenCalledOnce();
  });

  it("rolls back a failed migration before unlocking and releasing the reserved session", async () => {
    const pendingMigration = migrations.at(-1)!;
    const statements = pendingMigration.postgresStatements ?? pendingMigration.statements;
    const failure = new Error("migration statement failed");
    postgresMocks.reservedUnsafe.mockImplementation(async (sql: string) => {
      if (sql === "SELECT version FROM schema_migrations") {
        return migrations.slice(0, -1).map((migration) => ({ version: migration.version }));
      }
      if (sql === statements[1]) throw failure;
      return [];
    });

    await expect(getDatabase()).rejects.toBe(failure);

    expect(postgresMocks.begin).not.toHaveBeenCalled();
    expect(postgresMocks.poolUnsafe).not.toHaveBeenCalled();
    expect(postgresMocks.reservedUnsafe.mock.calls.map(([sql]) => sql)).toEqual([
      "SELECT pg_advisory_lock(741824936501)",
      "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
      "SELECT version FROM schema_migrations",
      "BEGIN",
      statements[0],
      statements[1],
      "ROLLBACK",
      "SELECT pg_advisory_unlock(741824936501)",
    ]);
    expect(postgresMocks.release).toHaveBeenCalledOnce();
  });

  it("unlocks and releases the reserved session when migration initialization fails", async () => {
    postgresMocks.reservedUnsafe.mockImplementation(async (sql: string) => {
      if (sql === "SELECT version FROM schema_migrations") throw new Error("temporary database failure");
      return [];
    });

    await expect(getDatabase()).rejects.toThrow("temporary database failure");

    expect(postgresMocks.reservedUnsafe).toHaveBeenCalledWith("SELECT pg_advisory_unlock(741824936501)", []);
    expect(postgresMocks.release).toHaveBeenCalledOnce();
  });

  it("executes a guarded publication in one PostgreSQL transaction and skips writes when the fence fails", async () => {
    const database = await getDatabase();
    postgresMocks.transactionUnsafe
      .mockResolvedValueOnce([{ owner_id: "current-owner" }])
      .mockResolvedValueOnce([]);

    await expect(database.guardedBatch(
      { sql: "UPDATE sync_leases SET acquired_until = ? WHERE owner_id = ? RETURNING owner_id", args: ["later", "current-owner"] },
      [{ sql: "UPDATE portfolios SET is_indexed = ? WHERE learning_space_id = ?", args: [1, "space-5"] }],
    )).resolves.toBe(true);
    expect(postgresMocks.transactionUnsafe).toHaveBeenNthCalledWith(1,
      "UPDATE sync_leases SET acquired_until = $1 WHERE owner_id = $2 RETURNING owner_id", ["later", "current-owner"]);
    expect(postgresMocks.transactionUnsafe).toHaveBeenNthCalledWith(2,
      "UPDATE portfolios SET is_indexed = $1 WHERE learning_space_id = $2", [1, "space-5"]);

    postgresMocks.transactionUnsafe.mockReset().mockResolvedValueOnce([]);
    await expect(database.guardedBatch(
      { sql: "UPDATE sync_leases SET acquired_until = ? WHERE owner_id = ? RETURNING owner_id", args: ["later", "stale-owner"] },
      [{ sql: "UPDATE portfolios SET is_indexed = 0", args: [] }],
    )).resolves.toBe(false);
    expect(postgresMocks.transactionUnsafe).toHaveBeenCalledOnce();
  });

  it("uses postgres.js transactions for ordinary pooled batches", async () => {
    const database = await getDatabase();
    postgresMocks.transactionUnsafe.mockResolvedValue([]);
    postgresMocks.poolTransactionEvents.length = 0;

    await database.batch([
      { sql: "UPDATE portfolios SET is_indexed = ? WHERE id = ?", args: [1, "portfolio-1"] },
      { sql: "UPDATE sections SET is_indexed = ? WHERE portfolio_id = ?", args: [1, "portfolio-1"] },
    ]);

    expect(postgresMocks.poolTransactionEvents).toEqual(["BEGIN", "COMMIT"]);
    expect(postgresMocks.transactionUnsafe).toHaveBeenNthCalledWith(1,
      "UPDATE portfolios SET is_indexed = $1 WHERE id = $2", [1, "portfolio-1"]);
    expect(postgresMocks.transactionUnsafe).toHaveBeenNthCalledWith(2,
      "UPDATE sections SET is_indexed = $1 WHERE portfolio_id = $2", [1, "portfolio-1"]);
    expect(postgresMocks.poolUnsafe).not.toHaveBeenCalled();
  });

  it("lets postgres.js roll back an ordinary pooled batch failure", async () => {
    const database = await getDatabase();
    const failure = new Error("pooled statement failed");
    postgresMocks.transactionUnsafe
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(failure);
    postgresMocks.poolTransactionEvents.length = 0;

    await expect(database.batch([
      { sql: "UPDATE portfolios SET is_indexed = 1", args: [] },
      { sql: "UPDATE sections SET is_indexed = 1", args: [] },
    ])).rejects.toBe(failure);

    expect(postgresMocks.poolTransactionEvents).toEqual(["BEGIN", "ROLLBACK"]);
    expect(postgresMocks.poolUnsafe).not.toHaveBeenCalled();
  });
});
