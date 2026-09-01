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

export async function getAccessibleLearningSpaceIds(user: AppUser | null): Promise<string[]> {
  if (!user || user.status !== "active") return [];
  const database = await getDatabase();
  if (user.role === "superadmin") {
    const rows = await database.execute("SELECT id FROM learning_spaces WHERE is_active = 1 AND archived_at IS NULL ORDER BY sort_order, name");
    return rows.rows.map((row) => String(row.id));
  }
  if (user.role === "teacher") {
    const rows = await database.execute({
      sql: `SELECT learning_spaces.id FROM learning_space_members
        JOIN learning_spaces ON learning_spaces.id = learning_space_members.learning_space_id
        WHERE learning_space_members.user_id = ? AND learning_space_members.role IN ('owner', 'editor')
          AND learning_spaces.is_active = 1 AND learning_spaces.archived_at IS NULL
        ORDER BY learning_spaces.sort_order, learning_spaces.name`,
      args: [user.id],
    });
    return rows.rows.map((row) => String(row.id));
  }
  const rows = await database.execute({
    sql: `SELECT DISTINCT learning_spaces.id, learning_spaces.sort_order, learning_spaces.name
      FROM external_identities
      JOIN external_identity_groups ON external_identity_groups.identity_id = external_identities.id
      JOIN learning_space_group_mappings ON learning_space_group_mappings.provider = external_identities.provider
        AND learning_space_group_mappings.external_group_id = external_identity_groups.external_group_id
      JOIN learning_spaces ON learning_spaces.id = learning_space_group_mappings.learning_space_id
      WHERE external_identities.user_id = ? AND learning_spaces.is_active = 1 AND learning_spaces.archived_at IS NULL
      ORDER BY learning_spaces.sort_order, learning_spaces.name`,
    args: [user.id],
  });
  return rows.rows.map((row) => String(row.id));
}

export async function canAccessLearningSpace(user: AppUser | null, learningSpaceId: string): Promise<boolean> {
  if (!user || user.status !== "active") return false;
  if (user.role === "superadmin") return true;
  const ids = await getAccessibleLearningSpaceIds(user);
  return ids.includes(learningSpaceId);
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
