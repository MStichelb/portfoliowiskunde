import "server-only";

import { changelog, type ChangelogEntry } from "@/data/changelog";
import type { UserRole } from "@/lib/identity";

// Stable date sort: entries on the same day retain their explicit array order.
function ordered(entries: ChangelogEntry[]): ChangelogEntry[] {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date));
}

export function getChangelogForRole(role: UserRole, entries = changelog): ChangelogEntry[] {
  return ordered(entries).filter((entry) => entry.audiences.some((audience) =>
    audience === "student" || (audience === "teacher" && role !== "student") || role === "superadmin"));
}

export function getRecentChangelogForRole(role: UserRole, limit = 7, entries = changelog): ChangelogEntry[] {
  return getChangelogForRole(role, entries).slice(0, Math.max(0, limit));
}

export function hasUnreadChangelog(role: UserRole, lastSeenId: string | null, entries = changelog): boolean {
  const relevant = getChangelogForRole(role, entries);
  const all = ordered(entries);
  const seenIndex = lastSeenId === null ? -1 : all.findIndex((entry) => entry.id === lastSeenId);
  // Unknown/deleted markers conservatively leave relevant notifications unread.
  return relevant.some((entry) => entry.notify && (seenIndex < 0 || all.indexOf(entry) < seenIndex));
}
