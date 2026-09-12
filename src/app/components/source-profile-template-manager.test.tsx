import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG } from "@/lib/source-profile-config";
import { SourceProfileTemplateManager, type SourceProfileTemplateActions, type SourceProfileTemplateModal } from "./source-profile-template-manager";

const actions: SourceProfileTemplateActions = {
  create: async () => undefined,
  update: async () => undefined,
  duplicate: async () => undefined,
  setDefault: async () => undefined,
  copy: async () => undefined,
  archive: async () => undefined,
  restore: async () => undefined,
  permanentlyDelete: async () => undefined,
};

describe("SourceProfileTemplateManager", () => {
  it("shows templates as a distinct list without LearningSpace usage", () => {
    const markup = renderManager();
    expect(markup).toContain("Appbrede sjablonen");
    expect(markup).toContain("Nieuw sjabloon");
    expect(markup).toContain("Standaard portfolio");
    expect(markup).not.toContain("Configuratieversie");
    expect(markup).toContain("Appbreed standaardsjabloon");
    expect(markup).toContain("Standaard");
    expect(markup).toContain("lucide-pencil");
    expect(markup).not.toContain("Gebruikt in:");
    expect(markup).not.toContain('role="dialog"');
  });

  it("opens the compact create modal with server-resolved start choices", () => {
    const markup = renderManager("create");
    expect(markup).toContain("Nieuw bronprofielsjabloon");
    expect(markup).toContain('name="sourceTemplateId"');
    expect(markup).toContain("Standaard portfolio — standaard");
    expect(markup).toContain("Eigen basis");
    expect(markup).toContain("onafhankelijke kopie");
    expect(markup).toContain('aria-label="Sluiten"');
    expect(markup).toContain("Annuleren");
    expect(markup).toContain("Sjabloon maken");
    expect(markup.match(/<form/g)).toHaveLength(1);
  });

  it("opens manage with metadata, duplicate and default actions without nested forms", () => {
    const markup = renderManager("manage", "template-2", "Naam bestaat al.");
    expect(markup).toContain("Bronprofielsjabloon beheren");
    expect(markup).toContain('value="Eigen basis"');
    expect(markup).toContain("Sjabloon dupliceren");
    expect(markup).toContain("Als standaard instellen");
    expect(markup).toContain("Naam bestaat al.");
    expect(markup.match(/<form/g)).toHaveLength(1);
    expect(markup.match(/role="alert"/g)).toHaveLength(1);
    expect(markup).toContain("Archiveren");
    expect(markup).toContain("lucide-archive");
  });

  it("shows the explicit no-propagation confirmation before changing the default", () => {
    const markup = renderManager("default", "template-2");
    expect(markup).toContain("Standaardsjabloon wijzigen");
    expect(markup).toContain("Bestaande leeromgevingen en bronprofielen worden niet aangepast");
    expect(markup).toContain("Als standaard instellen");
    expect(markup.match(/<form/g)).toHaveLength(1);
  });

  it("rejects manipulated targets and does not offer a default switch for the current default", () => {
    expect(renderManager("manage", "foreign")).not.toContain('role="dialog"');
    expect(renderManager("default", "template-1")).not.toContain('role="dialog"');
  });

  it("keeps target selection out of cards and opens a separate copy modal", () => {
    const cards = renderManager();
    expect(cards).toContain("Kopiëren");
    expect(cards).not.toContain('name="managementLearningSpaceId"');

    const modal = renderManager("copy", "template-2");
    expect(modal).toContain("Bronprofielsjabloon kopiëren");
    expect(modal).toContain("Doelleeromgeving");
    expect(modal).toContain("6WIS — Huidig profiel");
    expect(modal).not.toContain("Koppelen");
    expect(modal.match(/<form/g)).toHaveLength(1);
  });

  it("keeps templates read-only but copyable for a teacher", () => {
    const markup = renderManager(null, undefined, undefined, false);
    expect(markup).toContain("Kopiëren");
    expect(markup).not.toContain("Beheren");
    expect(markup).not.toContain("Nieuw sjabloon");
  });

  it("hides template copy from a pure editor without an owned target", () => {
    const markup = renderManager("copy", "template-1", undefined, false, false);
    expect(markup).not.toContain("Kopiëren");
    expect(markup).not.toContain('role="dialog"');
  });

  it("shows archived templates only with restore/delete lifecycle actions", () => {
    const markup = renderManager(null, undefined, undefined, true, true, true);
    expect(markup).toContain("Toon archief");
    expect(markup).toContain("Gearchiveerd");
    expect(markup).toContain("Herstellen");
    expect(markup).toContain("Permanent verwijderen");
    expect(markup).not.toContain("Beheren");
    expect(markup).not.toContain("Kopiëren");
    expect(markup).not.toContain("Nieuw sjabloon");
    expect(renderManager("manage", "template-archived", undefined, true, true, true)).not.toContain('role="dialog"');
  });

  it("shows a clear empty state for an empty template archive", () => {
    expect(renderManager(null, undefined, undefined, true, true, true, true)).toContain("Geen gearchiveerde sjablonen.");
  });
});

function renderManager(initialModal: SourceProfileTemplateModal | null = null, initialTemplateId?: string, error?: string, canManage = true, hasCopyTargets = true, archivedOnly = false, empty = false): string {
  return renderToStaticMarkup(<SourceProfileTemplateManager
    templates={empty ? [] : archivedOnly ? [
      { id: "template-archived", name: "Oud sjabloon", description: null, configVersion: 1, isDefault: false, archivedAt: "2026-09-12T00:00:00.000Z", isArchived: true, canArchive: false },
    ] : [
      { id: "template-1", name: "Standaard portfolio", description: "Appbreed standaardsjabloon", configVersion: 1, isDefault: true, archivedAt: null, isArchived: false, canArchive: false },
      { id: "template-2", name: "Eigen basis", description: null, configVersion: 1, isDefault: false, archivedAt: null, isArchived: false, canArchive: true },
    ]}
    copyTargets={hasCopyTargets ? [{ learningSpaceId: "space-6", learningSpaceName: "Zesde jaar", learningSpaceShortLabel: "6WIS", profile: {
      id: "profile-6", type: "custom", name: "Huidig profiel", description: null, config: BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG,
      managementLearningSpaceId: "space-6", ownerUserId: "owner", archivedAt: null, createdAt: "2026-09-10", updatedAt: "2026-09-10",
    }, canConfigure: true }] : []}
    canManage={canManage}
    showArchive={archivedOnly}
    actions={actions}
    initialModal={initialModal}
    initialTemplateId={initialTemplateId}
    error={error}
  />);
}
