import { timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth";
import { exchangeMicrosoftCode } from "@/lib/onedrive";

const OAUTH_STATE_COOKIE = "portfolio_onedrive_oauth_state";
const OAUTH_VERIFIER_COOKIE = "portfolio_onedrive_oauth_verifier";

export async function GET(request: Request) {
  const callbackUrl = new URL(request.url);
  const code = callbackUrl.searchParams.get("code");
  const state = callbackUrl.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  const codeVerifier = cookieStore.get(OAUTH_VERIFIER_COOKIE)?.value;
  const response = (status: string) => NextResponse.redirect(new URL(`/admin/instellingen?onedrive=${encodeURIComponent(status)}`, request.url));

  if (!(await isAdminAuthenticated()) || !code || !state || !expectedState || !codeVerifier || !sameValue(state, expectedState)) {
    const rejected = response("authorization-failed");
    clearOAuthCookies(rejected);
    return rejected;
  }
  try {
    await exchangeMicrosoftCode(code, codeVerifier);
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
}

function sameValue(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
