import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  renameManagedSourceProfile: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((destination: string) => { throw new Error(`NEXT_REDIRECT:${destination}`); }),
}));

vi.mock("@/lib/auth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/source-profiles", () => ({ renameManagedSourceProfile: mocks.renameManagedSourceProfile }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { renameManagedSourceProfileAction } from "./actions";

describe("central source profile actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminUser.mockResolvedValue({ id: "teacher", role: "teacher", status: "active" });
    mocks.renameManagedSourceProfile.mockResolvedValue(undefined);
  });

  it("uses the authenticated user and redirects after a successful rename", async () => {
    await expect(renameManagedSourceProfileAction(form("profile-1", " Nieuwe naam "))).rejects.toThrow("saved=renamed");
    expect(mocks.renameManagedSourceProfile).toHaveBeenCalledWith(expect.objectContaining({ id: "teacher" }), "profile-1", "Nieuwe naam");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/bronprofielen");
  });

  it("keeps a rejected or foreign profile id inside the central modal", async () => {
    mocks.renameManagedSourceProfile.mockRejectedValue(new Error("Bronprofiel niet beschikbaar."));
    await expect(renameManagedSourceProfileAction(form("foreign", "Naam"))).rejects.toThrow("profile=foreign");
    expect(mocks.redirect).toHaveBeenCalledWith(expect.stringContaining("error=Bronprofiel%20niet%20beschikbaar."));
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

function form(sourceProfileId: string, name: string): FormData {
  const data = new FormData();
  data.set("sourceProfileId", sourceProfileId);
  data.set("name", name);
  return data;
}
