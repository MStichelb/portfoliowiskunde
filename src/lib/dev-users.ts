import { getDatabase } from "@/lib/database";
import { getUser, type AppUser, type UserRole } from "@/lib/identity";

export interface DevDummyAccount {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  role: Exclude<UserRole, "superadmin">;
}

export const DEV_DUMMY_ACCOUNTS = [
  { id: "dev-dummy-teacher-olivia-owner", displayName: "Olivia Owner", firstName: "Olivia", lastName: "Owner", role: "teacher" },
  { id: "dev-dummy-teacher-elias-editor", displayName: "Elias Editor", firstName: "Elias", lastName: "Editor", role: "teacher" },
  { id: "dev-dummy-teacher-vera-viewer", displayName: "Vera Viewer", firstName: "Vera", lastName: "Viewer", role: "teacher" },
  { id: "dev-dummy-student-karel-klasgroep", displayName: "Karel Klasgroep", firstName: "Karel", lastName: "Klasgroep", role: "student" },
  { id: "dev-dummy-student-iris-individueel", displayName: "Iris Individueel", firstName: "Iris", lastName: "Individueel", role: "student" },
  { id: "dev-dummy-student-sam-zonder-toegang", displayName: "Sam ZonderToegang", firstName: "Sam", lastName: "ZonderToegang", role: "student" },
] as const satisfies readonly DevDummyAccount[];

const DEV_GROUP_SNAPSHOTS = [
  { userId: "dev-dummy-student-karel-klasgroep", externalGroupId: "dev-group-5wewi6", externalGroupName: "5WEWI6" },
  { userId: "dev-dummy-student-iris-individueel", externalGroupId: "dev-group-uitdaging", externalGroupName: "Uitdaging" },
] as const;

export function isDevDummyUserId(value: string): boolean {
  return DEV_DUMMY_ACCOUNTS.some((account) => account.id === value);
}

export function getLocalDevSeedConfigurationProblem(environment: NodeJS.ProcessEnv = process.env): string | null {
  if (environment.NODE_ENV === "production") return "Dummygebruikers kunnen nooit in production worden geseed.";
  if (environment.VERCEL) return "Dummygebruikers kunnen uitsluitend op een lokale ontwikkelmachine worden geseed.";
  for (const key of ["DATABASE_URL", "TURSO_DATABASE_URL"] as const) {
    const value = environment[key]?.trim();
    if (value && !isLocalSqliteUrl(value)) {
      return `${key} verwijst niet naar lokale SQLite. Seed afgebroken.`;
    }
  }
  const databasePath = environment.PORTFOLIO_DATABASE_PATH?.trim();
  if (databasePath?.startsWith("\\\\") || (databasePath && /^[a-z]+:\/\//i.test(databasePath))) {
    return "PORTFOLIO_DATABASE_PATH moet naar een lokaal SQLite-bestand verwijzen.";
  }
  return null;
}

export async function seedLocalDevUsers(environment: NodeJS.ProcessEnv = process.env): Promise<{ users: number; groups: number }> {
  const configurationProblem = getLocalDevSeedConfigurationProblem(environment);
  if (configurationProblem) throw new Error(configurationProblem);
  const database = await getDatabase();
  const now = new Date().toISOString();
  const statements = DEV_DUMMY_ACCOUNTS.flatMap((account) => {
    const identityId = identityIdFor(account.id);
    return [
      {
        sql: `INSERT INTO users (id, display_name, first_name, last_name, email, role, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, NULL, ?, 'active', ?, ?)
          ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, first_name = excluded.first_name,
            last_name = excluded.last_name, role = excluded.role, status = 'active', updated_at = excluded.updated_at`,
        args: [account.id, account.displayName, account.firstName, account.lastName, account.role, now, now],
      },
      {
        sql: `INSERT INTO external_identities (id, user_id, provider, provider_subject, provider_platform, created_at, updated_at)
          VALUES (?, ?, 'smartschool', ?, 'dev-local', ?, ?)
          ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id, provider = excluded.provider,
            provider_subject = excluded.provider_subject, provider_platform = excluded.provider_platform, updated_at = excluded.updated_at`,
        args: [identityId, account.id, account.id, now, now],
      },
      { sql: "DELETE FROM external_identity_groups WHERE identity_id = ?", args: [identityId] },
    ];
  });
  for (const snapshot of DEV_GROUP_SNAPSHOTS) {
    statements.push({
      sql: `INSERT INTO external_identity_groups (identity_id, external_group_id, external_group_name, membership_type, updated_at)
        VALUES (?, ?, ?, 'direct', ?)`,
      args: [identityIdFor(snapshot.userId), snapshot.externalGroupId, snapshot.externalGroupName, now],
    });
  }
  await database.batch(statements);
  return { users: DEV_DUMMY_ACCOUNTS.length, groups: DEV_GROUP_SNAPSHOTS.length };
}

export async function listDevDummyUsers(): Promise<AppUser[]> {
  const users = await Promise.all(DEV_DUMMY_ACCOUNTS.map((account) => getUser(account.id)));
  return users.filter((user): user is AppUser => Boolean(user));
}

function identityIdFor(userId: string): string {
  return userId.replace("dev-dummy-", "dev-dummy-identity-");
}

function isLocalSqliteUrl(value: string): boolean {
  if (value === ":memory:") return true;
  if (!value.startsWith("file:")) return false;
  try {
    const hostname = new URL(value).hostname;
    return !hostname || hostname === "localhost";
  } catch {
    return false;
  }
}
