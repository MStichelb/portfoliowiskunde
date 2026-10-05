import { describe, expect, it } from "vitest";
import { changelog, type ChangelogEntry, type ChangelogAudience } from "@/data/changelog";
import { getChangelogForRole, getRecentChangelogForRole, hasUnreadChangelog } from "./changelog";

function entry(id: string, audiences: ChangelogEntry["audiences"], notify = true, date = "2026-10-05"): ChangelogEntry {
  return { id, audiences, notify, date, category: "new", title: id, description: id };
}
const entries = [entry("z-admin", ["superadmin"]), entry("a-teacher", ["teacher", "superadmin"]), entry("public", ["student"]), entry("old", ["student"], true, "2026-10-01")];

describe("role-aware changelog", () => {
  it.each([
    ["student", ["public", "old"]],
    ["teacher", ["a-teacher", "public", "old"]],
    ["superadmin", ["z-admin", "a-teacher", "public", "old"]],
  ] as const)("authorizes %s", (role: ChangelogAudience, ids: readonly string[]) => {
    expect(getChangelogForRole(role, entries).map((item) => item.id)).toEqual(ids);
  });
  it("sorts by date and preserves explicit order on the same date, with a recent limit", () => {
    expect(getRecentChangelogForRole("superadmin", 2, [entries[3], ...entries.slice(0, 3)]).map((item) => item.id)).toEqual(["z-admin", "a-teacher"]);
  });
  it("never notifies a student about new teacher content after viewing public content", () => {
    expect(hasUnreadChangelog("student", "public", entries)).toBe(false);
    expect(hasUnreadChangelog("teacher", "public", entries)).toBe(true);
    expect(hasUnreadChangelog("superadmin", "public", entries)).toBe(true);
  });
  it("never notifies teachers about superadmin-only changes", () => {
    expect(hasUnreadChangelog("teacher", "a-teacher", entries)).toBe(false);
    expect(hasUnreadChangelog("superadmin", "a-teacher", entries)).toBe(true);
  });
  it("notifies for relevant notify entries, including null and missing markers", () => {
    for (const marker of [null, "deleted", "old"]) expect(hasUnreadChangelog("student", marker, entries)).toBe(true);
  });
  it("does not notify for quiet or already seen entries", () => {
    expect(hasUnreadChangelog("student", null, [entry("quiet", ["student"], false)])).toBe(false);
    expect(hasUnreadChangelog("student", "public", entries)).toBe(false);
    expect(hasUnreadChangelog("student", "a-teacher", entries)).toBe(false);
    expect(hasUnreadChangelog("student", null, [])).toBe(false);
  });
  it("keeps published ids unique, dates valid and audiences explicit", () => {
    expect(new Set(changelog.map((item) => item.id)).size).toBe(changelog.length);
    for (const item of changelog) {
      expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(item.date))).toBe(false);
      expect(item.audiences.length).toBeGreaterThan(0);
    }
  });

  it("keeps portfolio structure changes for management and out of student notifications", () => {
    const ids = ["2026-10-05-oefeningen-op-portfolioniveau", "2026-10-05-flexibele-onderdeelnummering"];
    const structureEntries = changelog.filter((item) => ids.includes(item.id));
    expect(structureEntries).toHaveLength(2);
    expect(getChangelogForRole("student").map((item) => item.id)).not.toEqual(expect.arrayContaining(ids));
    expect(getChangelogForRole("teacher").map((item) => item.id)).toEqual(expect.arrayContaining(ids));
    expect(getChangelogForRole("superadmin").map((item) => item.id)).toEqual(expect.arrayContaining(ids));
    expect(hasUnreadChangelog("student", null, structureEntries)).toBe(false);
    expect(hasUnreadChangelog("teacher", null, structureEntries)).toBe(true);
    expect(hasUnreadChangelog("superadmin", null, structureEntries)).toBe(true);
    expect(getChangelogForRole("student").map((item) => item.id)).toContain("2026-10-05-changelog");
  });
});
