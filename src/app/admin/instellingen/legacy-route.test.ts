import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), redirect: vi.fn() }));

vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import LegacySettingsPage from "./page";

describe("legacy global settings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ id: "admin", role: "superadmin", status: "active" });
    mocks.redirect.mockImplementation((url: string) => { throw new Error(`REDIRECT:${url}`); });
  });

  it("redirects an authorized superadmin to the canonical admin overview", async () => {
    await expect(LegacySettingsPage()).rejects.toThrow("REDIRECT:/admin");
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
  });

  it("preserves the existing superadmin authorization boundary", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("Alleen hoofdbeheerders hebben toegang."));

    await expect(LegacySettingsPage()).rejects.toThrow("Alleen hoofdbeheerders");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
