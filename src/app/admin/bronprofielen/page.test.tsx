import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG } from "@/lib/source-profile-config";
import type { AppUser } from "@/lib/identity";
import type { ManagedSourceProfile } from "@/lib/source-profiles";

const mocks = vi.hoisted(() => ({ requireAdminUser: vi.fn(), getManagedSourceProfiles: vi.fn() }));

vi.mock("@/lib/auth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/source-profiles", () => ({
  getManagedSourceProfiles: mocks.getManagedSourceProfiles,
  sourceProfileUsageLabel: (usages: Array<{ learningSpaceShortLabel: string }>, inactiveLabel = "Inactief") =>
    usages.length === 0 ? inactiveLabel : `${usages.slice(0, 3).map((usage) => usage.learningSpaceShortLabel).join(", ")}${usages.length > 3 ? ` +${usages.length - 3}` : ""}`,
}));
vi.mock("./actions", () => ({ renameManagedSourceProfileAction: vi.fn() }));

import SourceProfilesPage from "./page";

describe("central source profile page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getManagedSourceProfiles.mockResolvedValue([profile()]);
  });

  it.each(["teacher", "superadmin"] as const)("is accessible to a %s and shows current usage", async (role) => {
    mocks.requireAdminUser.mockResolvedValue(user(role));
    const markup = renderToStaticMarkup(await SourceProfilesPage({ searchParams: Promise.resolve({}) }));

    expect(markup).toContain("Mijn bronprofielen");
    expect(markup).toContain("Configuratieversie 1");
    expect(markup).toContain("Gebruikt in:");
    expect(markup).toContain("4NW1, 5WET, 6WIS +1");
    expect(markup).toContain("4 actieve leeromgevingen");
    expect(markup).toContain("Beheren");
    expect(mocks.getManagedSourceProfiles).toHaveBeenCalledWith(expect.objectContaining({ role }));
  });

  it("shows inactive profiles and reopens only a server-authorized management target", async () => {
    const inactive = profile({ id: "inactive", name: "Los profiel", usages: [], usageCount: 0, isInactive: true });
    mocks.requireAdminUser.mockResolvedValue(user("teacher"));
    mocks.getManagedSourceProfiles.mockResolvedValue([inactive]);

    const markup = renderToStaticMarkup(await SourceProfilesPage({ searchParams: Promise.resolve({ profile: inactive.id, error: "Naam bestaat al." }) }));
    expect(markup).toContain("Inactief");
    expect(markup).toContain("0 actieve leeromgevingen");
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('value="Los profiel"');
    expect(markup).toContain("Naam bestaat al.");

    const manipulated = renderToStaticMarkup(await SourceProfilesPage({ searchParams: Promise.resolve({ profile: "foreign" }) }));
    expect(manipulated).not.toContain('role="dialog"');
  });

  it("does not continue loading when admin authentication rejects a student", async () => {
    mocks.requireAdminUser.mockRejectedValue(new Error("NEXT_REDIRECT:/admin/login"));
    await expect(SourceProfilesPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.getManagedSourceProfiles).not.toHaveBeenCalled();
  });
});

function profile(overrides: Partial<ManagedSourceProfile> = {}): ManagedSourceProfile {
  const labels = ["4NW1", "5WET", "6WIS", "EXTRA"];
  return {
    id: "profile-1", type: "custom", name: "TipTopPortfolio", description: null,
    config: BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG, managementLearningSpaceId: "space-5",
    managementLearningSpaceName: "Vijfde jaar", managementLearningSpaceShortLabel: "5WIS",
    usages: labels.map((learningSpaceShortLabel, index) => ({ learningSpaceId: `space-${index}`, learningSpaceName: `Ruimte ${index}`, learningSpaceShortLabel })),
    usageCount: 4, isInactive: false, createdAt: "2026-09-10T00:00:00.000Z", updatedAt: "2026-09-10T00:00:00.000Z",
    ...overrides,
  };
}

function user(role: "teacher" | "superadmin"): AppUser {
  return { id: role, displayName: role, firstName: role, lastName: null, email: null, role, status: "active", classGroupOverrideId: null };
}
