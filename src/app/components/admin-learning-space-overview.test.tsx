import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AdminLearningSpaceCardData } from "@/lib/admin-learning-space-overview";

import { AdminLearningSpaceCard, AdminLearningSpaceCardGrid, AdminLearningSpaceOverview } from "./admin-learning-space-overview";

describe("AdminLearningSpaceOverview", () => {
  it("shows only active cards initially and exposes both overview controls", () => {
    const markup = renderToStaticMarkup(<AdminLearningSpaceOverview cards={[card(), card({ id: "archived", displayName: "Archived display name", isArchived: true })]} />);

    expect(markup).toContain("Toon details");
    expect(markup).toContain("Toon archief");
    expect((markup.match(/role="switch"/g) ?? [])).toHaveLength(2);
    expect((markup.match(/aria-checked="false"/g) ?? [])).toHaveLength(2);
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
    expect(shown).toContain("Extra");
    expect(shown).toContain("Uitdaging");
    expect(shown).toContain("Bron");
    expect(shown).toContain("OneDrive");
    expect(shown).toContain("Mirror");
    expect(shown).toContain("Google Drive");
    expect(shown).not.toContain("beschikbaar");
  });

  it("omits extra groups when none are linked", () => {
    const markup = renderToStaticMarkup(<AdminLearningSpaceCard card={card({ extraGroups: [] })} showDetails />);

    expect(markup).not.toContain("Extra groepen");
  });

  it("marks archived cards beside the short label without restoring the old badge", () => {
    const markup = renderToStaticMarkup(<AdminLearningSpaceCard card={card({ isArchived: true })} showDetails={false} />);

    expect(markup).toContain("is-archived");
    expect(markup).toContain('class="admin-space-archive-icon"');
    expect(markup).toContain('aria-label="Gearchiveerd"');
    expect(markup).not.toContain("archived-space-badge");
    expect(markup).toContain('href="/admin/five-slug"');
  });

  it("keeps owner and editor role icons unchanged on archived cards", () => {
    const owner = renderToStaticMarkup(<AdminLearningSpaceCard card={card({ isArchived: true, currentUserRole: "owner" })} showDetails={false} />);
    const editor = renderToStaticMarkup(<AdminLearningSpaceCard card={card({ isArchived: true, currentUserRole: "editor" })} showDetails={false} />);

    expect(owner).toContain('aria-label="Eigenaar"');
    expect(editor).toContain('aria-label="Bewerker"');
  });

  it("switches exclusively between active and archived cards while preserving their order", () => {
    const cards = [card({ id: "active-2", displayName: "Active 2" }), card({ id: "archived-1", displayName: "Archive 1", isArchived: true }), card({ id: "active-1", displayName: "Active 1" }), card({ id: "archived-2", displayName: "Archive 2", isArchived: true })];
    const active = renderToStaticMarkup(<AdminLearningSpaceCardGrid cards={cards} showArchive={false} showDetails={false} />);
    const archived = renderToStaticMarkup(<AdminLearningSpaceCardGrid cards={cards} showArchive showDetails={false} />);

    expect(active).toContain("Active 2");
    expect(active).toContain("Active 1");
    expect(active.indexOf("Active 2")).toBeLessThan(active.indexOf("Active 1"));
    expect(active).not.toContain("Archive 1");
    expect(archived).toContain("Archive 1");
    expect(archived).toContain("Archive 2");
    expect(archived.indexOf("Archive 1")).toBeLessThan(archived.indexOf("Archive 2"));
    expect(archived).not.toContain("Active 1");
  });

  it("shows a dedicated empty state for an empty archive", () => {
    const markup = renderToStaticMarkup(<AdminLearningSpaceCardGrid cards={[card()]} showArchive showDetails={false} />);

    expect(markup).toContain("Er zijn geen gearchiveerde leeromgevingen.");
    expect(markup).toContain("empty-state");
  });
});

function card(overrides: Partial<AdminLearningSpaceCardData> = {}): AdminLearningSpaceCardData {
  return {
    id: "space-5", slug: "five-slug", shortLabel: "5WIS", displayName: "Vijfde jaar", cardColor: "#DCEFE9",
    isArchived: false, ownerNames: ["Olivia Owner"], editorNames: ["Elias Editor"], classGroups: ["5WEWI6"], extraGroups: ["Uitdaging"],
    primarySource: "OneDrive", mirrorSource: "Google Drive", currentUserRole: null, ...overrides,
  };
}
