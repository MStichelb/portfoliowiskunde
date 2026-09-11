import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppUser } from "@/lib/identity";
import type { LearningSpace } from "@/lib/repositories";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  canConfigureLearningSpace: vi.fn(),
  canManageLearningSpace: vi.fn(),
  getAdminLearningSpaceBySlug: vi.fn(),
  getSourceProfileAdminModel: vi.fn(),
  listSourceProfileTemplates: vi.fn(),
  settingsForm: vi.fn(),
  sourceProfileCard: vi.fn(),
  saveLearningSpaceAction: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

vi.mock("@/lib/auth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/authorization", () => ({ canConfigureLearningSpace: mocks.canConfigureLearningSpace, canManageLearningSpace: mocks.canManageLearningSpace }));
vi.mock("@/lib/repositories", () => ({ getAdminLearningSpaceBySlug: mocks.getAdminLearningSpaceBySlug }));
vi.mock("@/lib/source-profiles", () => ({ getSourceProfileAdminModel: mocks.getSourceProfileAdminModel }));
vi.mock("@/lib/source-profile-templates", () => ({ listSourceProfileTemplates: mocks.listSourceProfileTemplates }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("../../actions", () => ({ saveLearningSpaceAction: mocks.saveLearningSpaceAction }));
vi.mock("@/app/components/admin-space-header", () => ({
  AdminSpaceHeader: () => <div>Instellingenheader</div>,
}));
vi.mock("@/app/components/learning-space-settings-form", () => ({
  LearningSpaceSettingsForm: (props: unknown) => {
    mocks.settingsForm(props);
    return <div>Instellingenformulier</div>;
  },
}));
vi.mock("@/app/components/source-switch-panel", () => ({
  SourceSwitchPanel: () => <section>Actieve bron</section>,
}));
vi.mock("@/app/components/source-profile-card", () => ({
  SourceProfileCard: (props: unknown) => {
    mocks.sourceProfileCard(props);
    return <section>Bronprofiel: Standaard portfolio</section>;
  },
}));
vi.mock("./actions", () => ({
  linkSourceProfileAction: vi.fn(), copySelectedSourceProfileAction: vi.fn(), copySourceProfileTemplateAction: vi.fn(), createOwnSourceProfileAction: vi.fn(), copySourceProfileAction: vi.fn(), renameSourceProfileAction: vi.fn(),
}));

import LearningSpaceSettingsPage from "./page";

describe("LearningSpace settings page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminUser.mockResolvedValue(user("superadmin"));
    mocks.canConfigureLearningSpace.mockResolvedValue(true);
    mocks.canManageLearningSpace.mockResolvedValue(true);
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue(space);
    mocks.getSourceProfileAdminModel.mockResolvedValue({ activeProfile: { name: "Standaard portfolio" }, availableProfiles: [], copyTargets: [] });
    mocks.listSourceProfileTemplates.mockResolvedValue([]);
  });

  it("passes superadmin delete rights into settings while preserving the active source", async () => {
    const markup = renderToStaticMarkup(await LearningSpaceSettingsPage({
      params: Promise.resolve({ spaceSlug: "5" }),
      searchParams: Promise.resolve({}),
    }));

    expect(mocks.settingsForm).toHaveBeenCalledWith(expect.objectContaining({
      space,
      canPermanentlyDelete: true,
      action: mocks.saveLearningSpaceAction,
    }));
    expect(markup).toContain("Instellingenformulier");
    expect(markup).toContain("Bronprofiel: Standaard portfolio");
    expect(markup).toContain("Actieve bron");
    expect(markup).not.toContain("Status leeromgeving");
    expect(markup).not.toContain("Beheerders van deze leeromgeving");
    expect(markup).not.toContain("Als editor toevoegen");
  });

  it("keeps permanent deletion out of owner settings and hides source switching when archived", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("teacher"));
    const teacherMarkup = renderToStaticMarkup(await LearningSpaceSettingsPage({
      params: Promise.resolve({ spaceSlug: "5" }), searchParams: Promise.resolve({}),
    }));
    expect(mocks.settingsForm).toHaveBeenLastCalledWith(expect.objectContaining({ canPermanentlyDelete: false }));
    expect(teacherMarkup).not.toContain("Status leeromgeving");

    mocks.requireAdminUser.mockResolvedValue(user("superadmin"));
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue({ ...space, isActive: false, archivedAt: "2026-09-01T00:00:00.000Z" });
    const archivedMarkup = renderToStaticMarkup(await LearningSpaceSettingsPage({
      params: Promise.resolve({ spaceSlug: "5" }), searchParams: Promise.resolve({}),
    }));
    expect(mocks.settingsForm).toHaveBeenLastCalledWith(expect.objectContaining({ canPermanentlyDelete: true }));
    expect(archivedMarkup).not.toContain("Status leeromgeving");
    expect(archivedMarkup).not.toContain("Actieve bron");
  });

  it("lets an editor manage only the source profile card", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("teacher"));
    mocks.canConfigureLearningSpace.mockResolvedValue(false);

    const markup = renderToStaticMarkup(await LearningSpaceSettingsPage({
      params: Promise.resolve({ spaceSlug: "5" }), searchParams: Promise.resolve({}),
    }));

    expect(markup).toContain("Bronprofiel: Standaard portfolio");
    expect(markup).not.toContain("Instellingenformulier");
    expect(markup).not.toContain("Actieve bron");
    expect(mocks.sourceProfileCard).toHaveBeenCalledWith(expect.objectContaining({ canConfigure: false }));
  });

  it("reopens only the failed modal and keeps successful mutations closed", async () => {
    renderToStaticMarkup(await LearningSpaceSettingsPage({
      params: Promise.resolve({ spaceSlug: "5" }),
      searchParams: Promise.resolve({ profileError: "Ongeldige naam.", profileModal: "rename" }),
    }));
    expect(mocks.sourceProfileCard).toHaveBeenLastCalledWith(expect.objectContaining({
      error: "Ongeldige naam.",
      initialModal: "rename",
    }));

    renderToStaticMarkup(await LearningSpaceSettingsPage({
      params: Promise.resolve({ spaceSlug: "5" }),
      searchParams: Promise.resolve({ profileSaved: "renamed" }),
    }));
    expect(mocks.sourceProfileCard).toHaveBeenLastCalledWith(expect.objectContaining({
      feedback: "Profielnaam gewijzigd.",
      initialModal: null,
    }));
  });

  it("does not open settings for a user without configuration rights", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("teacher"));
    mocks.canManageLearningSpace.mockResolvedValue(false);

    await expect(LearningSpaceSettingsPage({
      params: Promise.resolve({ spaceSlug: "5" }), searchParams: Promise.resolve({}),
    })).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mocks.settingsForm).not.toHaveBeenCalled();
  });
});

function user(role: AppUser["role"]): AppUser {
  return { id: role, displayName: role, firstName: null, lastName: null, email: null, role, status: "active", classGroupOverrideId: null };
}

const space: LearningSpace = {
  id: "space-5", name: "Vijfde jaar", slug: "5", shortLabel: "5WIS", description: "Oefenmateriaal", cardColor: "#DCEFE9",
  sortOrder: 5, isActive: true, archivedAt: null, editorsCanManageAccess: false, sourceType: "local", localSourcePath: "C:\\Portfolio", oneDriveDriveId: null,
  oneDriveFolderId: null, oneDriveFolderPath: null, googleDriveFolderId: null, googleDriveFolderLabel: null, sources: [],
  activeSourceId: null, primarySource: null, mirrorSource: null,
};
