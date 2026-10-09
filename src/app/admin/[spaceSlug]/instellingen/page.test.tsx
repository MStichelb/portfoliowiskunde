import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/components/flash-toast", () => ({
  useToast: () => vi.fn(),
  ExerciseNoteFeedback: () => null,
  FlashToast: ({ type, message, feedbackKey }: { type: string; message: string; feedbackKey?: string }) => <span data-toast={type} data-feedback-key={feedbackKey}>{message}</span>,
}));


import type { AppUser } from "@/lib/identity";
import type { LearningSpace } from "@/lib/repositories";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  canConfigureLearningSpace: vi.fn(),
  getAdminLearningSpaceBySlug: vi.fn(),
  getSourceProfileForLearningSpaceCard: vi.fn(),
  listActiveSubjects: vi.fn(),
  settingsForm: vi.fn(),
  sourceProfileCard: vi.fn(),
  saveLearningSpaceAction: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

vi.mock("@/lib/auth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/authorization", () => ({ canConfigureLearningSpace: mocks.canConfigureLearningSpace }));
vi.mock("@/lib/repositories", () => ({ getAdminLearningSpaceBySlug: mocks.getAdminLearningSpaceBySlug }));
vi.mock("@/lib/source-profiles", () => ({ getSourceProfileForLearningSpaceCard: mocks.getSourceProfileForLearningSpaceCard }));
vi.mock("@/lib/source-profile-templates", () => ({ listSourceProfileTemplates: vi.fn(async () => []) }));
vi.mock("@/lib/subjects", () => ({ listActiveSubjects: mocks.listActiveSubjects }));
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

import LearningSpaceSettingsPage from "./page";

describe("LearningSpace settings page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminUser.mockResolvedValue(user("superadmin"));
    mocks.canConfigureLearningSpace.mockResolvedValue(true);
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue(space);
    mocks.getSourceProfileForLearningSpaceCard.mockResolvedValue({ id: "profile-1", name: "Standaard portfolio" });
    mocks.listActiveSubjects.mockResolvedValue(subjects);
  });

  it("shows saved feedback through the toast and retains archived status inline", async () => {
    mocks.getAdminLearningSpaceBySlug.mockResolvedValue({ ...space, isActive: false });
    const markup = renderToStaticMarkup(await LearningSpaceSettingsPage({
      params: Promise.resolve({ spaceSlug: "5" }), searchParams: Promise.resolve({ saved: "1" }),
    }));
    expect(markup).toContain('data-toast="success" data-feedback-key="saved"');
    expect(markup).toContain("Instellingen opgeslagen.");
    expect(markup).not.toContain("save-feedback");
    expect(markup).toContain('class="archived-message" role="status"');
    expect(markup).toContain("Gearchiveerd. Deze leeromgeving is niet publiek zichtbaar");
  });

  it("passes superadmin delete rights into settings while preserving the active source", async () => {
    const markup = renderToStaticMarkup(await LearningSpaceSettingsPage({
      params: Promise.resolve({ spaceSlug: "5" }),
      searchParams: Promise.resolve({}),
    }));

    expect(mocks.settingsForm).toHaveBeenCalledWith(expect.objectContaining({
      space,
      subjects,
      canPermanentlyDelete: true,
      action: mocks.saveLearningSpaceAction,
    }));
    expect(markup).toContain("Instellingenformulier");
    expect(markup).not.toContain("Uitgebreide bronstatus");
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

  it("does not let an editor open the owner-only settings route", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("teacher"));
    mocks.canConfigureLearningSpace.mockResolvedValue(false);

    await expect(LearningSpaceSettingsPage({
      params: Promise.resolve({ spaceSlug: "5" }), searchParams: Promise.resolve({}),
    })).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mocks.settingsForm).not.toHaveBeenCalled();
    expect(mocks.sourceProfileCard).not.toHaveBeenCalled();
    expect(mocks.getSourceProfileForLearningSpaceCard).not.toHaveBeenCalled();
  });

  it("passes no profile mutation flows into the read-only card", async () => {
    renderToStaticMarkup(await LearningSpaceSettingsPage({
      params: Promise.resolve({ spaceSlug: "5" }), searchParams: Promise.resolve({}),
    }));
    const props = mocks.sourceProfileCard.mock.calls[0][0] as Record<string, unknown>;
    expect(props).toMatchObject({ profile: expect.objectContaining({ name: "Standaard portfolio" }), canConfigure: true });
    expect(props).not.toHaveProperty("actions");
    expect(props).not.toHaveProperty("initialModal");
  });

  it("does not open settings for a user without configuration rights", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("teacher"));
    mocks.canConfigureLearningSpace.mockResolvedValue(false);

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
  id: "space-5", subjectId: "subject-wiskunde", subjectName: "Wiskunde", subjectIsActive: true,
  collectionLabelSingular: "Portfolio", collectionLabelPlural: "Portfolio's",
  exerciseLabelSingular: "Oefening", exerciseLabelPlural: "Oefeningen",
  name: "Vijfde jaar", slug: "5", shortLabel: "5WIS", description: "Oefenmateriaal", cardColor: "#DCEFE9",
  sortOrder: 5, isActive: true, archivedAt: null, editorsCanManageAccess: false, sourceType: "local", localSourcePath: "C:\\Portfolio", oneDriveDriveId: null,
  oneDriveFolderId: null, oneDriveFolderPath: null, googleDriveFolderId: null, googleDriveFolderLabel: null, sources: [],
  activeSourceId: null, primarySource: null, mirrorSource: null,
};
const subjects = [{ id: "subject-wiskunde", name: "Wiskunde", sortOrder: 10, isActive: true, usageCount: 0, createdAt: "2026-09-26T00:00:00.000Z", updatedAt: "2026-09-26T00:00:00.000Z" }];
