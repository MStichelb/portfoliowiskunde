import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), getLearningSpaces: vi.fn() }));

vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/repositories", () => ({ getLearningSpaces: mocks.getLearningSpaces }));
vi.mock("@/app/components/active-source-badge", () => ({ LearningSpaceSourceSummary: () => null }));
vi.mock("@/app/components/learning-space-create-form", () => ({ LearningSpaceCreateForm: () => <div data-testid="create-form" /> }));
vi.mock("@/app/components/learning-space-lifecycle-actions", () => ({ LearningSpaceLifecycleActions: () => null }));
vi.mock("../actions", () => ({ createLearningSpaceAction: vi.fn() }));

import SettingsPage from "./page";

describe("legacy settings sections", () => {
  it("no longer renders the moved connection and emergency-access sections", async () => {
    mocks.getLearningSpaces.mockResolvedValue([]);

    const markup = renderToStaticMarkup(await SettingsPage({ searchParams: Promise.resolve({}) }));

    expect(markup).toContain("Actieve leeromgevingen");
    expect(markup).toContain("Leeromgeving toevoegen");
    expect(markup).not.toContain('id="emergency-access-heading"');
    expect(markup).not.toContain('id="connections-heading"');
    expect(markup).not.toContain("App-brede toegang voor cloudbronnen");
  });
});
