import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  requireLearningSpaceCreation: vi.fn(),
  createLearningSpace: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/authorization", () => ({
  requireLearningSpaceCreation: mocks.requireLearningSpaceCreation,
  requireLearningSpaceConfiguration: vi.fn(),
  requireLearningSpaceManagement: vi.fn(),
}));
vi.mock("@/lib/repositories", () => ({
  createLearningSpace: mocks.createLearningSpace,
}));

import { createLearningSpaceAction } from "./actions";

describe("createLearningSpaceAction authorization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("voert de centrale creation guard uit voordat een teacher iets kan aanmaken", async () => {
    const teacher = { id: "teacher", displayName: "Leraar", email: null, role: "teacher" as const, status: "active" as const };
    mocks.requireAdminUser.mockResolvedValue(teacher);
    mocks.requireLearningSpaceCreation.mockImplementation(() => { throw new Error("Alleen hoofdbeheerder"); });
    await expect(createLearningSpaceAction(new FormData())).rejects.toThrow("Alleen hoofdbeheerder");
    expect(mocks.requireLearningSpaceCreation).toHaveBeenCalledWith(teacher);
    expect(mocks.createLearningSpace).not.toHaveBeenCalled();
  });
});
