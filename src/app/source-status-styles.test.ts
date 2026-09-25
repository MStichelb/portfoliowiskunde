import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("source status responsive styles", () => {
  it("uses two page columns on desktop and one normal-flow column on mobile", async () => {
    const css = await globalsCss();

    expect(css).toMatch(/\.source-status-grid \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[^}]*\}/);
    expect(css).toMatch(/\.source-status-grid \{[^}]*align-items: start;[^}]*\}/);
    expect(css).toMatch(/\.source-status-section \{[^}]*align-self: start;[^}]*\}/);
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*\.source-status-grid \{ grid-template-columns: 1fr; \}/);
    expect(css).not.toContain(".source-status-dialog");
    expect(css).not.toContain("source-status-grid { width:");
    expect(css).not.toContain("source-status-grid { overflow-y:");
    expect(css).not.toContain(".source-status-warning-details { overflow");
  });

  it("adds local status spacing and lets long warning content wrap", async () => {
    const css = await globalsCss();

    expect(css).toMatch(/\.source-status-details-intro \{[^}]*margin-bottom: 14px/);
    expect(css).toMatch(/\.source-status-details \+ \.source-status-explanation \{[^}]*margin-top: 14px/);
    expect(css).toMatch(/\.source-status-warning-group li, \.source-status-warning-group \.file-reference \{[^}]*overflow-wrap: anywhere/);
  });

  it("keeps mobile header links compact and lets synchronization use its own wrapped row", async () => {
    const css = await globalsCss();

    expect(css).toMatch(/\.admin-space-header \.source-status-link, \.admin-space-header \.notification-link \{[^}]*min-height: 36px;[^}]*padding: 7px 9px;[^}]*\}/);
    expect(css).toMatch(/\.admin-space-header \.admin-actions > form \{ flex: 1 0 100%; margin-top: 0; \}/);
    expect(css).toMatch(/\.admin-space-header \.sync-submit-button \{ width: auto; \}/);
  });
});

function globalsCss(): Promise<string> {
  return readFile(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");
}
