import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const postgresMocks = vi.hoisted(() => ({
  begin: vi.fn(),
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
    postgresMocks.begin.mockImplementation(async (work: (transaction: { unsafe: typeof postgresMocks.transactionUnsafe }) => unknown) => (
      work({ unsafe: postgresMocks.transactionUnsafe })
    ));
    postgresMocks.reservedUnsafe.mockImplementation(async (sql: string) => {
      if (sql === "SELECT version FROM schema_migrations") {
        return migrations.map((migration) => ({ version: migration.version }));
      }
      return [];
    });
    postgresMocks.reserve.mockResolvedValue({
      begin: postgresMocks.begin,
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
});
