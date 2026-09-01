import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth";
import { beginSmartschoolAuthorization } from "@/lib/smartschool-auth-flow";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "superadmin") return NextResponse.redirect(new URL("/admin/login", request.url));
  try {
    return beginSmartschoolAuthorization(request, { intent: "link", userId: user.id });
  } catch {
    return NextResponse.redirect(new URL("/admin?smartschool=config", request.url));
  }
}
