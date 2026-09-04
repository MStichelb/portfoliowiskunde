import type { DatabaseClient, InStatement } from "@/lib/database";
import { getDatabase } from "@/lib/database";
import { listManagedUsers } from "@/lib/user-management";

export interface UserResetResult {
  resetCount: number;
}

export async function resetManagedUser(userId: string): Promise<UserResetResult> {
  const database = await getDatabase();
  const user = await getResetCandidate(database, userId);
  if (!user) throw new Error("Gebruiker niet gevonden.");
  await assertResetIsSafe(database, user.id, user.role);
  await resetUsers(database, [user.id]);
  return { resetCount: 1 };
}

export async function resetStudentsByClass(classGroupId: string): Promise<UserResetResult> {
  const normalizedClassGroupId = classGroupId.trim();
  if (!normalizedClassGroupId) throw new Error("Selecteer eerst een klas.");
  const studentIds = (await listManagedUsers())
    .filter((user) => user.role === "student" && user.effectiveClassGroupId === normalizedClassGroupId)
    .map((user) => user.id);
  return resetStudentIds(studentIds);
}

export async function resetAllStudents(): Promise<UserResetResult> {
  const database = await getDatabase();
  const rows = (await database.execute("SELECT id FROM users WHERE role = 'student'")).rows;
  return resetStudentIds(rows.map((row) => String(row.id)), database);
}

async function resetStudentIds(userIds: string[], database?: DatabaseClient): Promise<UserResetResult> {
  if (userIds.length === 0) return { resetCount: 0 };
  const activeDatabase = database ?? await getDatabase();
  for (const userId of userIds) {
    const user = await getResetCandidate(activeDatabase, userId);
    if (!user || user.role !== "student") throw new Error("De leerlingselectie is intussen gewijzigd. Vernieuw de pagina en probeer opnieuw.");
    await assertResetIsSafe(activeDatabase, user.id, user.role);
  }
  await resetUsers(activeDatabase, userIds);
  return { resetCount: userIds.length };
}

async function getResetCandidate(database: DatabaseClient, userId: string): Promise<{ id: string; role: string } | null> {
  const row = (await database.execute({ sql: "SELECT id, role FROM users WHERE id = ?", args: [userId] })).rows[0];
  return row ? { id: String(row.id), role: String(row.role) } : null;
}

async function assertResetIsSafe(database: DatabaseClient, userId: string, role: string): Promise<void> {
  if (role === "superadmin") throw new Error("Hoofdbeheerders kunnen niet via de gewone verwijderflow worden gereset.");
  const [ownerResult, usedConnectionResult] = await Promise.all([
    database.execute({ sql: "SELECT learning_space_id FROM learning_space_members WHERE user_id = ? AND role = 'owner' LIMIT 1", args: [userId] }),
    database.execute({
      sql: `SELECT learning_space_sources.id FROM learning_space_sources
        JOIN storage_connections ON storage_connections.id = learning_space_sources.storage_connection_id
        WHERE storage_connections.owner_user_id = ? LIMIT 1`,
      args: [userId],
    }),
  ]);
  if (ownerResult.rows[0]) throw new Error("Deze leraar is eigenaar van een leeromgeving. Draag het eigenaarschap eerst over.");
  if (usedConnectionResult.rows[0]) throw new Error("Een opslagverbinding van deze leraar wordt door een leeromgeving gebruikt. Draag de bron eerst over.");
}

async function resetUsers(database: DatabaseClient, userIds: string[]): Promise<void> {
  const statements: InStatement[] = [];
  for (const userId of userIds) statements.push(...resetStatements(userId));
  await database.batch(statements);
}

function resetStatements(userId: string): InStatement[] {
  // Each statement rechecks the non-superadmin and ownership invariants inside the transaction.
  const eligibleUser = `SELECT users.id FROM users
    WHERE users.id = ? AND users.role IN ('student', 'teacher')
      AND NOT EXISTS (
        SELECT 1 FROM learning_space_members
        WHERE learning_space_members.user_id = users.id AND learning_space_members.role = 'owner'
      )
      AND NOT EXISTS (
        SELECT 1 FROM learning_space_sources
        JOIN storage_connections ON storage_connections.id = learning_space_sources.storage_connection_id
        WHERE storage_connections.owner_user_id = users.id
      )`;
  const guarded = (sql: string): InStatement => ({ sql, args: [userId] });
  return [
    guarded(`DELETE FROM admin_sessions WHERE user_id IN (${eligibleUser})`),
    guarded(`DELETE FROM individual_learning_space_access WHERE user_id IN (${eligibleUser})`),
    guarded(`DELETE FROM external_identity_groups WHERE identity_id IN (
      SELECT external_identities.id FROM external_identities WHERE external_identities.user_id IN (${eligibleUser})
    )`),
    guarded(`DELETE FROM external_identities WHERE user_id IN (${eligibleUser})`),
    guarded(`DELETE FROM learning_space_members WHERE user_id IN (${eligibleUser}) AND role = 'editor'`),
    guarded(`DELETE FROM storage_connections WHERE owner_user_id IN (${eligibleUser})`),
    guarded(`DELETE FROM users WHERE id IN (${eligibleUser})`),
  ];
}
