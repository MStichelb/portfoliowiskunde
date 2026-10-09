import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  getAccessibleLearningSpaceIds: vi.fn(),
  saveUserLearningSpaceOrder: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/authorization", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/authorization")>();
  return { ...original, getAccessibleLearningSpaceIds: mocks.getAccessibleLearningSpaceIds };
});
vi.mock("@/lib/user-learning-space-order", () => ({ saveUserLearningSpaceOrder: mocks.saveUserLearningSpaceOrder }));

import { savePersonalLearningSpaceOrderAction } from "./learning-space-order-actions";

describe("savePersonalLearningSpaceOrderAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminUser.mockResolvedValue({ id: "user-a", role: "teacher", status: "active" });
    mocks.getAccessibleLearningSpaceIds.mockResolvedValue(["space-5", "space-6"]);
  });

  it("writes only the current user's complete accessible order", async () => {
    await savePersonalLearningSpaceOrderAction(orderForm("space-6", "space-5"));

    expect(mocks.saveUserLearningSpaceOrder).toHaveBeenCalledWith("user-a", ["space-6", "space-5"]);
    expect(mocks.saveUserLearningSpaceOrder).not.toHaveBeenCalledWith("user-b", expect.anything());
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin");
  });
  it("maps persistence failure after authorization without confirming a save", async () => {
    mocks.saveUserLearningSpaceOrder.mockRejectedValueOnce(new Error("SQL secret"));
    expect(await savePersonalLearningSpaceOrderAction(orderForm("space-6", "space-5"))).toEqual({ error: "De persoonlijke volgorde kon niet worden opgeslagen. Probeer opnieuw." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    ["an inaccessible foreign ID", ["space-5", "space-foreign"]],
    ["a missing accessible ID", ["space-5"]],
    ["a duplicate ID", ["space-5", "space-5"]],
  ])("rejects %s", async (_description, ids) => {
    await expect(savePersonalLearningSpaceOrderAction(orderForm(...ids))).rejects.toThrow("ontoegankelijke of ontbrekende");
    expect(mocks.saveUserLearningSpaceOrder).not.toHaveBeenCalled();
  });
});

function orderForm(...ids: string[]): FormData {
  const form = new FormData();
  ids.forEach((id) => form.append("learningSpaceId", id));
  return form;
}
