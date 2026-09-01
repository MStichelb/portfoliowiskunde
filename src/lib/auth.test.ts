import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { clearFailedLogins, createBreakGlassSession, createSessionToken, createUserSession, getAuthenticationProblem, isLoginRateLimited, isValidPassword, isValidSessionToken, recordFailedLogin, refreshUserSession, resolveUserSession, revokeUserSession, SESSION_MAX_AGE_SECONDS, sessionCookieOptions } from "./auth";
import { getDatabase, resetDatabaseForTests } from "./database";
import { createUser } from "./identity";

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

  it("kan via break-glass uitsluitend de compatibility-superadmin aanmelden", async () => {
    await useTemporaryDatabase();
    vi.stubEnv("ADMIN_SESSION_SECRET", "a-session-secret-that-is-long-enough");
    await createUser({ displayName: "Andere hoofdbeheerder", role: "superadmin" });
    const session = await createBreakGlassSession(Date.parse("2026-09-01T08:00:00.000Z"));
    expect((await resolveUserSession(session.token, Date.parse("2026-09-02T08:00:00.000Z")))?.id).toBe("user-legacy-superadmin");
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
    expect(isValidSessionToken(token, "test-secret", now + (SESSION_MAX_AGE_SECONDS + 1) * 1000)).toBe(false);
  });

  it("houdt een interne sessie dertig dagen geldig over meerdere bezoeken", async () => {
    await useTemporaryDatabase();
    vi.stubEnv("ADMIN_SESSION_SECRET", "a-session-secret-that-is-long-enough");
    const user = await createUser({ displayName: "Lange sessie", role: "student" });
    const now = Date.parse("2026-09-01T08:00:00.000Z");
    const session = await createUserSession(user.id, now);
    expect(session.maxAge).toBe(30 * 24 * 60 * 60);
    expect((await resolveUserSession(session.token, now + 10 * 24 * 60 * 60 * 1000))?.id).toBe(user.id);
    expect((await resolveUserSession(session.token, now + 29 * 24 * 60 * 60 * 1000))?.id).toBe(user.id);
  });

  it("vernieuwt een actief gebruikte sessie rolling zonder een nieuwe login", async () => {
    await useTemporaryDatabase();
    vi.stubEnv("ADMIN_SESSION_SECRET", "a-session-secret-that-is-long-enough");
    const user = await createUser({ displayName: "Actieve leerling", role: "student" });
    const now = Date.parse("2026-09-01T08:00:00.000Z");
    const session = await createUserSession(user.id, now);
    expect(await refreshUserSession(session.token, now + 14 * 24 * 60 * 60 * 1000)).toBeNull();
    const refreshed = await refreshUserSession(session.token, now + 16 * 24 * 60 * 60 * 1000);
    expect(refreshed).not.toBeNull();
    expect((await resolveUserSession(refreshed!.token, now + 40 * 24 * 60 * 60 * 1000))?.id).toBe(user.id);
  });

  it("past disabled status en lokale rolwijzigingen direct toe op een bestaande cookie", async () => {
    await useTemporaryDatabase();
    vi.stubEnv("ADMIN_SESSION_SECRET", "a-session-secret-that-is-long-enough");
    const user = await createUser({ displayName: "Lokale rol", role: "student" });
    const now = Date.parse("2026-09-01T08:00:00.000Z");
    const session = await createUserSession(user.id, now);
    await (await getDatabase()).execute({ sql: "UPDATE users SET role = 'teacher' WHERE id = ?", args: [user.id] });
    expect((await resolveUserSession(session.token, now + 1_000))?.role).toBe("teacher");
    await (await getDatabase()).execute({ sql: "UPDATE users SET status = 'disabled' WHERE id = ?", args: [user.id] });
    expect(await resolveUserSession(session.token, now + 2_000)).toBeNull();
  });

  it("trekt een sessie onmiddellijk in bij uitloggen", async () => {
    await useTemporaryDatabase();
    vi.stubEnv("ADMIN_SESSION_SECRET", "a-session-secret-that-is-long-enough");
    const user = await createUser({ displayName: "Uitloggen", role: "student" });
    const now = Date.parse("2026-09-01T08:00:00.000Z");
    const session = await createUserSession(user.id, now);
    await revokeUserSession(session.token);
    expect(await resolveUserSession(session.token, now + 1_000)).toBeNull();
  });

  it("gebruikt veilige cookie-opties voor de langdurige app-sessie", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookieOptions()).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 30 * 24 * 60 * 60 });
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

async function useTemporaryDatabase(): Promise<void> {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-auth-"));
  process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
  resetDatabaseForTests();
}
