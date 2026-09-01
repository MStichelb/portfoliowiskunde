import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { clearFailedLogins, createSessionToken, getAuthenticationProblem, isLoginRateLimited, isValidPassword, isValidSessionToken, recordFailedLogin } from "./auth";
import { resetDatabaseForTests } from "./database";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  vi.unstubAllEnvs();
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

describe("admin session tokens", () => {
  it("behoudt de bestaande password-fallback", () => {
    vi.stubEnv("ADMIN_PASSWORD", "compatibility-password");
    expect(isValidPassword("compatibility-password")).toBe(true);
    expect(isValidPassword("wrong-password")).toBe(false);
  });

  it("fails closed for weak production secrets", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_PASSWORD", "");
    vi.stubEnv("ADMIN_SESSION_SECRET", "");
    expect(getAuthenticationProblem()).toContain("ADMIN_PASSWORD");
    vi.stubEnv("ADMIN_PASSWORD", "too-short");
    expect(getAuthenticationProblem()).toContain("16 tekens");
    vi.stubEnv("ADMIN_PASSWORD", "a-strong-admin-password");
    vi.stubEnv("ADMIN_SESSION_SECRET", "too-short");
    expect(getAuthenticationProblem()).toContain("32 tekens");
    vi.stubEnv("ADMIN_SESSION_SECRET", "a-session-secret-that-is-long-enough");
    expect(getAuthenticationProblem()).toBeNull();
  });

  it("accepteert een geldig getekend token", () => {
    const now = 1_700_000_000_000;
    expect(isValidSessionToken(createSessionToken("test-secret", now), "test-secret", now)).toBe(true);
  });

  it("weigert gewijzigde, verlopen en verkeerd ondertekende tokens", () => {
    const now = 1_700_000_000_000;
    const token = createSessionToken("test-secret", now);
    expect(isValidSessionToken(`${token}x`, "test-secret", now)).toBe(false);
    expect(isValidSessionToken(token, "other-secret", now)).toBe(false);
    expect(isValidSessionToken(token, "test-secret", now + 60 * 60 * 13 * 1000)).toBe(false);
  });

  it("beperkt herhaalde mislukte logins en wist de teller na een geldige login", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-auth-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    resetDatabaseForTests();
    const now = new Date("2026-08-12T10:00:00.000Z");
    for (let attempt = 0; attempt < 8; attempt += 1) await recordFailedLogin("visitor", now);
    expect(await isLoginRateLimited("visitor", now)).toBe(true);
    await clearFailedLogins("visitor");
    expect(await isLoginRateLimited("visitor", now)).toBe(false);
  });
});
