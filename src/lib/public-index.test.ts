import { describe, expect, it, vi } from "vitest";

import { isNextPrefetchRequest, preparePublicIndex } from "./public-index";

const staleSummary = {
  startedAt: "2026-08-11T10:00:00.000Z", finishedAt: "2026-08-11T10:00:01.000Z",
  portfolioCount: 1, warningCount: 0, status: "completed", providerType: "google_drive",
  addedCount: 0, updatedCount: 0, missingCount: 0, failureMessage: null,
};

describe("public index preparation", () => {
  it("does not wait for a stale provider sync when a valid index exists", async () => {
    let deferredTask: (() => Promise<void>) | undefined;
    let finishSync: (() => void) | undefined;
    const autoSynchronize = vi.fn(() => new Promise<void>((resolve) => { finishSync = resolve; }));
    const result = await preparePublicIndex("space-5", {
      getLatestSyncSummary: async () => staleSummary,
      hasValidIndex: async () => true,
      autoSynchronize,
      defer: (task) => { deferredTask = task; },
    });

    expect(result).toBe("deferred");
    expect(autoSynchronize).not.toHaveBeenCalled();
    const background = deferredTask!();
    expect(autoSynchronize).toHaveBeenCalledWith("space-5");
    finishSync?.();
    await background;
  });

  it("waits for the necessary first sync when no valid index exists", async () => {
    let finishSync: (() => void) | undefined;
    let settled = false;
    const sync = new Promise<void>((resolve) => { finishSync = resolve; });
    const autoSynchronize = vi.fn(() => sync);
    const preparation = preparePublicIndex("space-5", {
      getLatestSyncSummary: async () => null,
      hasValidIndex: async () => false,
      autoSynchronize,
      defer: () => { throw new Error("Een eerste sync mag niet worden uitgesteld."); },
    }).then((result) => { settled = true; return result; });

    await vi.waitFor(() => expect(autoSynchronize).toHaveBeenCalledWith("space-5"));
    expect(settled).toBe(false);
    finishSync?.();
    await expect(preparation).resolves.toBe("blocking");
  });

  it("keeps the existing index available when a deferred provider sync fails", async () => {
    let deferredTask: (() => Promise<void>) | undefined;
    await expect(preparePublicIndex("space-5", {
      getLatestSyncSummary: async () => staleSummary,
      hasValidIndex: async () => true,
      autoSynchronize: async () => { throw new Error("Provider tijdelijk niet bereikbaar"); },
      defer: (task) => { deferredTask = task; },
    })).resolves.toBe("deferred");
    await expect(deferredTask!()).resolves.toBeUndefined();
  });

  it("does not schedule work for a recent index", async () => {
    const autoSynchronize = vi.fn();
    const defer = vi.fn();
    await expect(preparePublicIndex("space-5", {
      getLatestSyncSummary: async () => ({ ...staleSummary, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() }),
      hasValidIndex: async () => true,
      autoSynchronize,
      defer,
    })).resolves.toBe("fresh");
    expect(autoSynchronize).not.toHaveBeenCalled();
    expect(defer).not.toHaveBeenCalled();
  });

  it("never starts a synchronization side effect for a prefetch", async () => {
    const getLatestSyncSummary = vi.fn();
    const hasValidIndex = vi.fn();
    const autoSynchronize = vi.fn();
    const defer = vi.fn();
    await expect(preparePublicIndex("space-5", { isPrefetch: true, getLatestSyncSummary, hasValidIndex, autoSynchronize, defer })).resolves.toBe("prefetch-skipped");
    expect(getLatestSyncSummary).not.toHaveBeenCalled();
    expect(hasValidIndex).not.toHaveBeenCalled();
    expect(autoSynchronize).not.toHaveBeenCalled();
    expect(defer).not.toHaveBeenCalled();
  });

  it("recognizes both Next and browser prefetch headers", () => {
    expect(isNextPrefetchRequest(new Headers({ "next-router-prefetch": "1" }))).toBe(true);
    expect(isNextPrefetchRequest(new Headers({ purpose: "prefetch" }))).toBe(true);
    expect(isNextPrefetchRequest(new Headers())).toBe(false);
  });
});
