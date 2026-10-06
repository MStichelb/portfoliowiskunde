import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "./identity";
const mocks = vi.hoisted(() => ({ allowed: vi.fn(), space: vi.fn() }));
vi.mock("./authorization", () => ({ getManageableLearningSpaceIds: mocks.allowed }));
vi.mock("./repositories", () => ({ getLearningSpace: mocks.space }));
import { loadSourceProfilePresentationSpaces } from "./source-profile-presentation-loader";

const user = { id: "teacher", role: "teacher", status: "active" } as AppUser;
const usages = ["b", "a", "forbidden"].map((id) => ({ learningSpaceId: id, learningSpaceName: id, learningSpaceShortLabel: id }));
describe("authorized terminology context loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.allowed.mockResolvedValue(["a", "b", "unlinked"]);
    mocks.space.mockImplementation(async (id: string) => ({ id, name: id, shortLabel: id, sortOrder: id === "a" ? 1 : 2, collectionLabelPlural: "Hoofdstukken" }));
  });
  it("loads only actual, manageable links and follows the LearningSpace order", async () => {
    const contexts = await loadSourceProfilePresentationSpaces(user, usages);
    expect(contexts.map((space) => space.id)).toEqual(["a", "b"]);
    expect(mocks.allowed).toHaveBeenCalledWith(user);
    expect(mocks.space).toHaveBeenCalledTimes(2);
    expect(mocks.space).not.toHaveBeenCalledWith("forbidden");
    expect(mocks.space).not.toHaveBeenCalledWith("unlinked");
    expect(contexts[0].collectionLabelPlural).toBe("Hoofdstukken");
  });
  it("uses no context for an unlinked or inaccessible profile", async () => {
    expect(await loadSourceProfilePresentationSpaces(user, [])).toEqual([]);
    expect(mocks.allowed).not.toHaveBeenCalled();
    mocks.allowed.mockResolvedValue([]);
    expect(await loadSourceProfilePresentationSpaces(user, usages)).toEqual([]);
    expect(mocks.space).not.toHaveBeenCalled();
  });
});
