import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("source profile layout styles", () => {
  it("aligns the shared-impact checkbox without changing global checkbox styles", async () => {
    const css = await globalsCss();
    expect(css).toMatch(/\.source-profile-dialog-form \.source-profile-shared-confirm \{[^}]*display: flex;[^}]*align-items: flex-start;[^}]*gap: 8px;[^}]*cursor: pointer;/);
    expect(css).toMatch(/\.source-profile-dialog-form \.source-profile-shared-confirm input \{[^}]*flex: 0 0 17px;[^}]*width: 17px;[^}]*height: 17px;[^}]*min-height: 0;[^}]*margin: 1px 0 0;[^}]*padding: 0;/);
  });

  it("gives the three-tab panel consistent section spacing and a responsive stack", async () => {
    const css = await globalsCss();
    expect(css).toMatch(/\.source-profile-section-tabs \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);[^}]*margin-bottom: 24px;/);
    expect(css).toMatch(/\.source-profile-section-tabs button \{[^}]*display: flex;[^}]*align-items: center;[^}]*justify-content: center;[^}]*line-height: 1\.2;[^}]*white-space: nowrap;/);
    expect(css).toMatch(/\.source-profile-tab-panel \{[^}]*padding-top: 4px;/);
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*\.source-profile-section-tabs \{[^}]*grid-template-columns: 1fr;[^}]*width: 100%;[^}]*\}/);
  });

  it("keeps the owner filter compact with space before the profile cards", async () => {
    const css = await globalsCss();
    expect(css).toMatch(/\.source-profile-owner-filter \{[^}]*display: flex;[^}]*margin: 20px 0 16px;/);
    expect(css).toMatch(/\.source-profile-owner-filter \.filter-control \{[^}]*flex: 0 1 280px;/);
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*\.source-profile-owner-filter, \.source-profile-owner-filter \.filter-control \{ width: 100%; \}/);
  });
  it("keeps shared editor content aligned and permits narrow layouts without hiding overflow", async () => {
    const css = await globalsCss();
    const editorCss = css.slice(css.indexOf("/* One presentation rhythm"));
    expect(editorCss).toMatch(/max-width: 760px; min-width: 0; margin-inline: auto/);
    expect(editorCss).toMatch(/source-profile-editor-tabs \{[^}]*display: flex;[^}]*flex-wrap: nowrap;[^}]*overflow-x: auto/);
    expect(editorCss).toContain(".source-profile-editor-panel[hidden] { display: none; }");
    expect(editorCss).toMatch(/@container \(max-width: 560px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
    expect(editorCss).not.toContain("overflow-x: hidden");
  });

  it("reuses the admin label pattern and one content rhythm across every editor tab", async () => {
    const css = await globalsCss();
    const moduleCss = await readFile(path.join(process.cwd(), "src/app/components/portfolio-resource-scanner-v2.module.css"), "utf8");
    expect(css).toMatch(/\.learning-space-settings-form label, \.source-profile-dialog-form label, \.admin-form-label[^{}]*\{ display: grid; gap: 6px; color: #314149; font-size: 14px; font-weight: 700;/);
    expect(moduleCss).toContain("composes: admin-form-label from global;");
    expect(css).not.toContain(".source-profile-config-sections label { font-weight: 500;");
    expect(css).toMatch(/\.source-profile-editor-panel \{[^}]*min-width: 0;[^}]*padding-block: 18px 6px;/);
    expect(css).not.toContain(".source-profile-config-sections > [id]");
    expect(css).toContain(".source-profile-editor-panel .source-profile-resource-editor { margin-top: 0; padding-top: 0; border-top: 0; }");
  });
  it("anchors editor dialogs at the top while retaining viewport limits and scrolling", async () => {
    const css = await globalsCss();
    expect(css).toMatch(/\.source-profile-editor-backdrop(?:\s*,[^{}]+)?\s*\{[^}]*align-items: start;[^}]*padding-top: clamp\(24px, 5vh, 48px\);/);
    expect(css).toContain("max-height: calc(100dvh - clamp(24px, 5vh, 48px) - 20px)");
    expect(css).toMatch(/\.source-profile-dialog-wide \{[^}]*overflow-y: auto/);
    expect(css).toMatch(/@media \(max-width: 600px\)\s*\{\s*\.source-profile-editor-backdrop(?:\s*,[^{}]+)?\s*\{[^}]*padding-top: 16px;/);
  });

});

async function globalsCss(): Promise<string> {
  return readFile(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");
}
