import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SourceProfileSectionTabs, type SourceProfileSectionTab } from "./source-profile-section-tabs";

describe("SourceProfileSectionTabs", () => {
  it.each([
    ["owned", "OWNED PANEL"],
    ["editor", "EDITOR PANEL"],
    ["templates", "TEMPLATE PANEL"],
  ] as const)("renders exactly the active %s panel", (initialTab, visibleText) => {
    const markup = renderTabs(initialTab);
    expect(markup).toContain("Mijn bronprofielen");
    expect(markup).toContain("Uit leeromgevingen");
    expect(markup).toContain("Sjablonen");
    expect(markup).toContain(visibleText);
    expect(["OWNED PANEL", "EDITOR PANEL", "TEMPLATE PANEL"].filter((text) => markup.includes(text))).toHaveLength(1);
    expect(markup.match(/role="tabpanel"/g)).toHaveLength(1);
    expect(markup.match(/aria-selected="true"/g)).toHaveLength(1);
  });

  it("uses the superadmin label without changing the one-panel behavior", () => {
    const markup = renderToStaticMarkup(<SourceProfileSectionTabs
      ownedSection={<section>OWNED PANEL</section>}
      editorSection={<section>OTHER USERS PANEL</section>}
      templateSection={<section>TEMPLATE PANEL</section>}
      secondTabLabel="Andere gebruikers"
      initialTab="editor"
    />);
    expect(markup).toContain("Andere gebruikers");
    expect(markup).not.toContain("Uit leeromgevingen");
    expect(markup).toContain("OTHER USERS PANEL");
    expect(markup.match(/role="tabpanel"/g)).toHaveLength(1);
  });
});

function renderTabs(initialTab: SourceProfileSectionTab): string {
  return renderToStaticMarkup(<SourceProfileSectionTabs
    ownedSection={<section>OWNED PANEL</section>}
    editorSection={<section>EDITOR PANEL</section>}
    templateSection={<section>TEMPLATE PANEL</section>}
    initialTab={initialTab}
  />);
}
