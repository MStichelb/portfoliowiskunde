import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getDatabase, getDatabaseConfigurationProblem, resetDatabaseForTests } from "./database";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  resetDatabaseForTests();
  vi.unstubAllEnvs();
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

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

describe("production database configuration", () => {
  it("requires PostgreSQL in production", () => {
    expect(getDatabaseConfigurationProblem({ NODE_ENV: "production" })).toContain("DATABASE_URL");
    expect(getDatabaseConfigurationProblem({ NODE_ENV: "production", DATABASE_URL: "file:local.db" })).toContain("PostgreSQL");
    expect(getDatabaseConfigurationProblem({ NODE_ENV: "production", DATABASE_URL: "postgresql://example.invalid/app" })).toBeNull();
  });

  it("keeps the local SQLite workflow available outside production", () => {
    expect(getDatabaseConfigurationProblem({ NODE_ENV: "development" })).toBeNull();
    expect(getDatabaseConfigurationProblem({ NODE_ENV: "test" })).toBeNull();
  });

  it("shares one initialization attempt and permits a later retry after rejection", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "file:invalid-in-production.db");

    const firstAttempt = getDatabase();
    const concurrentAttempt = getDatabase();
    expect(concurrentAttempt).toBe(firstAttempt);
    const outcomes = await Promise.allSettled([firstAttempt, concurrentAttempt]);
    expect(outcomes.every((outcome) => outcome.status === "rejected")).toBe(true);

    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-database-retry-"));
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("PORTFOLIO_DATABASE_PATH", path.join(temporaryDirectory, "metadata.db"));

    await expect(getDatabase()).resolves.toMatchObject({ execute: expect.any(Function), batch: expect.any(Function) });
  });
});
