import { describe, expect, it } from "vitest";

import { isSyncStale } from "./auto-sync";

describe("automatic synchronization freshness", () => {
  const now = Date.parse("2026-08-11T12:00:00.000Z");

  it("requests a sync when no successful timestamp is known or it is stale", () => {
    expect(isSyncStale(null, now, 180)).toBe(true);
    expect(isSyncStale("2026-08-11T11:56:59.000Z", now, 180)).toBe(true);
  });

  it("does not request a sync for recent metadata", () => {
    expect(isSyncStale("2026-08-11T11:58:00.000Z", now, 180)).toBe(false);
  });
});
