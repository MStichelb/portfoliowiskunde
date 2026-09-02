import type { AppUser } from "@/lib/identity";
import { canAccessLearningSpace, getAccessibleLearningSpaceIds } from "@/lib/authorization";
import { getLearningSpace, getLearningSpaces, getSetting, setSetting } from "@/lib/repositories";

const PUBLIC_EMERGENCY_ACCESS_KEY = "public_emergency_access";

export interface PublicEmergencyAccessState {
  enabled: boolean;
  enabledAt: string | null;
}

export async function getPublicEmergencyAccess(): Promise<PublicEmergencyAccessState> {
  const stored = await getSetting(PUBLIC_EMERGENCY_ACCESS_KEY);
  if (!stored) return { enabled: false, enabledAt: null };
  try {
    const parsed = JSON.parse(stored) as { enabled?: unknown; enabledAt?: unknown };
    const enabled = parsed.enabled === true;
    const enabledAt = enabled && typeof parsed.enabledAt === "string" && Number.isFinite(Date.parse(parsed.enabledAt))
      ? parsed.enabledAt
      : null;
    return { enabled, enabledAt };
  } catch {
    return { enabled: false, enabledAt: null };
  }
}

export async function setPublicEmergencyAccess(enabled: boolean, now = new Date()): Promise<PublicEmergencyAccessState> {
  const state = { enabled, enabledAt: enabled ? now.toISOString() : null } satisfies PublicEmergencyAccessState;
  await setSetting(PUBLIC_EMERGENCY_ACCESS_KEY, JSON.stringify(state));
  return state;
}

export async function canAccessPublicLearningSpace(user: AppUser | null, learningSpaceId: string): Promise<boolean> {
  if (user) return canAccessLearningSpace(user, learningSpaceId);
  if (!(await getPublicEmergencyAccess()).enabled) return false;
  const space = await getLearningSpace(learningSpaceId);
  return Boolean(space?.isActive);
}

export async function getPubliclyAccessibleLearningSpaceIds(user: AppUser | null): Promise<string[]> {
  if (user) return getAccessibleLearningSpaceIds(user);
  if (!(await getPublicEmergencyAccess()).enabled) return [];
  return (await getLearningSpaces(true)).filter((space) => space.isActive).map((space) => space.id);
}
