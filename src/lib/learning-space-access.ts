import { notFound, redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/lib/auth";
import type { AppUser } from "@/lib/identity";
import { canAccessPublicLearningSpace } from "@/lib/public-access";

export async function requirePublicLearningSpaceAccess(learningSpaceId: string, returnTo: string): Promise<AppUser | null> {
  const user = await getAuthenticatedUser();
  if (!await canAccessPublicLearningSpace(user, learningSpaceId)) {
    if (!user) redirect(`/aanmelden?returnTo=${encodeURIComponent(returnTo)}`);
    notFound();
  }
  return user;
}
