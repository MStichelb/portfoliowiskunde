import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SourceProfileIconPicker, sourceProfileIconLabel } from "./source-profile-icon-picker";

describe("SourceProfileIconPicker", () => {
  it("uses the shared compact icon picker markup and configured icon", () => {
    const markup = renderToStaticMarkup(<SourceProfileIconPicker value="notebook-pen" onChange={() => undefined} />);

    expect(markup).toContain("source-profile-icon-picker-trigger");
    expect(markup).toContain('aria-label="Icoon kiezen"');
    expect(markup).toContain("lucide-notebook-pen");
  });

  it("keeps the shared human-readable icon labels", () => {
    expect(sourceProfileIconLabel("notebook-pen")).toBe("Notities");
    expect(sourceProfileIconLabel("shapes")).toBe("Vormen");
  });
});
