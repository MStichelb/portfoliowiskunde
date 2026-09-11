import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SourceProfileTemplateManager, type SourceProfileTemplateActions, type SourceProfileTemplateModal } from "./source-profile-template-manager";

const actions: SourceProfileTemplateActions = {
  create: async () => undefined,
  update: async () => undefined,
  duplicate: async () => undefined,
  setDefault: async () => undefined,
};

describe("SourceProfileTemplateManager", () => {
  it("shows templates as a distinct list without LearningSpace usage", () => {
    const markup = renderManager();
    expect(markup).toContain("Appbrede sjablonen");
    expect(markup).toContain("Nieuw sjabloon");
    expect(markup).toContain("Standaard portfolio");
    expect(markup).toContain("Configuratieversie 1");
    expect(markup).toContain("Appbreed standaardsjabloon");
    expect(markup).toContain("Standaard");
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
});

function renderManager(initialModal: SourceProfileTemplateModal | null = null, initialTemplateId?: string, error?: string): string {
  return renderToStaticMarkup(<SourceProfileTemplateManager
    templates={[
      { id: "template-1", name: "Standaard portfolio", description: "Appbreed standaardsjabloon", configVersion: 1, isDefault: true },
      { id: "template-2", name: "Eigen basis", description: null, configVersion: 1, isDefault: false },
    ]}
    actions={actions}
    initialModal={initialModal}
    initialTemplateId={initialTemplateId}
    error={error}
  />);
}
