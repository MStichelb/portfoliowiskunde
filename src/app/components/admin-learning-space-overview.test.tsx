import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AdminLearningSpaceCardData } from "@/lib/admin-learning-space-overview";

import { AdminLearningSpaceCard, AdminLearningSpaceOverview } from "./admin-learning-space-overview";

describe("AdminLearningSpaceOverview", () => {
  it("shows only active cards initially and exposes both overview controls", () => {
    const markup = renderToStaticMarkup(<AdminLearningSpaceOverview cards={[card(), card({ id: "archived", isArchived: true })]} />);

    expect(markup).toContain("Toon details");
    expect(markup).toContain("Toon archief");
    expect(markup).toContain("Vijfde jaar");
    expect(markup).not.toContain("Archived display name");
  });

  it("renders short label, display name and owner without using the slug as its title", () => {
    const markup = renderToStaticMarkup(<AdminLearningSpaceCard card={card()} showDetails={false} />);

    expect(markup).toContain("5WIS");
    expect(markup).toContain("Vijfde jaar");
    expect(markup).toContain("Olivia Owner");
    expect(markup).not.toContain(">five-slug<");
    expect(markup).not.toContain("Bewerkers");
  });

  it.each([
    ["owner", "Eigenaar"],
    ["editor", "Bewerker"],
  ] as const)("renders the explicit %s role icon", (currentUserRole, label) => {
    const markup = renderToStaticMarkup(<AdminLearningSpaceCard card={card({ currentUserRole })} showDetails={false} />);

    expect(markup).toContain(`aria-label="${label}"`);
    expect(markup).toContain(`title="${label}"`);
  });

  it("renders no role icon without an explicit owner/editor membership", () => {
    const markup = renderToStaticMarkup(<AdminLearningSpaceCard card={card({ currentUserRole: null })} showDetails={false} />);

    expect(markup).not.toContain('class="admin-space-role-icon"');
  });

  it("shows compact details only when requested", () => {
    const hidden = renderToStaticMarkup(<AdminLearningSpaceCard card={card()} showDetails={false} />);
    const shown = renderToStaticMarkup(<AdminLearningSpaceCard card={card()} showDetails />);

    expect(hidden).not.toContain("Elias Editor");
    expect(shown).toContain("Bewerkers");
    expect(shown).toContain("Elias Editor");
    expect(shown).toContain("Klassen");
    expect(shown).toContain("5WEWI6");
    expect(shown).toContain("Bron");
    expect(shown).toContain("OneDrive");
    expect(shown).toContain("Mirror");
    expect(shown).toContain("Google Drive · beschikbaar");
  });

  it("marks archived cards without removing their admin link", () => {
    const markup = renderToStaticMarkup(<AdminLearningSpaceCard card={card({ isArchived: true })} showDetails={false} />);

    expect(markup).toContain("is-archived");
    expect(markup).toContain("Gearchiveerd");
    expect(markup).toContain('href="/admin/five-slug"');
  });
});

function card(overrides: Partial<AdminLearningSpaceCardData> = {}): AdminLearningSpaceCardData {
  return {
    id: "space-5", slug: "five-slug", shortLabel: "5WIS", displayName: "Vijfde jaar", cardColor: "#DCEFE9",
    isArchived: false, ownerNames: ["Olivia Owner"], editorNames: ["Elias Editor"], classGroups: ["5WEWI6"],
    primarySource: "OneDrive", mirrorSource: "Google Drive · beschikbaar", currentUserRole: null, ...overrides,
  };
}
