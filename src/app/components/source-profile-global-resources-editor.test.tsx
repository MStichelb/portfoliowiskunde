import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG } from "@/lib/source-profile-config";
import { SourceProfileGlobalResourcesEditor, SourceProfileGlobalResourcesViewer } from "./source-profile-global-resources-editor";

const action = async () => undefined;

describe("SourceProfileGlobalResourcesEditor", () => {
  it("renders compact resource summaries, help and the typed legacy resources", () => {
    const markup = renderToStaticMarkup(<SourceProfileGlobalResourcesEditor
      resources={BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.globalResources}
      action={action}
      ownerIdField="sourceProfileId"
      ownerId="profile-1"
    />);
    expect(markup).toContain("Globale documenten");
    expect(markup).toContain("Uitleg over globale documenten");
    expect(markup).toContain("Opgaven");
    expect(markup).toContain("Hints");
    expect(markup).toContain("Eindoplossingen");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('name="resourcesJson"');
    expect(markup).toContain("3/10");
    expect(markup).not.toContain('role="switch"');
    expect(markup).not.toContain("Herkenningstekst");
  });

  it("adds the shared confirmation only for a shared concrete profile", () => {
    const shared = renderToStaticMarkup(<SourceProfileGlobalResourcesEditor
      resources={BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.globalResources}
      action={action}
      ownerIdField="sourceProfileId"
      ownerId="profile-1"
      shared
    />);
    expect(shared).toContain("alle gekoppelde leeromgevingen");

    const template = renderToStaticMarkup(<SourceProfileGlobalResourcesEditor
      resources={BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.globalResources}
      action={action}
      ownerIdField="templateId"
      ownerId="template-1"
    />);
    expect(template).not.toContain("alle gekoppelde leeromgevingen");
  });
  it("renders all global resource details in read-only mode", () => {
    const markup = renderToStaticMarkup(<SourceProfileGlobalResourcesViewer resources={BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG.globalResources} />);
    expect(markup).toContain("Deze configuratie is alleen-lezen.");
    expect(markup).toContain("Opgaven");
    expect(markup).toContain("Begint met");
    expect(markup).not.toContain("<dt>Label</dt>");
    expect(markup).not.toContain("<dt>Betekenis</dt>");
    expect(markup).toContain("PDF");
    expect(markup).toContain("Niet hoofdlettergevoelig");
    expect(markup).not.toContain(">Icoon<");
    expect(markup).not.toContain("Document toevoegen");
    expect(markup).not.toContain("Globale documenten opslaan");
  });

});
