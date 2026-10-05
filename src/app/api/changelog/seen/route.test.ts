import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
import { getAuthenticatedUser } from "@/lib/auth";
import { getDatabase, resetDatabaseForTests } from "@/lib/database";
import { getLastSeenChangelogEntryId } from "@/lib/changelog-read-state";
import { getChangelogForRole } from "@/lib/changelog";
import { createUser } from "@/lib/identity";
import { POST } from "./route";

let directory: string | undefined;
afterEach(async () => {
  vi.resetAllMocks();
  resetDatabaseForTests();
  vi.unstubAllEnvs();
  if (directory) for (let attempt = 0; attempt < 10; attempt++) {
    try { await rm(directory, { recursive: true, force: true }); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EBUSY") throw error;
      if (attempt === 9) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  directory = undefined;
});

describe("POST /api/changelog/seen", () => {
  it("requires authentication", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    expect((await POST()).status).toBe(401);
  });
  it("migrates a nullable marker and stores only the authenticated user's latest relevant entry", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "portfolio-changelog-"));
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("PORTFOLIO_DATABASE_PATH", path.join(directory, "metadata.db"));
    const user = await createUser({ displayName: "Leerling", role: "student" });
    const other = await createUser({ displayName: "Andere", role: "student" });
    expect(await getLastSeenChangelogEntryId(user.id)).toBeNull();
    vi.mocked(getAuthenticatedUser).mockResolvedValue(user);
    // The handler accepts no client id/body: even injected input cannot select another user.
    const call = POST as (request: Request) => ReturnType<typeof POST>;
    const response = await call(new Request("http://localhost/api/changelog/seen", { method: "POST", body: JSON.stringify({ userId: other.id, entryId: "invented" }) }));
    expect(response.status).toBe(200);
    expect(await getLastSeenChangelogEntryId(user.id)).toBe(getChangelogForRole(user.role)[0].id);
    expect(await getLastSeenChangelogEntryId(other.id)).toBeNull();
    expect((await (await getDatabase()).execute("SELECT version FROM schema_migrations WHERE version = '056_user_changelog_read_state'")).rows).toHaveLength(1);
  });
});
