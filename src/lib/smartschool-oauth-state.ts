import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SMARTSCHOOL_STATE_COOKIE = "portfolio_smartschool_oauth_state";
export const SMARTSCHOOL_STATE_MAX_AGE_SECONDS = 10 * 60;

export type SmartschoolOAuthIntent = "login" | "link";

interface SmartschoolOAuthStatePayload {
  state: string;
  exp: number;
  intent: SmartschoolOAuthIntent;
  returnTo: string | null;
  userId: string | null;
}

export function createSmartschoolOAuthState(
  secret: string,
  input: { intent?: SmartschoolOAuthIntent; returnTo?: string | null; userId?: string | null } = {},
  now = Date.now(),
): { state: string; cookieValue: string } {
  const payload: SmartschoolOAuthStatePayload = {
    state: randomBytes(32).toString("base64url"),
    exp: now + SMARTSCHOOL_STATE_MAX_AGE_SECONDS * 1000,
    intent: input.intent ?? "login",
    returnTo: safeLocalReturnTo(input.returnTo),
    userId: input.userId?.trim() || null,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { state: payload.state, cookieValue: `${encoded}.${sign(encoded, secret)}` };
}

export function verifySmartschoolOAuthState(
  cookieValue: string | undefined,
  returnedState: string | null,
  secret: string,
  now = Date.now(),
): SmartschoolOAuthStatePayload | null {
  if (!cookieValue || !returnedState) return null;
  const [encoded, suppliedSignature, extra] = cookieValue.split(".");
  if (!encoded || !suppliedSignature || extra || !safeEqual(sign(encoded, secret), suppliedSignature)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<SmartschoolOAuthStatePayload>;
    if (payload.intent !== "login" && payload.intent !== "link") return null;
    if (typeof payload.state !== "string" || !safeEqual(payload.state, returnedState)) return null;
    if (typeof payload.exp !== "number" || payload.exp <= now) return null;
    return {
      state: payload.state,
      exp: payload.exp,
      intent: payload.intent,
      returnTo: safeLocalReturnTo(payload.returnTo),
      userId: typeof payload.userId === "string" && payload.userId ? payload.userId : null,
    };
  } catch {
    return null;
  }
}

export function smartschoolStateSecret(environment: NodeJS.ProcessEnv = process.env): string | null {
  return environment.ADMIN_SESSION_SECRET?.trim() || environment.SMARTSCHOOL_CLIENT_SECRET?.trim() || null;
}

export function safeLocalReturnTo(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  try {
    const url = new URL(value, "https://portfolio.invalid");
    if (url.origin !== "https://portfolio.invalid" || url.pathname.startsWith("/api/auth/")) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
