import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import { getDatabase } from "@/lib/database";
import { redirect } from "next/navigation";

const SESSION_COOKIE = "portfolio_admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

interface SessionPayload {
  exp: number;
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
  if (process.env.NODE_ENV === "production" && !process.env.ADMIN_SESSION_SECRET?.trim()) return "ADMIN_SESSION_SECRET ontbreekt.";
  return null;
}

export function isValidPassword(candidate: string): boolean {
  const password = getPassword();
  if (!password) return false;
  const candidateBytes = Buffer.from(candidate);
  const passwordBytes = Buffer.from(password);
  return candidateBytes.length === passwordBytes.length && timingSafeEqual(candidateBytes, passwordBytes);
}

export function createSessionToken(secret: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ exp: now + SESSION_MAX_AGE_SECONDS * 1000 } satisfies SessionPayload)).toString("base64url");
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
  const cookieStore = await cookies();
  return isValidSessionToken(cookieStore.get(SESSION_COOKIE)?.value, signingSecret());
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
}

export async function startAdminSession(): Promise<void> {
  const secret = signingSecret();
  if (!secret) throw new Error("De beheerwachtwoordconfiguratie ontbreekt.");
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, createSessionToken(secret), {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function endAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", { httpOnly: true, maxAge: 0, path: "/", sameSite: "lax" });
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
