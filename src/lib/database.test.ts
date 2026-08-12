import { describe, expect, it } from "vitest";

import { getDatabaseConfigurationProblem } from "./database";

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
});
