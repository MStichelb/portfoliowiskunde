import { timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/auth";
import { exchangeMicrosoftCode, getOneDriveFolderPath, saveOneDriveConnection } from "@/lib/onedrive";
import { setStorageProviderType } from "@/lib/repositories";

const OAUTH_STATE_COOKIE = "portfolio_onedrive_oauth_state";

export async function GET(request: Request) {
  const callbackUrl = new URL(request.url);
  const code = callbackUrl.searchParams.get("code");
  const state = callbackUrl.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  const response = (status: string) => NextResponse.redirect(new URL(`/admin/instellingen?onedrive=${encodeURIComponent(status)}`, request.url));

  if (!(await isAdminAuthenticated()) || !code || !state || !expectedState || !sameValue(state, expectedState)) {
    const rejected = response("authorization-failed");
    rejected.cookies.delete(OAUTH_STATE_COOKIE);
    return rejected;
  }
  const folderPath = await getOneDriveFolderPath();
  if (!folderPath) {
    const incomplete = response("folder-required");
    incomplete.cookies.delete(OAUTH_STATE_COOKIE);
    return incomplete;
  }
  try {
    await exchangeMicrosoftCode(code);
    await saveOneDriveConnection(folderPath);
    await setStorageProviderType("onedrive");
    const complete = response("connected");
    complete.cookies.delete(OAUTH_STATE_COOKIE);
    return complete;
  } catch {
    const failed = response("connection-failed");
    failed.cookies.delete(OAUTH_STATE_COOKIE);
    return failed;
  }
}

function sameValue(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
