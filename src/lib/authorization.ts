import { getDatabase } from "@/lib/database";
import type { AppUser } from "@/lib/identity";

export class AuthorizationError extends Error {
  constructor(message = "Je hebt geen beheerrechten voor deze leeromgeving.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function canAccessAdmin(user: AppUser | null): boolean {
  return Boolean(user && user.status === "active" && (user.role === "superadmin" || user.role === "teacher"));
}

export async function canManageLearningSpace(user: AppUser | null, learningSpaceId: string): Promise<boolean> {
  if (!canAccessAdmin(user)) return false;
  if (user!.role === "superadmin") return true;
  const membership = await (await getDatabase()).execute({
    sql: "SELECT 1 FROM learning_space_members WHERE learning_space_id = ? AND user_id = ? AND role IN ('owner', 'editor')",
    args: [learningSpaceId, user!.id],
  });
  return Boolean(membership.rows[0]);
}

export async function requireLearningSpaceManagement(user: AppUser | null, learningSpaceId: string): Promise<void> {
  if (!await canManageLearningSpace(user, learningSpaceId)) throw new AuthorizationError();
}
