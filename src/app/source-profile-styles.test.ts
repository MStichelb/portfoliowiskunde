import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("source profile layout styles", () => {
  it("aligns the shared-impact checkbox without changing global checkbox styles", async () => {
    const css = await globalsCss();
    expect(css).toMatch(/\.source-profile-shared-confirm \{[^}]*display: flex !important;[^}]*align-items: flex-start;[^}]*gap: 8px !important;/);
    expect(css).toMatch(/\.source-profile-shared-confirm input \{[^}]*flex: 0 0 17px;[^}]*margin: 2px 0 0;/);
  });

  it("gives the three-tab panel consistent section spacing and a responsive stack", async () => {
    const css = await globalsCss();
    expect(css).toMatch(/\.source-profile-section-tabs \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);[^}]*margin-bottom: 24px;/);
    expect(css).toMatch(/\.source-profile-tab-panel \{[^}]*padding-top: 4px;/);
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*\.source-profile-section-tabs \{[^}]*grid-template-columns: 1fr;[^}]*width: 100%;[^}]*\}/);
  });
});

async function globalsCss(): Promise<string> {
  return readFile(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");
}
