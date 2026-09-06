import { executeBatch, getDatabase } from "@/lib/database";
import type { AppUser, LearningSpaceMemberRole, UserRole, UserStatus } from "@/lib/identity";

export interface ManagedUser extends AppUser {
  hasSmartschoolIdentity: boolean;
  automaticClassGroupId: string | null;
  automaticClassName: string | null;
  effectiveClassGroupId: string | null;
  effectiveClassName: string | null;
  hasIndividualAccess: boolean;
}
export interface ManagedMembership { learningSpaceId: string; userId: string; displayName: string; role: LearningSpaceMemberRole; }
export interface ManagedGroupMapping { id: string; learningSpaceId: string; provider: string; externalGroupId: string; externalGroupName: string | null; }
export interface KnownExternalGroup { provider: string; externalGroupId: string; externalGroupName: string | null; }
export interface ManagedGroupUser { provider: string; externalGroupId: string; userId: string; displayName: string; role: UserRole; status: UserStatus; }
export interface ManagedSourceOwner { learningSpaceId: string; sourceRole: "primary" | "mirror"; isActive: boolean; provider: string; connectionName: string | null; ownerName: string | null; }
export interface ManagedUserAccess { userId: string; learningSpaceId: string; groupDerived: boolean; individual: boolean; managementRole: LearningSpaceMemberRole | null; }
export interface ManagedStorageConnection { userId: string; provider: "onedrive" | "google_drive"; status: "active" | "disconnected"; }
export interface LearningSpaceTeacher { userId: string; firstName: string | null; lastName: string | null; role: LearningSpaceMemberRole | "viewer"; }
export type LearningSpaceTeacherAccessRole = "viewer" | "editor";
export interface LearningSpaceTeacherCandidate { userId: string; displayName: string; firstName: string | null; lastName: string | null; }

export async function listLearningSpaceTeachers(learningSpaceId: string): Promise<LearningSpaceTeacher[]> {
  const rows = (await (await getDatabase()).execute({
    sql: `SELECT users.id AS user_id, users.first_name, users.last_name,
      CASE learning_space_members.role WHEN 'owner' THEN 'owner' WHEN 'editor' THEN 'editor' ELSE 'viewer' END AS access_role
      FROM users
      LEFT JOIN learning_space_members ON learning_space_members.user_id = users.id
        AND learning_space_members.learning_space_id = ?
      LEFT JOIN individual_learning_space_access ON individual_learning_space_access.user_id = users.id
        AND individual_learning_space_access.learning_space_id = ?
      WHERE users.role = 'teacher'
        AND (learning_space_members.user_id IS NOT NULL OR individual_learning_space_access.user_id IS NOT NULL)
      ORDER BY CASE learning_space_members.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END,
        users.last_name, users.first_name, users.display_name`,
    args: [learningSpaceId, learningSpaceId],
  })).rows;
  return rows.map((row) => ({
    userId: String(row.user_id),
    firstName: textOrNull(row.first_name),
    lastName: textOrNull(row.last_name),
    role: row.access_role === "owner" ? "owner" : row.access_role === "editor" ? "editor" : "viewer",
  }));
}

export async function listLearningSpaceTeacherCandidates(learningSpaceId: string): Promise<LearningSpaceTeacherCandidate[]> {
  const rows = (await (await getDatabase()).execute({
    sql: `SELECT users.id AS user_id, users.display_name, users.first_name, users.last_name
      FROM users
      WHERE users.role = 'teacher' AND users.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM learning_space_members
          WHERE learning_space_members.learning_space_id = ?
            AND learning_space_members.user_id = users.id
            AND learning_space_members.role = 'owner'
        )
      ORDER BY users.last_name, users.first_name, users.display_name`,
    args: [learningSpaceId],
  })).rows;
  return rows.map((row) => ({
    userId: String(row.user_id), displayName: String(row.display_name),
    firstName: textOrNull(row.first_name), lastName: textOrNull(row.last_name),
  }));
}

export async function setLearningSpaceTeacherAccess(
  learningSpaceId: string,
  userId: string,
  role: LearningSpaceTeacherAccessRole,
): Promise<void> {
  await assertMutableLearningSpaceTeacher(learningSpaceId, userId);
  const now = new Date().toISOString();
  if (role === "editor") {
    await executeBatch([
      { sql: "DELETE FROM individual_learning_space_access WHERE learning_space_id = ? AND user_id = ?", args: [learningSpaceId, userId] },
      { sql: "DELETE FROM learning_space_members WHERE learning_space_id = ? AND user_id = ? AND role = 'editor'", args: [learningSpaceId, userId] },
      {
        sql: `INSERT INTO learning_space_members (learning_space_id, user_id, role, created_at, updated_at)
          VALUES (?, ?, 'editor', ?, ?) ON CONFLICT(learning_space_id, user_id) DO NOTHING`,
        args: [learningSpaceId, userId, now, now],
      },
    ]);
    return;
  }
  await executeBatch([
    { sql: "DELETE FROM learning_space_members WHERE learning_space_id = ? AND user_id = ? AND role = 'editor'", args: [learningSpaceId, userId] },
    {
      sql: `INSERT INTO individual_learning_space_access (user_id, learning_space_id, created_at, updated_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(user_id, learning_space_id) DO UPDATE SET updated_at = excluded.updated_at`,
      args: [userId, learningSpaceId, now, now],
    },
  ]);
}

export async function removeLearningSpaceTeacherAccess(learningSpaceId: string, userId: string): Promise<void> {
  await assertMutableLearningSpaceTeacher(learningSpaceId, userId);
  await executeBatch([
    { sql: "DELETE FROM learning_space_members WHERE learning_space_id = ? AND user_id = ? AND role = 'editor'", args: [learningSpaceId, userId] },
    { sql: "DELETE FROM individual_learning_space_access WHERE learning_space_id = ? AND user_id = ?", args: [learningSpaceId, userId] },
  ]);
}

async function assertMutableLearningSpaceTeacher(learningSpaceId: string, userId: string): Promise<void> {
  const database = await getDatabase();
  const [user, space, membership] = await Promise.all([
    database.execute({ sql: "SELECT role, status FROM users WHERE id = ?", args: [userId] }),
    database.execute({ sql: "SELECT is_active, archived_at FROM learning_spaces WHERE id = ?", args: [learningSpaceId] }),
    database.execute({ sql: "SELECT role FROM learning_space_members WHERE learning_space_id = ? AND user_id = ?", args: [learningSpaceId, userId] }),
  ]);
  if (!user.rows[0] || user.rows[0].role !== "teacher" || user.rows[0].status !== "active") {
    throw new Error("Alleen een actieve leraar kan toegang krijgen tot deze leeromgeving.");
  }
  if (!space.rows[0] || Number(space.rows[0].is_active) !== 1 || space.rows[0].archived_at) {
    throw new Error("Deze leeromgeving is niet actief.");
  }
  if (membership.rows[0]?.role === "owner") {
    throw new Error("Een eigenaar kan via deze toegangspagina niet worden gewijzigd of verwijderd.");
  }
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const database = await getDatabase();
  const [userResult, groupResult, knownGroupResult] = await Promise.all([
    database.execute(`SELECT users.*,
      EXISTS(SELECT 1 FROM external_identities WHERE external_identities.user_id = users.id AND external_identities.provider = 'smartschool') AS has_smartschool,
      EXISTS(SELECT 1 FROM individual_learning_space_access WHERE individual_learning_space_access.user_id = users.id) AS has_individual_access
      FROM users ORDER BY CASE users.role WHEN 'superadmin' THEN 0 WHEN 'teacher' THEN 1 ELSE 2 END, users.last_name, users.first_name, users.display_name`),
    database.execute(`SELECT external_identities.user_id, external_identity_groups.external_group_id, external_identity_groups.external_group_name
      FROM external_identity_groups JOIN external_identities ON external_identities.id = external_identity_groups.identity_id
      WHERE external_identities.provider = 'smartschool'`),
    database.execute(`SELECT external_group_id, MAX(external_group_name) AS external_group_name
      FROM external_identity_groups GROUP BY external_group_id`),
  ]);
  const groupsByUser = new Map<string, KnownExternalGroup[]>();
  for (const row of groupResult.rows) {
    const name = textOrNull(row.external_group_name);
    if (!name || !isClassGroupName(name)) continue;
    const userId = String(row.user_id);
    const values = groupsByUser.get(userId) ?? [];
    if (!values.some((group) => group.externalGroupId === String(row.external_group_id))) {
      values.push({ provider: "smartschool", externalGroupId: String(row.external_group_id), externalGroupName: name });
      groupsByUser.set(userId, values);
    }
  }
  const knownNames = new Map(knownGroupResult.rows.map((row) => [String(row.external_group_id), textOrNull(row.external_group_name)]));
  return userResult.rows.map((row) => {
    const userId = String(row.id);
    const classGroups = groupsByUser.get(userId) ?? [];
    const automatic = classGroups.length === 1 ? classGroups[0] : null;
    const classGroupOverrideId = textOrNull(row.class_group_override_id);
    return {
      id: userId,
      displayName: String(row.display_name),
      firstName: textOrNull(row.first_name),
      lastName: textOrNull(row.last_name),
      email: textOrNull(row.email),
      role: roleFromValue(row.role),
      status: row.status === "disabled" ? "disabled" : "active",
      classGroupOverrideId,
      hasSmartschoolIdentity: Number(row.has_smartschool) === 1,
      automaticClassGroupId: automatic?.externalGroupId ?? null,
      automaticClassName: automatic?.externalGroupName ?? null,
      effectiveClassGroupId: classGroupOverrideId ?? automatic?.externalGroupId ?? null,
      effectiveClassName: classGroupOverrideId ? knownNames.get(classGroupOverrideId) ?? classGroupOverrideId : automatic?.externalGroupName ?? null,
      hasIndividualAccess: Number(row.has_individual_access) === 1,
    };
  });
}

export async function updateManagedUserRole(userId: string, role: Exclude<UserRole, "superadmin">): Promise<void> {
  const database = await getDatabase();
  const target = (await database.execute({ sql: "SELECT role FROM users WHERE id = ?", args: [userId] })).rows[0];
  if (!target) throw new Error("Gebruiker niet gevonden.");
  if (target.role === "superadmin") throw new Error("De hoofdbeheerderrol kan niet via dit scherm worden gewijzigd.");
  if (role === "student" && target.role === "teacher") await assertTeacherRoleChangeCompatible(userId);
  await database.execute({ sql: "UPDATE users SET role = ?, updated_at = ? WHERE id = ?", args: [role, new Date().toISOString(), userId] });
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

export async function updateManagedUserClassOverride(userId: string, groupId: string | null): Promise<void> {
  const database = await getDatabase();
  const user = (await database.execute({ sql: "SELECT role FROM users WHERE id = ?", args: [userId] })).rows[0];
  if (!user || user.role !== "student") throw new Error("Alleen bij leerlingen kan een klasoverride worden ingesteld.");
  if (groupId && !(await listKnownClassGroups()).some((group) => group.externalGroupId === groupId)) {
    throw new Error("Deze klasgroep is niet bekend.");
  }
  await database.execute({ sql: "UPDATE users SET class_group_override_id = ?, updated_at = ? WHERE id = ?", args: [groupId, new Date().toISOString(), userId] });
}

export async function setIndividualLearningSpaceAccess(userId: string, learningSpaceId: string, enabled: boolean): Promise<void> {
  const database = await getDatabase();
  const [user, space] = await Promise.all([
    database.execute({ sql: "SELECT role FROM users WHERE id = ?", args: [userId] }),
    database.execute({ sql: "SELECT is_active, archived_at FROM learning_spaces WHERE id = ?", args: [learningSpaceId] }),
  ]);
  if (!user.rows[0] || user.rows[0].role === "superadmin") throw new Error("Individuele toegang geldt alleen voor leerlingen en leraren.");
  if (!space.rows[0] || Number(space.rows[0].is_active) !== 1 || space.rows[0].archived_at) throw new Error("Deze leeromgeving is niet actief.");
  if (!enabled) {
    await database.execute({ sql: "DELETE FROM individual_learning_space_access WHERE user_id = ? AND learning_space_id = ?", args: [userId, learningSpaceId] });
    return;
  }
  const now = new Date().toISOString();
  await database.execute({
    sql: `INSERT INTO individual_learning_space_access (user_id, learning_space_id, created_at, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, learning_space_id) DO UPDATE SET updated_at = excluded.updated_at`,
    args: [userId, learningSpaceId, now, now],
  });
}

export async function listManagedUserAccess(): Promise<ManagedUserAccess[]> {
  const database = await getDatabase();
  const [groupRows, individualRows, memberRows] = await Promise.all([
    database.execute(`SELECT DISTINCT external_identities.user_id, learning_space_group_mappings.learning_space_id
      FROM external_identities
      JOIN external_identity_groups ON external_identity_groups.identity_id = external_identities.id
      JOIN learning_space_group_mappings ON learning_space_group_mappings.provider = external_identities.provider
        AND learning_space_group_mappings.external_group_id = external_identity_groups.external_group_id`),
    database.execute("SELECT user_id, learning_space_id FROM individual_learning_space_access"),
    database.execute("SELECT user_id, learning_space_id, role FROM learning_space_members"),
  ]);
  const access = new Map<string, ManagedUserAccess>();
  const item = (userId: string, learningSpaceId: string) => {
    const key = `${userId}\u0000${learningSpaceId}`;
    const existing = access.get(key) ?? { userId, learningSpaceId, groupDerived: false, individual: false, managementRole: null };
    access.set(key, existing);
    return existing;
  };
  for (const row of groupRows.rows) item(String(row.user_id), String(row.learning_space_id)).groupDerived = true;
  for (const row of individualRows.rows) item(String(row.user_id), String(row.learning_space_id)).individual = true;
  for (const row of memberRows.rows) item(String(row.user_id), String(row.learning_space_id)).managementRole = row.role === "owner" ? "owner" : "editor";
  return [...access.values()];
}

export async function listManagedStorageConnections(): Promise<ManagedStorageConnection[]> {
  const rows = (await (await getDatabase()).execute("SELECT owner_user_id, provider, status FROM storage_connections ORDER BY owner_user_id, provider")).rows;
  return rows.map((row) => ({
    userId: String(row.owner_user_id),
    provider: row.provider === "google_drive" ? "google_drive" : "onedrive",
    status: row.status === "active" ? "active" : "disconnected",
  }));
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

export async function listKnownClassGroups(): Promise<KnownExternalGroup[]> {
  return (await listKnownExternalGroups()).filter((group) =>
    group.provider === "smartschool" && Boolean(group.externalGroupName && isClassGroupName(group.externalGroupName)));
}

export function isClassGroupName(name: string): boolean {
  return /^[3-6]/.test(name.trim());
}

export async function listManagedGroupUsers(): Promise<ManagedGroupUser[]> {
  const rows = (await (await getDatabase()).execute(`SELECT DISTINCT external_identities.provider, external_identity_groups.external_group_id,
      users.id AS user_id, users.display_name, users.role, users.status
    FROM external_identity_groups
    JOIN external_identities ON external_identities.id = external_identity_groups.identity_id
    JOIN users ON users.id = external_identities.user_id
    ORDER BY external_identities.provider, external_identity_groups.external_group_id, users.display_name`)).rows;
  return rows.map((row) => ({
    provider: String(row.provider), externalGroupId: String(row.external_group_id), userId: String(row.user_id),
    displayName: String(row.display_name), role: roleFromValue(row.role), status: row.status === "disabled" ? "disabled" : "active",
  }));
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
    ORDER BY learning_space_sources.learning_space_id, CASE learning_space_sources.role WHEN 'primary' THEN 0 ELSE 1 END`)).rows;
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

async function assertTeacherRoleChangeCompatible(userId: string): Promise<void> {
  const database = await getDatabase();
  const [memberships, sources] = await Promise.all([
    database.execute({ sql: "SELECT learning_space_id FROM learning_space_members WHERE user_id = ? LIMIT 1", args: [userId] }),
    database.execute({
      sql: `SELECT learning_space_sources.id FROM learning_space_sources
        JOIN storage_connections ON storage_connections.id = learning_space_sources.storage_connection_id
        WHERE storage_connections.owner_user_id = ? LIMIT 1`,
      args: [userId],
    }),
  ]);
  if (memberships.rows[0] || sources.rows[0]) {
    throw new Error("Verwijder eerst alle beheerrechten en draag gekoppelde bronnen over voordat je deze leraar leerling maakt.");
  }
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
