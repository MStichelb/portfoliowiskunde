import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { canAccessAdmin } from "./authorization";
import { resetDatabaseForTests } from "./database";
import { canAccessPublicLearningSpace, getPublicEmergencyAccess, getPubliclyAccessibleLearningSpaceIds, setPublicEmergencyAccess } from "./public-access";

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

describe("public emergency access", () => {
  it("is persistent and off by default", async () => {
    await useTemporaryDatabase();
    expect(await getPublicEmergencyAccess()).toEqual({ enabled: false, enabledAt: null });
    const enabled = await setPublicEmergencyAccess(true, new Date("2026-09-02T08:30:00.000Z"));
    expect(enabled).toEqual({ enabled: true, enabledAt: "2026-09-02T08:30:00.000Z" });
    expect(await getPublicEmergencyAccess()).toEqual(enabled);
  });

  it("allows only active public LearningSpaces without a session while enabled", async () => {
    await useTemporaryDatabase();
    expect(await canAccessPublicLearningSpace(null, "space-5")).toBe(false);
    await setPublicEmergencyAccess(true);
    expect(await canAccessPublicLearningSpace(null, "space-5")).toBe(true);
    expect(await canAccessPublicLearningSpace(null, "missing-space")).toBe(false);
    expect(await getPubliclyAccessibleLearningSpaceIds(null)).toContain("space-5");
  });

  it("does not weaken admin authorization", async () => {
    await useTemporaryDatabase();
    await setPublicEmergencyAccess(true);
    expect(canAccessAdmin(null)).toBe(false);
    expect(canAccessAdmin({ id: "student", displayName: "Leerling", firstName: null, lastName: null, email: null, role: "student", status: "active", classGroupOverrideId: null })).toBe(false);
  });
});

async function useTemporaryDatabase(): Promise<void> {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-emergency-access-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
}
