import { getDatabase } from "@/lib/database";
import type { UserStatus } from "@/lib/identity";
import { listManagedUsers } from "@/lib/user-management";

export interface LearningSpaceStudentRosterEntry {
  userId: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  className: string | null;
  relevantGroupNames: string[];
  individualAccess: boolean;
  groupDerivedAccess: boolean;
  status: UserStatus;
}

const naturalText = new Intl.Collator("nl-BE", { numeric: true, sensitivity: "base" });

export async function listLearningSpaceStudentRoster(
  learningSpaceId: string,
): Promise<LearningSpaceStudentRosterEntry[]> {
  const database = await getDatabase();
  const [managedUsers, groupRows, individualRows] = await Promise.all([
    listManagedUsers(),
    database.execute({
      sql: `SELECT DISTINCT users.id AS user_id,
          COALESCE(learning_space_group_mappings.external_group_name, external_identity_groups.external_group_name) AS group_name
        FROM learning_space_group_mappings
        JOIN external_identities ON external_identities.provider = learning_space_group_mappings.provider
        JOIN external_identity_groups ON external_identity_groups.identity_id = external_identities.id
          AND external_identity_groups.external_group_id = learning_space_group_mappings.external_group_id
        JOIN users ON users.id = external_identities.user_id
        WHERE learning_space_group_mappings.learning_space_id = ? AND users.role = 'student'`,
      args: [learningSpaceId],
    }),
    database.execute({
      sql: `SELECT users.id AS user_id FROM individual_learning_space_access
        JOIN users ON users.id = individual_learning_space_access.user_id
        WHERE individual_learning_space_access.learning_space_id = ? AND users.role = 'student'`,
      args: [learningSpaceId],
    }),
  ]);

  const accessByUser = new Map<string, { individual: boolean; groupDerived: boolean; groupNames: Map<string, string> }>();
  const accessFor = (userId: string) => {
    const existing = accessByUser.get(userId) ?? { individual: false, groupDerived: false, groupNames: new Map<string, string>() };
    accessByUser.set(userId, existing);
    return existing;
  };
  for (const row of groupRows.rows) {
    const access = accessFor(String(row.user_id));
    access.groupDerived = true;
    if (typeof row.group_name === "string" && row.group_name.trim()) {
      const name = row.group_name.trim();
      access.groupNames.set(name.toLocaleLowerCase("nl-BE"), name);
    }
  }
  for (const row of individualRows.rows) accessFor(String(row.user_id)).individual = true;

  return managedUsers
    .filter((user) => user.role === "student" && accessByUser.has(user.id))
    .map((user) => {
      const access = accessByUser.get(user.id)!;
      return {
        userId: user.id,
        displayName: user.displayName,
        firstName: user.firstName,
        lastName: user.lastName,
        className: user.effectiveClassName,
        relevantGroupNames: [...access.groupNames.values()].sort(naturalText.compare),
        individualAccess: access.individual,
        groupDerivedAccess: access.groupDerived,
        status: user.status,
      };
    })
    .sort(compareRosterEntries);
}

function compareRosterEntries(
  left: LearningSpaceStudentRosterEntry,
  right: LearningSpaceStudentRosterEntry,
): number {
  const leftGroup = left.className ?? left.relevantGroupNames[0] ?? null;
  const rightGroup = right.className ?? right.relevantGroupNames[0] ?? null;
  if (leftGroup && rightGroup) {
    const groupOrder = naturalText.compare(leftGroup, rightGroup);
    if (groupOrder !== 0) return groupOrder;
  } else if (leftGroup || rightGroup) {
    return leftGroup ? -1 : 1;
  }
  return naturalText.compare(left.lastName ?? "", right.lastName ?? "")
    || naturalText.compare(left.firstName ?? "", right.firstName ?? "")
    || naturalText.compare(left.displayName, right.displayName)
    || left.userId.localeCompare(right.userId);
}
