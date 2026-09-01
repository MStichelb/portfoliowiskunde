import { getDatabase } from "@/lib/database";
import type { AppUser, LearningSpaceMemberRole, UserRole, UserStatus } from "@/lib/identity";

export interface ManagedUser extends AppUser { hasSmartschoolIdentity: boolean; }
export interface ManagedMembership { learningSpaceId: string; userId: string; displayName: string; role: LearningSpaceMemberRole; }
export interface ManagedGroupMapping { id: string; learningSpaceId: string; provider: string; externalGroupId: string; externalGroupName: string | null; }
export interface KnownExternalGroup { provider: string; externalGroupId: string; externalGroupName: string | null; }
export interface ManagedSourceOwner { learningSpaceId: string; sourceRole: "primary" | "mirror"; isActive: boolean; provider: string; connectionName: string | null; ownerName: string | null; }

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const rows = (await (await getDatabase()).execute(`SELECT users.*,
    EXISTS(SELECT 1 FROM external_identities WHERE external_identities.user_id = users.id AND external_identities.provider = 'smartschool') AS has_smartschool
    FROM users ORDER BY CASE users.role WHEN 'superadmin' THEN 0 WHEN 'teacher' THEN 1 ELSE 2 END, users.display_name`)).rows;
  return rows.map((row) => ({
    id: String(row.id), displayName: String(row.display_name), email: typeof row.email === "string" && row.email ? row.email : null,
    role: roleFromValue(row.role), status: row.status === "disabled" ? "disabled" : "active", hasSmartschoolIdentity: Number(row.has_smartschool) === 1,
  }));
}

export async function updateManagedUserRole(userId: string, role: Exclude<UserRole, "superadmin">): Promise<void> {
  const database = await getDatabase();
  const target = (await database.execute({ sql: "SELECT role FROM users WHERE id = ?", args: [userId] })).rows[0];
  if (!target) throw new Error("Gebruiker niet gevonden.");
  if (target.role === "superadmin") throw new Error("De hoofdbeheerderrol kan niet via dit scherm worden gewijzigd.");
  await database.execute({ sql: "UPDATE users SET role = ?, updated_at = ? WHERE id = ?", args: [role, new Date().toISOString(), userId] });
  if (role === "student") await database.execute({ sql: "DELETE FROM learning_space_members WHERE user_id = ?", args: [userId] });
}

export async function updateManagedUserStatus(userId: string, status: UserStatus): Promise<void> {
  const database = await getDatabase();
  const target = (await database.execute({ sql: "SELECT role, status FROM users WHERE id = ?", args: [userId] })).rows[0];
  if (!target) throw new Error("Gebruiker niet gevonden.");
  if (target.role === "superadmin" && target.status === "active" && status === "disabled") {
    const active = Number((await database.execute("SELECT COUNT(*) AS count FROM users WHERE role = 'superadmin' AND status = 'active'")).rows[0]?.count ?? 0);
    if (active <= 1) throw new Error("De laatste actieve hoofdbeheerder kan niet worden uitgeschakeld.");
  }
  await database.execute({ sql: "UPDATE users SET status = ?, updated_at = ? WHERE id = ?", args: [status, new Date().toISOString(), userId] });
}

export async function listManagedMemberships(): Promise<ManagedMembership[]> {
  const rows = (await (await getDatabase()).execute(`SELECT learning_space_members.*, users.display_name
    FROM learning_space_members JOIN users ON users.id = learning_space_members.user_id
    ORDER BY learning_space_members.learning_space_id, users.display_name`)).rows;
  return rows.map((row) => ({ learningSpaceId: String(row.learning_space_id), userId: String(row.user_id), displayName: String(row.display_name), role: row.role === "owner" ? "owner" : "editor" }));
}

export async function upsertManagedMembership(learningSpaceId: string, userId: string, role: LearningSpaceMemberRole): Promise<void> {
  const database = await getDatabase();
  const user = (await database.execute({ sql: "SELECT role, status FROM users WHERE id = ?", args: [userId] })).rows[0];
  if (!user || user.role !== "teacher" || user.status !== "active") throw new Error("Alleen een actieve leraar kan als beheerder worden toegevoegd.");
  const now = new Date().toISOString();
  await database.execute({
    sql: `INSERT INTO learning_space_members (learning_space_id, user_id, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(learning_space_id, user_id) DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at`,
    args: [learningSpaceId, userId, role, now, now],
  });
}

export async function removeManagedMembership(learningSpaceId: string, userId: string): Promise<void> {
  await (await getDatabase()).execute({ sql: "DELETE FROM learning_space_members WHERE learning_space_id = ? AND user_id = ?", args: [learningSpaceId, userId] });
}

export async function listManagedGroupMappings(): Promise<ManagedGroupMapping[]> {
  const rows = (await (await getDatabase()).execute("SELECT * FROM learning_space_group_mappings ORDER BY learning_space_id, external_group_name, external_group_id")).rows;
  return rows.map((row) => ({ id: String(row.id), learningSpaceId: String(row.learning_space_id), provider: String(row.provider), externalGroupId: String(row.external_group_id), externalGroupName: typeof row.external_group_name === "string" && row.external_group_name ? row.external_group_name : null }));
}

export async function listKnownExternalGroups(): Promise<KnownExternalGroup[]> {
  const rows = (await (await getDatabase()).execute(`SELECT external_identities.provider, external_identity_groups.external_group_id,
      MAX(external_identity_groups.external_group_name) AS external_group_name
    FROM external_identity_groups JOIN external_identities ON external_identities.id = external_identity_groups.identity_id
    GROUP BY external_identities.provider, external_identity_groups.external_group_id
    ORDER BY external_group_name, external_group_id`)).rows;
  return rows.map((row) => ({ provider: String(row.provider), externalGroupId: String(row.external_group_id), externalGroupName: typeof row.external_group_name === "string" && row.external_group_name ? row.external_group_name : null }));
}

export async function deleteManagedGroupMapping(id: string): Promise<void> {
  await (await getDatabase()).execute({ sql: "DELETE FROM learning_space_group_mappings WHERE id = ?", args: [id] });
}

export async function listManagedSourceOwners(): Promise<ManagedSourceOwner[]> {
  const rows = (await (await getDatabase()).execute(`SELECT learning_space_sources.learning_space_id, learning_space_sources.role,
      learning_space_sources.is_active, learning_space_sources.provider_type, storage_connections.display_name AS connection_name,
      users.display_name AS owner_name
    FROM learning_space_sources
    LEFT JOIN storage_connections ON storage_connections.id = learning_space_sources.storage_connection_id
    LEFT JOIN users ON users.id = storage_connections.owner_user_id
    ORDER BY learning_space_sources.learning_space_id, learning_space_sources.role`)).rows;
  return rows.map((row) => ({
    learningSpaceId: String(row.learning_space_id), sourceRole: row.role === "mirror" ? "mirror" : "primary",
    isActive: Number(row.is_active) === 1, provider: String(row.provider_type),
    connectionName: typeof row.connection_name === "string" ? row.connection_name : null,
    ownerName: typeof row.owner_name === "string" ? row.owner_name : null,
  }));
}

function roleFromValue(value: unknown): UserRole {
  if (value === "teacher" || value === "student") return value;
  return "superadmin";
}
