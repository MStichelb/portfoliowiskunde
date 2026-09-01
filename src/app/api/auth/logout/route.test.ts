import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createUserSession, resolveUserSession, SESSION_COOKIE } from "@/lib/auth";
import { resetDatabaseForTests } from "@/lib/database";
import { createUser } from "@/lib/identity";

import { POST } from "./route";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  vi.unstubAllEnvs();
  resetDatabaseForTests();
  delete process.env.PORTFOLIO_DATABASE_PATH;
  if (temporaryDirectory) await removeTemporaryDirectory(temporaryDirectory);
  temporaryDirectory = undefined;
});

async function removeTemporaryDirectory(directory: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EBUSY") throw error;
      if (attempt === 9) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

describe("POST /api/auth/logout", () => {
  it("revokes the database session and clears the HttpOnly cookie", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "portfolio-logout-"));
    process.env.PORTFOLIO_DATABASE_PATH = path.join(temporaryDirectory, "metadata.db");
    vi.stubEnv("ADMIN_SESSION_SECRET", "a-session-secret-that-is-long-enough");
    resetDatabaseForTests();
    const user = await createUser({ displayName: "Leerling", role: "student" });
    const session = await createUserSession(user.id);
    const request = new NextRequest("http://localhost:3000/api/auth/logout", { method: "POST", headers: { cookie: `${SESSION_COOKIE}=${session.token}` } });
    const response = await POST(request);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/aanmelden");
    expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/i);
    expect(await resolveUserSession(session.token)).toBeNull();
  });
});
