import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG } from "@/lib/source-profile-config";
import type { AppUser } from "@/lib/identity";
import type { ManagedSourceProfile, SourceProfileCopyTarget } from "@/lib/source-profiles";

const mocks = vi.hoisted(() => ({ requireAdminUser: vi.fn(), getSourceProfileOverview: vi.fn(), listSourceProfileTemplates: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("@/lib/auth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/source-profiles", () => ({
  getSourceProfileOverview: mocks.getSourceProfileOverview,
  sourceProfileUsageLabel: (usages: Array<{ learningSpaceShortLabel: string }>, inactiveLabel = "Inactief") =>
    usages.length === 0 ? inactiveLabel : `${usages.slice(0, 3).map((usage) => usage.learningSpaceShortLabel).join(", ")}${usages.length > 3 ? ` +${usages.length - 3}` : ""}`,
}));
vi.mock("@/lib/source-profile-templates", () => ({ listSourceProfileTemplates: mocks.listSourceProfileTemplates }));
vi.mock("@/app/components/source-profile-owner-filter", () => ({
  SourceProfileOwnerFilter: ({ owners, selectedOwnerId }: { owners: Array<{ id: string; label: string }>; selectedOwnerId: string | null }) =>
    <label>Gebruiker<select defaultValue={selectedOwnerId ?? ""}><option value="">Alle gebruikers</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.label}</option>)}</select></label>,
}));
vi.mock("./actions", () => ({
  renameManagedSourceProfileAction: vi.fn(), saveManagedSourceProfileAction: vi.fn(), createSourceProfileTemplateAction: vi.fn(), updateSourceProfileTemplateAction: vi.fn(),
  duplicateSourceProfileTemplateAction: vi.fn(), setDefaultSourceProfileTemplateAction: vi.fn(), copyManagedSourceProfileAction: vi.fn(),
  copyManagedSourceProfileTemplateAction: vi.fn(), linkManagedSourceProfileAction: vi.fn(),
  archiveManagedSourceProfileAction: vi.fn(), restoreManagedSourceProfileAction: vi.fn(), permanentlyDeleteManagedSourceProfileAction: vi.fn(),
  archiveSourceProfileTemplateAction: vi.fn(), restoreSourceProfileTemplateAction: vi.fn(), permanentlyDeleteSourceProfileTemplateAction: vi.fn(),
  updateManagedSourceProfileGlobalResourcesAction: vi.fn(), updateSourceProfileTemplateGlobalResourcesAction: vi.fn(),
}));

import SourceProfilesPage from "./page";

describe("central source profile page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSourceProfileOverview.mockResolvedValue({ ownedProfiles: [profile()], editorAccessibleActiveProfiles: [], otherUserProfiles: [], otherProfileOwners: [], copyTargets: [copyTarget()] });
    mocks.listSourceProfileTemplates.mockResolvedValue([template()]);
  });

  it.each(["teacher", "superadmin"] as const)("is accessible to a %s and shows current usage", async (role) => {
    mocks.requireAdminUser.mockResolvedValue(user(role));
    mocks.getSourceProfileOverview.mockResolvedValue({ ownedProfiles: [profile({ ownerUserId: role, access: role === "superadmin" ? "superadmin" : "owner" })], editorAccessibleActiveProfiles: [], otherUserProfiles: [], otherProfileOwners: [], copyTargets: [copyTarget()] });
    const markup = renderToStaticMarkup(await SourceProfilesPage({ searchParams: Promise.resolve({}) }));

    expect(markup).toContain("Mijn bronprofielen");
    expect(markup).toContain("Gebruikt in:");
    expect(markup).toContain("4NW1, 5WET, 6WIS +1");
    expect(markup).not.toContain("4 actieve leeromgevingen");
    expect(markup).toContain("Beheren");
    expect(mocks.getSourceProfileOverview).toHaveBeenCalledWith(expect.objectContaining({ role }), { archivedOnly: false });
    expect(markup).toContain("Mijn bronprofielen");
    expect(markup).toContain(role === "superadmin" ? "Andere gebruikers" : "Uit leeromgevingen");
    expect(markup).toContain("Sjablonen");
    expect(markup).not.toContain("Bronprofielen uit leeromgevingen</h2>");
    expect(markup).not.toContain("Appbreed sjabloon");
    expect(markup).toContain('title="Gedeeld profiel"');
    expect(markup).not.toContain("Gedeeld door 4 leeromgevingen");
    expect(markup).not.toContain("Configuratieversie");
    expect(markup).toContain("Koppelen");
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
    const inactive = profile({ id: "inactive", name: "Los profiel", usages: [], usageCount: 0, isInactive: true });
    mocks.requireAdminUser.mockResolvedValue(user("teacher"));
    mocks.getSourceProfileOverview.mockResolvedValue({ ownedProfiles: [inactive], editorAccessibleActiveProfiles: [], otherUserProfiles: [], otherProfileOwners: [], copyTargets: [copyTarget()] });

    const markup = renderToStaticMarkup(await SourceProfilesPage({ searchParams: Promise.resolve({ profile: inactive.id, error: "Naam bestaat al." }) }));
    expect(markup).toContain("Inactief");
    expect(markup).not.toContain("0 actieve leeromgevingen");
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('name="name"');
    expect(markup.match(/Los profiel/g)).toHaveLength(2);
    expect(markup).not.toContain("Doelleeromgeving");

    const manipulated = renderToStaticMarkup(await SourceProfilesPage({ searchParams: Promise.resolve({ profile: "foreign" }) }));
    expect(manipulated).not.toContain('role="dialog"');
  });

  it("separates editor-accessible active profiles from owned profiles and keeps them read-only", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("teacher"));
    const foreign = profile({ id: "foreign", name: "Profiel collega", ownerUserId: "colleague", ownerName: "Collega", access: "editor", canRename: false, canLink: false, linkTargets: [] });
    mocks.getSourceProfileOverview.mockResolvedValue({ ownedProfiles: [profile()], editorAccessibleActiveProfiles: [foreign], otherUserProfiles: [], otherProfileOwners: [], copyTargets: [copyTarget()] });

    const markup = renderToStaticMarkup(await SourceProfilesPage({ searchParams: Promise.resolve({ tab: "editor" }) }));
    expect(markup).toContain("Bronprofielen uit leeromgevingen</h2>");
    expect(markup).toContain("Uit leeromgevingen");
    expect(markup).toContain("Eigenaar: Collega");
    expect(markup).toContain("Bekijken");
    expect(markup).toContain("source-profile-tab-section");
    const viewMarkup = renderToStaticMarkup(await SourceProfilesPage({ searchParams: Promise.resolve({ tab: "editor", profile: foreign.id }) }));
    expect(viewMarkup).toContain("Bronprofiel bekijken");
    expect(viewMarkup).toContain("Globale documenten");
    expect(viewMarkup).toContain("Opgaven");
    expect(viewMarkup).toContain("PDF");
    expect(viewMarkup).not.toContain("Globale documenten opslaan");
    expect(markup).not.toContain("TipTopPortfolio");
    expect(markup).not.toContain(`linkProfile=${foreign.id}`);
  });

  it("shows no copy entrypoint to a pure editor without an owner target", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("teacher"));
    const foreign = profile({ id: "foreign", name: "Profiel collega", ownerUserId: "colleague", ownerName: "Collega", access: "editor", canRename: false, canCopy: false, canLink: false, linkTargets: [] });
    mocks.getSourceProfileOverview.mockResolvedValue({ ownedProfiles: [], editorAccessibleActiveProfiles: [foreign], otherUserProfiles: [], otherProfileOwners: [], copyTargets: [] });

    const markup = renderToStaticMarkup(await SourceProfilesPage({ searchParams: Promise.resolve({ tab: "editor", copyProfile: foreign.id }) }));
    expect(markup).toContain("Profiel collega");
    expect(markup).toContain("Bekijken");
    expect(markup).not.toContain(`copyProfile=${foreign.id}`);
    expect(markup).not.toContain("Bronprofiel kopiëren");
  });

  it("keeps manage, copy and link in separate modals with explicit shared behavior", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("superadmin"));
    mocks.getSourceProfileOverview.mockResolvedValue({
      ownedProfiles: [profile({ ownerUserId: "superadmin" })], editorAccessibleActiveProfiles: [], otherUserProfiles: [], otherProfileOwners: [], copyTargets: [copyTarget(), otherOwnerCopyTarget()],
    });

    const manage = renderToStaticMarkup(await SourceProfilesPage({ searchParams: Promise.resolve({ profile: "profile-1" }) }));
    expect(manage).toContain("Bronprofiel beheren");
    expect(manage).toContain("Opslaan");
    expect(manage).toContain("4NW1, 5WET, 6WIS, EXTRA");
    expect(manage).not.toContain('name="confirmShared"');
    expect(manage).not.toContain("source-profile-shared-confirm");
    expect(manage).not.toContain("Configuratieversie");
    expect(manage).not.toContain("Doelleeromgeving");
    expect(manage).not.toContain("Koppelen aan leeromgeving");

    const copy = renderToStaticMarkup(await SourceProfilesPage({ searchParams: Promise.resolve({ copyProfile: "profile-1" }) }));
    expect(copy).toContain("Bronprofiel kopiëren");
    expect(copy).toContain("lucide-copy");
    expect(copy).toContain("Doelleeromgeving");
    expect(copy).toContain("5WIS — Standaard portfolio");
    expect(copy).toContain("6WIS — Profiel andere eigenaar");
    expect(copy).not.toContain("Voor alle opslaan");

    const link = renderToStaticMarkup(await SourceProfilesPage({ searchParams: Promise.resolve({ linkProfile: "profile-1" }) }));
    expect(link).toContain("Bronprofiel koppelen");
    expect(link).toContain("lucide-link-2");
    expect(link).toContain("Koppelen aan leeromgeving");
    expect(link).toContain("Latere wijzigingen aan dit profiel gelden voor alle gekoppelde leeromgevingen");
    expect(link).toContain("5WIS — Standaard portfolio");
    expect(link).not.toContain("6WIS — Profiel andere eigenaar");
    expect(link).not.toContain("Doelleeromgeving");
  });

  it("hides linking and refuses to open an empty link modal without owner-compatible targets", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("superadmin"));
    const unlinkable = profile({ canLink: false, linkTargets: [] });
    mocks.getSourceProfileOverview.mockResolvedValue({ ownedProfiles: [unlinkable], editorAccessibleActiveProfiles: [], otherUserProfiles: [], otherProfileOwners: [], copyTargets: [copyTarget()] });
    const markup = renderToStaticMarkup(await SourceProfilesPage({ searchParams: Promise.resolve({ linkProfile: unlinkable.id }) }));
    expect(markup).not.toContain(`linkProfile=${unlinkable.id}`);
    expect(markup).not.toContain("Bronprofiel koppelen");
  });

  it("shows archived profiles only on request with restore and permanent-delete actions", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("teacher"));
    const archived = profile({
      id: "archived", name: "Oud profiel", usages: [], usageCount: 0, isInactive: true,
      archivedAt: "2026-09-12T00:00:00.000Z", isArchived: true, canRename: false, canCopy: false, canLink: false, canArchive: false, linkTargets: [],
    });
    mocks.getSourceProfileOverview.mockResolvedValue({ ownedProfiles: [archived], editorAccessibleActiveProfiles: [], otherUserProfiles: [], otherProfileOwners: [], copyTargets: [copyTarget()] });

    const markup = renderToStaticMarkup(await SourceProfilesPage({ searchParams: Promise.resolve({ archive: "1" }) }));
    expect(mocks.getSourceProfileOverview).toHaveBeenCalledWith(expect.anything(), { archivedOnly: true });
    expect(markup).toContain("Gearchiveerd");
    expect(markup).toContain("Herstellen");
    expect(markup).toContain("Permanent verwijderen");
    expect(markup).toContain("Bekijken");
    expect(markup).toContain(`archive=1&amp;profile=${archived.id}`);
    const viewMarkup = renderToStaticMarkup(await SourceProfilesPage({ searchParams: Promise.resolve({ archive: "1", profile: archived.id }) }));
    expect(viewMarkup).toContain("Bronprofiel bekijken");
    expect(viewMarkup).toContain("Globale documenten");
    expect(viewMarkup).toContain("Eindoplossingen");
    expect(viewMarkup).not.toContain("Globale documenten opslaan");
    expect(markup).not.toContain("Beheren");
    expect(markup).not.toContain("Kopiëren");
    expect(markup).not.toContain("Koppelen");
  });

  it("shows a clear empty state for an empty profile archive", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("teacher"));
    mocks.getSourceProfileOverview.mockResolvedValue({ ownedProfiles: [], editorAccessibleActiveProfiles: [], otherUserProfiles: [], otherProfileOwners: [], copyTargets: [copyTarget()] });
    const markup = renderToStaticMarkup(await SourceProfilesPage({ searchParams: Promise.resolve({ archive: "1" }) }));
    expect(markup).toContain("Geen gearchiveerde bronprofielen.");
  });

  it("does not continue loading when admin authentication rejects a student", async () => {
    mocks.requireAdminUser.mockRejectedValue(new Error("NEXT_REDIRECT:/admin/login"));
    await expect(SourceProfilesPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.getSourceProfileOverview).not.toHaveBeenCalled();
  });

  it("separates superadmin-owned profiles from other users and filters the latter by owner", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("superadmin"));
    const own = profile({ id: "admin-own", name: "Eigen adminprofiel", ownerUserId: "superadmin", ownerName: "Admin", access: "superadmin" });
    const olivia = profile({ id: "olivia-profile", name: "Olivia profiel", ownerUserId: "olivia", ownerName: "Olivia", access: "superadmin" });
    const zeno = profile({ id: "zeno-profile", name: "Zeno profiel", ownerUserId: "zeno", ownerName: "Zeno", access: "superadmin" });
    mocks.getSourceProfileOverview.mockResolvedValue({
      ownedProfiles: [own], editorAccessibleActiveProfiles: [], otherUserProfiles: [olivia, zeno],
      otherProfileOwners: [{ id: "olivia", label: "Olivia" }, { id: "zeno", label: "Zeno" }], copyTargets: [copyTarget()],
    });

    const ownMarkup = renderToStaticMarkup(await SourceProfilesPage({ searchParams: Promise.resolve({}) }));
    expect(ownMarkup).toContain("Eigen adminprofiel");
    expect(ownMarkup).not.toContain("Olivia profiel");
    expect(ownMarkup).toContain("Andere gebruikers");
    expect(ownMarkup).not.toContain("Uit leeromgevingen");

    const filteredMarkup = renderToStaticMarkup(await SourceProfilesPage({ searchParams: Promise.resolve({ tab: "editor", owner: "olivia" }) }));
    expect(filteredMarkup).toContain("Bronprofielen van andere gebruikers");
    expect(filteredMarkup).toContain("Alle gebruikers");
    expect(filteredMarkup).toContain("Olivia profiel");
    expect(filteredMarkup).toContain("Eigenaar: Olivia");
    expect(filteredMarkup).not.toContain("Zeno profiel");
    expect(filteredMarkup).not.toContain("Eigen adminprofiel");
  });
});

function profile(overrides: Partial<ManagedSourceProfile> = {}): ManagedSourceProfile {
  const labels = ["4NW1", "5WET", "6WIS", "EXTRA"];
  return {
    id: "profile-1", type: "custom", name: "TipTopPortfolio", description: null,
    config: BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG, managementLearningSpaceId: "space-5", ownerUserId: "teacher", ownerName: "Mathias",
    managementLearningSpaceName: "Vijfde jaar", managementLearningSpaceShortLabel: "5WIS",
    usages: labels.map((learningSpaceShortLabel, index) => ({ learningSpaceId: `space-${index}`, learningSpaceName: `Ruimte ${index}`, learningSpaceShortLabel })),
    usageCount: 4, isInactive: false, isArchived: false, access: "owner", canRename: true, canCopy: true, canLink: true, canArchive: false, linkTargets: [copyTarget()], archivedAt: null, createdAt: "2026-09-10T00:00:00.000Z", updatedAt: "2026-09-10T00:00:00.000Z",
    ...overrides,
  };
}

function user(role: "teacher" | "superadmin"): AppUser {
  return { id: role, displayName: role, firstName: role, lastName: null, email: null, role, status: "active", classGroupOverrideId: null };
}

function template() {
  return { id: "template-1", name: "Standaard portfolio", description: "Appbreed sjabloon", configVersion: 1, isDefault: true, archivedAt: null, isArchived: false, canArchive: false };
}

function copyTarget(): SourceProfileCopyTarget {
  return {
    learningSpaceId: "space-5", learningSpaceName: "Vijfde jaar", learningSpaceShortLabel: "5WIS",
    profile: { id: "active-5", name: "Standaard portfolio", type: "custom", description: null, config: BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG,
      managementLearningSpaceId: "space-5", ownerUserId: "teacher", archivedAt: null, createdAt: "2026-09-10T00:00:00.000Z", updatedAt: "2026-09-10T00:00:00.000Z" }, canConfigure: true,
  };
}

function otherOwnerCopyTarget(): SourceProfileCopyTarget {
  return {
    learningSpaceId: "space-6", learningSpaceName: "Zesde jaar", learningSpaceShortLabel: "6WIS",
    profile: { id: "active-6", name: "Profiel andere eigenaar", type: "custom" as const, description: null, config: BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG,
      managementLearningSpaceId: "space-6", ownerUserId: "other-owner", archivedAt: null, createdAt: "2026-09-10T00:00:00.000Z", updatedAt: "2026-09-10T00:00:00.000Z" }, canConfigure: true,
  };
}
