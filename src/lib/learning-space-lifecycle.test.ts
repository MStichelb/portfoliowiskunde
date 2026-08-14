import { describe, expect, it } from "vitest";

import { canPermanentlyDeleteLearningSpace, getLearningSpaceLifecycleActions } from "./learning-space-lifecycle";

describe("LearningSpace lifecycle policy", () => {
  it("offers only manage and archive actions for an active LearningSpace", () => {
    expect(getLearningSpaceLifecycleActions(true)).toEqual(["manage", "archive"]);
    expect(getLearningSpaceLifecycleActions(true)).not.toContain("delete");
  });

  it("offers manage, restore and delete actions for an archived LearningSpace", () => {
    expect(getLearningSpaceLifecycleActions(false)).toEqual(["manage", "restore", "delete"]);
  });

  it("allows permanent deletion only for a consistently archived record", () => {
    expect(canPermanentlyDeleteLearningSpace({ isActive: true, archivedAt: null })).toBe(false);
    expect(canPermanentlyDeleteLearningSpace({ isActive: false, archivedAt: null })).toBe(false);
    expect(canPermanentlyDeleteLearningSpace({ isActive: false, archivedAt: "2026-08-14T12:00:00.000Z" })).toBe(true);
  });
});
