import { timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/authorization";
import { exchangeMicrosoftCode } from "@/lib/onedrive";

const OAUTH_STATE_COOKIE = "portfolio_onedrive_oauth_state";
const OAUTH_VERIFIER_COOKIE = "portfolio_onedrive_oauth_verifier";
const OAUTH_OWNER_COOKIE = "portfolio_onedrive_oauth_owner";

export async function GET(request: Request) {
  const callbackUrl = new URL(request.url);
  const code = callbackUrl.searchParams.get("code");
  const state = callbackUrl.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  const codeVerifier = cookieStore.get(OAUTH_VERIFIER_COOKIE)?.value;
  const expectedOwner = cookieStore.get(OAUTH_OWNER_COOKIE)?.value;
  const user = await getAuthenticatedUser();
  const response = (status: string) => NextResponse.redirect(new URL(`${user?.role === "superadmin" ? "/admin/instellingen" : "/admin/verbindingen"}?onedrive=${encodeURIComponent(status)}`, request.url));

  if (!canAccessAdmin(user) || !code || !state || !expectedState || !codeVerifier || !expectedOwner
    || user!.id !== expectedOwner || !sameValue(state, expectedState)) {
    const rejected = response("authorization-failed");
    clearOAuthCookies(rejected);
    return rejected;
  }
  try {
    await exchangeMicrosoftCode(code, codeVerifier, user!.id);
    const complete = response("connected");
    clearOAuthCookies(complete);
    return complete;
  } catch (error) {
    console.error("Microsoft OAuth callback failed.", { errorType: error instanceof Error ? error.name : typeof error });
    const failed = response("connection-failed");
    clearOAuthCookies(failed);
    return failed;
  }
}

function clearOAuthCookies(response: NextResponse) {
  response.cookies.delete(OAUTH_STATE_COOKIE);
  response.cookies.delete(OAUTH_VERIFIER_COOKIE);
  response.cookies.delete(OAUTH_OWNER_COOKIE);
}

function sameValue(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
