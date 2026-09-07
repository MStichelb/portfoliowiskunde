import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppUser } from "@/lib/identity";
import type { LearningSpace } from "@/lib/repositories";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  canConfigureLearningSpace: vi.fn(),
  getAdminLearningSpaceBySlug: vi.fn(),
  settingsForm: vi.fn(),
  saveLearningSpaceAction: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

vi.mock("@/lib/auth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/authorization", () => ({ canConfigureLearningSpace: mocks.canConfigureLearningSpace }));
vi.mock("@/lib/repositories", () => ({ getAdminLearningSpaceBySlug: mocks.getAdminLearningSpaceBySlug }));
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
vi.mock("@/app/components/learning-space-lifecycle-actions", () => ({
  LearningSpaceLifecycleActions: () => <div>Lifecyclecontrols</div>,
}));

import LearningSpaceSettingsPage from "./page";

describe("LearningSpace settings page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminUser.mockResolvedValue(user("superadmin"));
    mocks.canConfigureLearningSpace.mockResolvedValue(true);
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue(space);
  });

  it("removes manager UI while preserving settings, active source and lifecycle controls", async () => {
    const markup = renderToStaticMarkup(await LearningSpaceSettingsPage({
      params: Promise.resolve({ spaceSlug: "5" }),
      searchParams: Promise.resolve({}),
    }));

    expect(mocks.settingsForm).toHaveBeenCalledWith(expect.objectContaining({
      space,
      action: mocks.saveLearningSpaceAction,
    }));
    expect(markup).toContain("Instellingenformulier");
    expect(markup).toContain("Actieve bron");
    expect(markup).toContain("Status leeromgeving");
    expect(markup).toContain("Lifecyclecontrols");
    expect(markup).not.toContain("Beheerders van deze leeromgeving");
    expect(markup).not.toContain("Als editor toevoegen");
  });

  it("keeps the existing lifecycle visibility and archived source-switch behavior", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("teacher"));
    const teacherMarkup = renderToStaticMarkup(await LearningSpaceSettingsPage({
      params: Promise.resolve({ spaceSlug: "5" }), searchParams: Promise.resolve({}),
    }));
    expect(teacherMarkup).not.toContain("Status leeromgeving");

    mocks.requireAdminUser.mockResolvedValue(user("superadmin"));
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue({ ...space, isActive: false, archivedAt: "2026-09-01T00:00:00.000Z" });
    const archivedMarkup = renderToStaticMarkup(await LearningSpaceSettingsPage({
      params: Promise.resolve({ spaceSlug: "5" }), searchParams: Promise.resolve({}),
    }));
    expect(archivedMarkup).toContain("Status leeromgeving");
    expect(archivedMarkup).not.toContain("Actieve bron");
  });
});

function user(role: AppUser["role"]): AppUser {
  return { id: role, displayName: role, firstName: null, lastName: null, email: null, role, status: "active", classGroupOverrideId: null };
}

const space: LearningSpace = {
  id: "space-5", name: "Vijfde jaar", slug: "5", shortLabel: "5WIS", description: "Oefenmateriaal", cardColor: "#DCEFE9",
  sortOrder: 5, isActive: true, archivedAt: null, sourceType: "local", localSourcePath: "C:\\Portfolio", oneDriveDriveId: null,
  oneDriveFolderId: null, oneDriveFolderPath: null, googleDriveFolderId: null, googleDriveFolderLabel: null, sources: [],
  activeSourceId: null, primarySource: null, mirrorSource: null,
};
