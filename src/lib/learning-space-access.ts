import { notFound, redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/lib/auth";
import { canAccessLearningSpace } from "@/lib/authorization";
import type { AppUser } from "@/lib/identity";

export async function requirePublicLearningSpaceAccess(learningSpaceId: string, returnTo: string): Promise<AppUser> {
  const user = await getAuthenticatedUser();
  if (!user) redirect(`/aanmelden?returnTo=${encodeURIComponent(returnTo)}`);
  if (!await canAccessLearningSpace(user, learningSpaceId)) notFound();
  return user;
}
