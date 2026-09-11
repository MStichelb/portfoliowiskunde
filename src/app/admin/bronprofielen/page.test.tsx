import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG } from "@/lib/source-profile-config";
import type { AppUser } from "@/lib/identity";
import type { ManagedSourceProfile } from "@/lib/source-profiles";

const mocks = vi.hoisted(() => ({ requireAdminUser: vi.fn(), getManagedSourceProfiles: vi.fn(), getSourceProfileCopyTargets: vi.fn(), listSourceProfileTemplates: vi.fn() }));

vi.mock("@/lib/auth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/source-profiles", () => ({
  getManagedSourceProfiles: mocks.getManagedSourceProfiles,
  getSourceProfileCopyTargets: mocks.getSourceProfileCopyTargets,
  sourceProfileUsageLabel: (usages: Array<{ learningSpaceShortLabel: string }>, inactiveLabel = "Inactief") =>
    usages.length === 0 ? inactiveLabel : `${usages.slice(0, 3).map((usage) => usage.learningSpaceShortLabel).join(", ")}${usages.length > 3 ? ` +${usages.length - 3}` : ""}`,
}));
vi.mock("@/lib/source-profile-templates", () => ({ listSourceProfileTemplates: mocks.listSourceProfileTemplates }));
vi.mock("./actions", () => ({
  renameManagedSourceProfileAction: vi.fn(), createSourceProfileTemplateAction: vi.fn(), updateSourceProfileTemplateAction: vi.fn(),
  duplicateSourceProfileTemplateAction: vi.fn(), setDefaultSourceProfileTemplateAction: vi.fn(), copyManagedSourceProfileAction: vi.fn(),
  copyManagedSourceProfileTemplateAction: vi.fn(), linkManagedSourceProfileAction: vi.fn(),
}));

import SourceProfilesPage from "./page";

describe("central source profile page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getManagedSourceProfiles.mockResolvedValue([profile()]);
    mocks.getSourceProfileCopyTargets.mockResolvedValue([copyTarget()]);
    mocks.listSourceProfileTemplates.mockResolvedValue([template()]);
  });

  it.each(["teacher", "superadmin"] as const)("is accessible to a %s and shows current usage", async (role) => {
    mocks.requireAdminUser.mockResolvedValue(user(role));
    mocks.getManagedSourceProfiles.mockResolvedValue([profile({ canRename: role === "superadmin" })]);
    const markup = renderToStaticMarkup(await SourceProfilesPage({ searchParams: Promise.resolve({}) }));

    expect(markup).toContain("Mijn bronprofielen");
    expect(markup).toContain("Gebruikt in:");
    expect(markup).toContain("4NW1, 5WET, 6WIS +1");
    expect(markup).not.toContain("4 actieve leeromgevingen");
    expect(markup).toContain(role === "superadmin" ? "Beheren" : "Bekijken");
    expect(mocks.getManagedSourceProfiles).toHaveBeenCalledWith(expect.objectContaining({ role }));
    expect(markup).toContain(role === "superadmin" ? "Appbrede sjablonen" : "Sjablonen");
    expect(markup).not.toContain("Appbreed sjabloon");
    expect(markup).toContain('title="Gedeeld profiel"');
    expect(markup).not.toContain("Gedeeld door 4 leeromgevingen");
    expect(markup).not.toContain("Configuratieversie");
    if (role === "teacher") expect(markup).toContain("Eigenaar: Mathias");
    expect(markup).toContain(role === "superadmin" ? "Koppelen" : "Kopiëren");
    expect(markup).toContain("source-profile-card-actions");
    expect(mocks.listSourceProfileTemplates).toHaveBeenCalledOnce();
  });

  it("shows only the template section when that tab is selected and keeps copy in a modal", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("superadmin"));
    const markup = renderToStaticMarkup(await SourceProfilesPage({ searchParams: Promise.resolve({ templateModal: "copy", template: "template-1" }) }));
    expect(markup).toContain("Appbreed sjabloon");
    expect(markup).not.toContain("TipTopPortfolio");
    expect(markup).toContain("Bronprofielsjabloon kopiëren");
    expect(markup).toContain("Doelleeromgeving");
    expect(markup).toContain("5WIS — Standaard portfolio");
    expect(markup.match(/name="managementLearningSpaceId"/g)).toHaveLength(1);
    expect(markup).not.toContain("Koppelen aan leeromgeving");
  });

  it("shows inactive profiles and reopens only a server-authorized management target", async () => {
    const inactive = profile({ id: "inactive", name: "Los profiel", usages: [], usageCount: 0, isInactive: true, canRename: false, ownerNames: ["Mathias", "Elias"] });
    mocks.requireAdminUser.mockResolvedValue(user("teacher"));
    mocks.getManagedSourceProfiles.mockResolvedValue([inactive]);

    const markup = renderToStaticMarkup(await SourceProfilesPage({ searchParams: Promise.resolve({ profile: inactive.id, error: "Naam bestaat al." }) }));
    expect(markup).toContain("Inactief");
    expect(markup).not.toContain("0 actieve leeromgevingen");
    expect(markup).toContain("Eigenaars: Mathias +1");
    expect(markup).toContain('role="dialog"');
    expect(markup).not.toContain('name="name"');
    expect(markup).toContain("dit profiel bekijken en kopiëren, maar niet wijzigen");
    expect(markup.match(/Los profiel/g)).toHaveLength(2);
    expect(markup).not.toContain("Doelleeromgeving");

    const manipulated = renderToStaticMarkup(await SourceProfilesPage({ searchParams: Promise.resolve({ profile: "foreign" }) }));
    expect(manipulated).not.toContain('role="dialog"');
  });

  it("keeps manage, copy and link in separate modals with explicit shared behavior", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("superadmin"));

    const manage = renderToStaticMarkup(await SourceProfilesPage({ searchParams: Promise.resolve({ profile: "profile-1" }) }));
    expect(manage).toContain("Dit profiel is gedeeld");
    expect(manage).toContain("4NW1");
    expect(manage).toContain("Voor alle aanpassen");
    expect(manage).toContain('name="confirmShared"');
    expect(manage).not.toContain("Configuratieversie");
    expect(manage).not.toContain("Doelleeromgeving");
    expect(manage).not.toContain("Koppelen aan leeromgeving");

    const copy = renderToStaticMarkup(await SourceProfilesPage({ searchParams: Promise.resolve({ copyProfile: "profile-1" }) }));
    expect(copy).toContain("Bronprofiel kopiëren");
    expect(copy).toContain("lucide-copy");
    expect(copy).toContain("Doelleeromgeving");
    expect(copy).toContain("5WIS — Standaard portfolio");
    expect(copy).not.toContain("Voor alle aanpassen");

    const link = renderToStaticMarkup(await SourceProfilesPage({ searchParams: Promise.resolve({ linkProfile: "profile-1" }) }));
    expect(link).toContain("Bronprofiel koppelen");
    expect(link).toContain("lucide-link-2");
    expect(link).toContain("Koppelen aan leeromgeving");
    expect(link).toContain("Latere wijzigingen aan dit profiel gelden voor alle gekoppelde leeromgevingen");
    expect(link).not.toContain("Doelleeromgeving");
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
    usageCount: 4, isInactive: false, canRename: true, ownerNames: ["Mathias"], createdAt: "2026-09-10T00:00:00.000Z", updatedAt: "2026-09-10T00:00:00.000Z",
    ...overrides,
  };
}

function user(role: "teacher" | "superadmin"): AppUser {
  return { id: role, displayName: role, firstName: role, lastName: null, email: null, role, status: "active", classGroupOverrideId: null };
}

function template() {
  return { id: "template-1", name: "Standaard portfolio", description: "Appbreed sjabloon", configVersion: 1, isDefault: true };
}

function copyTarget() {
  return {
    learningSpaceId: "space-5", learningSpaceName: "Vijfde jaar", learningSpaceShortLabel: "5WIS",
    profile: { id: "active-5", name: "Standaard portfolio", type: "custom", description: null, config: BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG,
      managementLearningSpaceId: "space-5", createdAt: "2026-09-10T00:00:00.000Z", updatedAt: "2026-09-10T00:00:00.000Z" }, canConfigure: true,
  };
}
