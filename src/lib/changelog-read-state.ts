import "server-only";

import { getDatabase } from "@/lib/database";
import { getChangelogForRole } from "@/lib/changelog";
import type { AppUser } from "@/lib/identity";

export async function getLastSeenChangelogEntryId(userId: string): Promise<string | null> {
  const row = (await (await getDatabase()).execute({
    sql: "SELECT last_seen_changelog_entry_id FROM users WHERE id = ?", args: [userId],
  })).rows[0];
  return typeof row?.last_seen_changelog_entry_id === "string" ? row.last_seen_changelog_entry_id : null;
}

export async function markChangelogSeen(user: Pick<AppUser, "id" | "role">): Promise<string | null> {
  const latestId = getChangelogForRole(user.role)[0]?.id ?? null;
  if (latestId) await (await getDatabase()).execute({
    sql: "UPDATE users SET last_seen_changelog_entry_id = ? WHERE id = ?", args: [latestId, user.id],
  });
  return latestId;
}
