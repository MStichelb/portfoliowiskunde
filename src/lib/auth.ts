import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import { getDatabase } from "@/lib/database";
import { canAccessAdmin } from "@/lib/authorization";
import { getUser, LEGACY_SUPERADMIN_USER_ID, type AppUser } from "@/lib/identity";
import { redirect } from "next/navigation";

export const SESSION_COOKIE = "portfolio_admin_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const SESSION_REFRESH_AFTER_SECONDS = 60 * 60 * 24 * 15;

interface SessionPayload {
  exp: number;
  sid?: string;
}

function getPassword(): string | null {
  return process.env.ADMIN_PASSWORD?.trim() || null;
}

function signingSecret(): string | null {
  return process.env.ADMIN_SESSION_SECRET?.trim() || getPassword();
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function getAuthenticationProblem(): string | null {
  if (!getPassword()) return "ADMIN_PASSWORD ontbreekt.";
  if (process.env.NODE_ENV === "production" && getPassword()!.length < 16) return "ADMIN_PASSWORD moet in productie minstens 16 tekens lang zijn.";
  if (process.env.NODE_ENV === "production" && !process.env.ADMIN_SESSION_SECRET?.trim()) return "ADMIN_SESSION_SECRET ontbreekt.";
  if (process.env.NODE_ENV === "production" && process.env.ADMIN_SESSION_SECRET!.trim().length < 32) return "ADMIN_SESSION_SECRET moet in productie minstens 32 tekens lang zijn.";
  return null;
}

export function isValidPassword(candidate: string): boolean {
  const password = getPassword();
  if (!password) return false;
  const candidateBytes = Buffer.from(candidate);
  const passwordBytes = Buffer.from(password);
  return candidateBytes.length === passwordBytes.length && timingSafeEqual(candidateBytes, passwordBytes);
}

export function createSessionToken(secret: string, now = Date.now(), sessionId: string = randomUUID()): string {
  const payload = Buffer.from(JSON.stringify({ exp: now + SESSION_MAX_AGE_SECONDS * 1000, sid: sessionId } satisfies SessionPayload)).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function isValidSessionToken(token: string | undefined, secret: string | null, now = Date.now()): boolean {
  if (!token || !secret) return false;
  const [payload, providedSignature, extra] = token.split(".");
  if (!payload || !providedSignature || extra) return false;
  const expectedSignature = signature(payload, secret);
  const providedBytes = Buffer.from(providedSignature);
  const expectedBytes = Buffer.from(expectedSignature);
  if (providedBytes.length !== expectedBytes.length || !timingSafeEqual(providedBytes, expectedBytes)) return false;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionPayload;
    return typeof parsed.exp === "number" && parsed.exp > now;
  } catch {
    return false;
  }
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const user = await getAuthenticatedUser();
  return Boolean(user && user.role === "superadmin");
}

export async function isAdminUserAuthenticated(): Promise<boolean> {
  return canAccessAdmin(await getAuthenticatedUser());
}

export async function getAuthenticatedUser(): Promise<AppUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  return resolveUserSession(token);
}

export async function resolveUserSession(token: string | undefined, now = Date.now()): Promise<AppUser | null> {
  if (!isValidSessionToken(token, signingSecret(), now)) return null;
  const sessionId = sessionIdFromToken(token);
  if (!sessionId) return null;
  const session = await (await getDatabase()).execute({
    sql: "SELECT user_id FROM admin_sessions WHERE id = ? AND expires_at > ?",
    args: [sessionId, new Date(now).toISOString()],
  });
  const userId = session.rows[0]?.user_id;
  if (typeof userId !== "string" || !userId) return null;
  const user = await getUser(userId);
  return user?.status === "active" ? user : null;
}

export async function requireAuthenticatedUser(): Promise<AppUser> {
  const user = await getAuthenticatedUser();
  if (user?.status !== "active") redirect("/aanmelden");
  return user;
}

export async function requireAdminUser(): Promise<AppUser> {
  const user = await getAuthenticatedUser();
  if (!canAccessAdmin(user)) redirect("/admin/login");
  return user!;
}

export async function requireAdmin(): Promise<AppUser> {
  const user = await getAuthenticatedUser();
  if (user?.role !== "superadmin") redirect("/admin/login");
  return user;
}

export async function startAdminSession(): Promise<void> {
  const session = await createBreakGlassSession();
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, session.token, sessionCookieOptions());
}

export async function createBreakGlassSession(now = Date.now()): Promise<{ token: string; maxAge: number }> {
  const user = await getUser(LEGACY_SUPERADMIN_USER_ID);
  if (!user || user.status !== "active" || user.role !== "superadmin") throw new Error("De beheeraccount is niet beschikbaar.");
  return createUserSession(LEGACY_SUPERADMIN_USER_ID, now);
}

export async function startUserSession(userId: string): Promise<void> {
  const session = await createUserSession(userId);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, session.token, sessionCookieOptions());
}

export async function createUserSession(userId: string, now = Date.now()): Promise<{ token: string; maxAge: number }> {
  const secret = signingSecret();
  if (!secret) throw new Error("De sessieconfiguratie ontbreekt.");
  const user = await getUser(userId);
  if (!user || user.status !== "active") throw new Error("Deze gebruiker kan niet worden aangemeld.");
  const sessionId = randomUUID();
  await (await getDatabase()).batch([
    { sql: "DELETE FROM admin_sessions WHERE expires_at <= ?", args: [new Date(now).toISOString()] },
    { sql: "INSERT INTO admin_sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)", args: [sessionId, userId, new Date(now + SESSION_MAX_AGE_SECONDS * 1000).toISOString(), new Date(now).toISOString()] },
  ]);
  return { token: createSessionToken(secret, now, sessionId), maxAge: SESSION_MAX_AGE_SECONDS };
}

export async function refreshUserSession(token: string | undefined, now = Date.now()): Promise<{ token: string; maxAge: number } | null> {
  const secret = signingSecret();
  if (!secret || !isValidSessionToken(token, secret, now)) return null;
  const payload = sessionPayloadFromToken(token);
  if (!payload?.sid) return null;
  const user = await resolveUserSession(token, now);
  if (!user) return null;
  if (payload.exp - now > SESSION_REFRESH_AFTER_SECONDS * 1000) return null;
  const expiresAt = new Date(now + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  await (await getDatabase()).execute({
    sql: "UPDATE admin_sessions SET expires_at = ? WHERE id = ? AND user_id = ?",
    args: [expiresAt, payload.sid, user.id],
  });
  return { token: createSessionToken(secret, now, payload.sid), maxAge: SESSION_MAX_AGE_SECONDS };
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export async function endAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  await revokeUserSession(cookieStore.get(SESSION_COOKIE)?.value);
  cookieStore.set(SESSION_COOKIE, "", { httpOnly: true, maxAge: 0, path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production" });
}

export const endUserSession = endAdminSession;

export async function revokeUserSession(token: string | undefined): Promise<void> {
  const sessionId = sessionIdFromToken(token);
  if (sessionId) await (await getDatabase()).execute({ sql: "DELETE FROM admin_sessions WHERE id = ?", args: [sessionId] });
}

function sessionIdFromToken(token: string | undefined): string | null {
  return sessionPayloadFromToken(token)?.sid ?? null;
}

function sessionPayloadFromToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  try {
    const payload = token.split(".")[0];
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionPayload;
    if (typeof parsed.exp !== "number") return null;
    return { exp: parsed.exp, sid: typeof parsed.sid === "string" && parsed.sid ? parsed.sid : undefined };
  } catch {
    return null;
  }
}

export function recordBreakGlassLoginEvent(outcome: "success" | "invalid" | "rate-limited", visitorKey: string): void {
  const detail = { outcome, visitor: visitorKey.slice(0, 12) };
  if (outcome === "success") console.info("Break-glass admin login.", detail);
  else console.warn("Break-glass admin login geweigerd.", detail);
}

export async function isLoginRateLimited(key: string, now = new Date()): Promise<boolean> {
  const database = await getDatabase();
  const row = (await database.execute({ sql: "SELECT window_started_at, attempts FROM admin_login_attempts WHERE key = ?", args: [key] })).rows[0];
  if (!row) return false;
  const startedAt = Date.parse(String(row.window_started_at));
  return Number.isFinite(startedAt) && now.getTime() - startedAt < 10 * 60 * 1000 && Number(row.attempts) >= 8;
}

export async function recordFailedLogin(key: string, now = new Date()): Promise<void> {
  const database = await getDatabase();
  const windowStartedAt = new Date(Math.floor(now.getTime() / (10 * 60 * 1000)) * 10 * 60 * 1000).toISOString();
  await database.batch([
    { sql: "DELETE FROM admin_login_attempts WHERE window_started_at < ?", args: [new Date(now.getTime() - 60 * 60 * 1000).toISOString()] },
    { sql: `INSERT INTO admin_login_attempts (key, window_started_at, attempts) VALUES (?, ?, 1)
      ON CONFLICT(key) DO UPDATE SET attempts = CASE WHEN admin_login_attempts.window_started_at = excluded.window_started_at THEN admin_login_attempts.attempts + 1 ELSE 1 END, window_started_at = excluded.window_started_at`, args: [key, windowStartedAt] },
  ]);
}

export async function clearFailedLogins(key: string): Promise<void> {
  await (await getDatabase()).execute({ sql: "DELETE FROM admin_login_attempts WHERE key = ?", args: [key] });
}

export function loginRateLimitKey(visitor: string): string {
  const secret = signingSecret();
  return secret ? signature(visitor, secret) : visitor;
}
