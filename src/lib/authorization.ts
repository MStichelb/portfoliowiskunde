import { getDatabase } from "@/lib/database";
import type { AppUser, LearningSpaceMemberRole } from "@/lib/identity";

export class AuthorizationError extends Error {
  constructor(message = "Je hebt geen beheerrechten voor deze leeromgeving.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function canAccessAdmin(user: AppUser | null): boolean {
  return Boolean(user && user.status === "active" && (user.role === "superadmin" || user.role === "teacher"));
}

export function canCreateLearningSpace(user: AppUser | null): boolean {
  return canAccessAdmin(user);
}

export async function getAccessibleLearningSpaceIds(user: AppUser | null): Promise<string[]> {
  if (!user || user.status !== "active") return [];
  const database = await getDatabase();
  if (user.role === "superadmin") {
    const rows = await database.execute("SELECT id FROM learning_spaces WHERE is_active = 1 AND archived_at IS NULL ORDER BY sort_order, name");
    return rows.rows.map((row) => String(row.id));
  }
  const rows = await database.execute({
    sql: `SELECT DISTINCT learning_spaces.id, learning_spaces.sort_order, learning_spaces.name
      FROM learning_spaces
      WHERE learning_spaces.is_active = 1 AND learning_spaces.archived_at IS NULL AND (
        learning_spaces.id IN (
          SELECT learning_space_group_mappings.learning_space_id
          FROM external_identities
          JOIN external_identity_groups ON external_identity_groups.identity_id = external_identities.id
          JOIN learning_space_group_mappings ON learning_space_group_mappings.provider = external_identities.provider
            AND learning_space_group_mappings.external_group_id = external_identity_groups.external_group_id
          WHERE external_identities.user_id = ?
        )
        OR learning_spaces.id IN (SELECT learning_space_id FROM individual_learning_space_access WHERE user_id = ?)
        OR learning_spaces.id IN (SELECT learning_space_id FROM learning_space_members WHERE user_id = ?)
      )
      ORDER BY learning_spaces.sort_order, learning_spaces.name`,
    args: [user.id, user.id, user.id],
  });
  return rows.rows.map((row) => String(row.id));
}

export async function getManageableLearningSpaceIds(user: AppUser | null): Promise<string[]> {
  if (!user || user.status !== "active" || user.role === "student") return [];
  const database = await getDatabase();
  if (user.role === "superadmin") {
    const rows = await database.execute("SELECT id FROM learning_spaces WHERE is_active = 1 AND archived_at IS NULL ORDER BY sort_order, name");
    return rows.rows.map((row) => String(row.id));
  }
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

export async function getLearningSpaceMemberRole(user: AppUser | null, learningSpaceId: string): Promise<LearningSpaceMemberRole | null> {
  if (!user || user.status !== "active" || user.role !== "teacher") return null;
  const row = (await (await getDatabase()).execute({
    sql: "SELECT role FROM learning_space_members WHERE learning_space_id = ? AND user_id = ?",
    args: [learningSpaceId, user.id],
  })).rows[0];
  return row?.role === "owner" ? "owner" : row?.role === "editor" ? "editor" : null;
}

export async function canConfigureLearningSpace(user: AppUser | null, learningSpaceId: string): Promise<boolean> {
  if (!user || user.status !== "active") return false;
  if (user.role === "superadmin") return true;
  return await getLearningSpaceMemberRole(user, learningSpaceId) === "owner";
}

export async function canManageLearningSpaceTeacherAccess(user: AppUser | null, learningSpaceId: string): Promise<boolean> {
  return canConfigureLearningSpace(user, learningSpaceId);
}

export async function canManageLearningSpaceStudentAccess(user: AppUser | null, learningSpaceId: string): Promise<boolean> {
  if (!canAccessAdmin(user)) return false;
  const database = await getDatabase();
  const space = (await database.execute({
    sql: "SELECT is_active, archived_at, editors_can_manage_access FROM learning_spaces WHERE id = ?",
    args: [learningSpaceId],
  })).rows[0];
  if (!space || Number(space.is_active) !== 1 || space.archived_at) return false;
  if (user!.role === "superadmin") return true;
  const membership = (await database.execute({
    sql: "SELECT role FROM learning_space_members WHERE learning_space_id = ? AND user_id = ?",
    args: [learningSpaceId, user!.id],
  })).rows[0];
  return membership?.role === "owner" || (membership?.role === "editor" && Number(space.editors_can_manage_access) === 1);
}

export async function requireLearningSpaceManagement(user: AppUser | null, learningSpaceId: string): Promise<void> {
  if (!await canManageLearningSpace(user, learningSpaceId)) throw new AuthorizationError();
}

export function requireLearningSpaceCreation(user: AppUser | null): void {
  if (!canCreateLearningSpace(user)) throw new AuthorizationError("Alleen actieve leraren en hoofdbeheerders kunnen een leeromgeving aanmaken.");
}

export async function requireLearningSpaceConfiguration(user: AppUser | null, learningSpaceId: string): Promise<void> {
  if (!await canConfigureLearningSpace(user, learningSpaceId)) throw new AuthorizationError("Alleen een eigenaar of hoofdbeheerder kan de broninstellingen wijzigen.");
}

export async function requireLearningSpaceTeacherAccessManagement(user: AppUser | null, learningSpaceId: string): Promise<void> {
  if (!await canManageLearningSpaceTeacherAccess(user, learningSpaceId)) throw new AuthorizationError("Alleen een eigenaar of hoofdbeheerder kan lerarentoegang wijzigen.");
}

export async function requireLearningSpaceStudentAccessManagement(user: AppUser | null, learningSpaceId: string): Promise<void> {
  if (!await canManageLearningSpaceStudentAccess(user, learningSpaceId)) throw new AuthorizationError("Je mag de leerlingtoegang van deze leeromgeving niet wijzigen.");
}
