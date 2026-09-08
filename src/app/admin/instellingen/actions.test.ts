import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  setPublicEmergencyAccess: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/public-access", () => ({ setPublicEmergencyAccess: mocks.setPublicEmergencyAccess }));
vi.mock("@/lib/repositories", () => ({ resetLocalSourcePath: vi.fn(), setLocalSourcePath: vi.fn() }));

import { setPublicEmergencyAccessAction } from "./actions";

describe("public emergency access action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ id: "admin", role: "superadmin", status: "active" });
    mocks.redirect.mockImplementation((url: string) => { throw new Error(`REDIRECT:${url}`); });
  });

  it("requires a superadmin before changing the persistent setting", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("Niet aangemeld"));
    await expect(setPublicEmergencyAccessAction(form("true"))).rejects.toThrow("Niet aangemeld");
    expect(mocks.setPublicEmergencyAccess).not.toHaveBeenCalled();
  });

  it("persists enabling and revalidates the complete admin layout", async () => {
    await expect(setPublicEmergencyAccessAction(form("true"))).rejects.toThrow("REDIRECT:/admin/verbindingen?emergency=enabled");
    expect(mocks.setPublicEmergencyAccess).toHaveBeenCalledWith(true);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin", "layout");
  });
});

function form(enabled: string): FormData {
  const data = new FormData();
  data.set("enabled", enabled);
  return data;
}
