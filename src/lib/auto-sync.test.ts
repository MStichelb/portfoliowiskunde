import { describe, expect, it } from "vitest";

import { isSyncStale, maybeAutoSynchronize } from "./auto-sync";
import { SourceConfigurationError } from "./source-errors";
import { safeSynchronizationError } from "./sync";

describe("automatic synchronization freshness", () => {
  const now = Date.parse("2026-08-11T12:00:00.000Z");

  it("requests a sync when no successful timestamp is known or it is stale", () => {
    expect(isSyncStale(null, now, 180)).toBe(true);
    expect(isSyncStale("2026-08-11T11:56:59.000Z", now, 180)).toBe(true);
  });

  it("does not request a sync for recent metadata", () => {
    expect(isSyncStale("2026-08-11T11:58:00.000Z", now, 180)).toBe(false);
  });

  it("falls back to a safe TTL when configuration is invalid", () => {
    expect(isSyncStale("2026-08-11T11:58:00.000Z", now, Number.NaN)).toBe(false);
    expect(isSyncStale("2026-08-11T11:56:00.000Z", now, Number.NaN)).toBe(true);
  });

  it("keeps serving when a best-effort automatic sync fails", async () => {
    await expect(maybeAutoSynchronize("failure-test", {
      getLatestSyncSummary: async () => null,
      synchronize: async () => { throw new Error("Graph is tijdelijk niet bereikbaar"); },
    })).resolves.toBeUndefined();
  });

  it("deduplicates concurrent synchronization within one process", async () => {
    let calls = 0;
    let finish: (() => void) | undefined;
    const synchronize = () => {
      calls += 1;
      return new Promise<void>((resolve) => { finish = resolve; });
    };
    const dependencies = { getLatestSyncSummary: async () => null, synchronize };
    const first = maybeAutoSynchronize("dedupe-test", dependencies);
    const second = maybeAutoSynchronize("dedupe-test", dependencies);
    await Promise.resolve();
    expect(calls).toBe(1);
    finish?.();
    await Promise.all([first, second]);
  });

  it("logs diagnostic sync details without exposing an absolute local source path", () => {
    const ioError = Object.assign(new Error("ENOENT: scandir 'C:\\Users\\teacher\\private-source'"), { code: "ENOENT" });
    expect(safeSynchronizationError(ioError, "space-5", "local", "indexing")).toMatchObject({
      learningSpaceId: "space-5", providerType: "local", stage: "indexing", errorName: "Error",
      errorMessage: "ENOENT: de lokale bron kon niet worden gelezen.", errorCode: "ENOENT",
    });
    const configuration = safeSynchronizationError(new SourceConfigurationError("Driveconfiguratie ontbreekt."), "space-5", "onedrive", "provider-resolution");
    expect(configuration.errorName).toBe("SourceConfigurationError");
    expect(JSON.stringify(configuration)).not.toContain("private-source");
  });
});
