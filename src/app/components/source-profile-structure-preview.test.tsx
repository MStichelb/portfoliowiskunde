import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG } from "@/lib/source-profile-config";
import type { LearningSpaceTerminologyInput } from "@/lib/collection-terminology";
import { SourceProfileStructurePreview } from "./source-profile-structure-preview";

const state = vi.hoisted(() => ({ shown: false, terminology: {} as LearningSpaceTerminologyInput }));
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  return { ...react, useState: () => [state.shown, (value: boolean) => { state.shown = value; }] };
});
vi.mock("./source-profile-presentation", () => ({ useSourceProfileTerminology: () => state.terminology }));
const config = structuredClone(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
config.scanner.portfolio.themeMode = "folder";
const props = { scanner: config.scanner.exercise, portfolioScanner: config.scanner.portfolio, resources: config.exerciseResources, globalResources: config.globalResources, levelRecognition: config.levelRecognition };
const render = () => renderToStaticMarkup(SourceProfileStructurePreview(props));

// Invoke the real slider-switch handler, then render with the updated local state.
function toggle(checked: boolean) {
  const tree = SourceProfileStructurePreview(props);
  if (state.shown !== checked) tree.props.children[0].props.children[2].props.onClick();
}
function names(markup: string) {
  const tree = markup.split('aria-label="Voorbeeld van de mapstructuur"')[1].split("structurePreviewNotes")[0];
  return [...tree.matchAll(/<span>([^<]*)<\/span>/g)].map((match) => match[1]);
}

describe("SourceProfileStructurePreview", () => {
  beforeEach(() => { state.shown = false; state.terminology = {}; });
  it("starts off and toggles interpretation without changing source names or configuration", () => {
    const original = JSON.stringify(config);
    const off = render();
    expect(off).toContain("Interpretatie tonen");
    expect(off).toContain('role="switch" aria-checked="false"');
    expect(off).toContain('editor-permissions-track');
    expect(off).not.toContain('type="checkbox"');
    expect(off).not.toContain("Thema: Analyse");
    toggle(true);
    const on = render();
    expect(on).toContain('aria-checked="true"');
    expect(on).toContain("Thema: Analyse");
    expect(on).toContain("Portfolio 1.1 · Stelsels oplossen");
    expect(on).toContain("Onderdeel 1.2 · Methode van Gauss-Jordan");
    expect(on).toContain("Oefening 1");
    expect(on).toContain("Materiaal: Uitwerking");
    expect(on).toContain("Document: Opgaven");
    expect(names(on)).toEqual(names(off));
    expect(on).not.toMatch(/<input[^>]*name=/);
    toggle(false);
    expect(render()).toBe(off);
    expect(JSON.stringify(config)).toBe(original);
  });
  it("changes terminology immediately while keeping the same example and checked toggle", () => {
    toggle(true);
    const initial = render();
    state.terminology = { themeLabelSingular: "DOMEIN", collectionLabelSingular: "bundel", sectionLabelSingular: "sectie", exerciseLabelSingular: "opdracht" };
    const changed = render();
    expect(changed).toContain("Domein: Algebra");
    expect(changed).toContain("Bundel 1.1 · Stelsels oplossen");
    expect(changed).toContain("Sectie 1.2 · Methode van Gauss-Jordan");
    expect(changed).toContain("Opdracht 3");
    expect(changed).toContain('aria-checked="true"');
    expect(names(changed)).toEqual(names(initial));
  });
  it("keeps desktop interpretation independent of tree indentation and stacks in narrow containers", async () => {
    const css = await readFile(path.join(process.cwd(), "src/app/components/portfolio-resource-scanner-v2.module.css"), "utf8");
    expect(css).toContain("container: source-structure-preview / inline-size");
    expect(css).toContain("@container source-structure-preview (min-width: 720px)");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr) minmax(240px, 0.7fr)");
    const row = css.match(/\.structureTreeRow \{([^}]+)\}/)![1];
    expect(row).not.toContain("padding");
    expect(css).toContain("padding-inline-start: var(--source-tree-indent, 0px)");
    expect(css).toContain(".structureInterpretation { padding-inline-start: 0; padding-bottom: 0; }");
    expect(css).toContain("overflow-wrap: anywhere");
    toggle(true);
    expect(render()).toContain("Bronstructuur</strong>");
    expect(render()).toContain("Interpretatie</strong>");
  });
  it("labels the example as generated rather than a real source analysis", () => {
    expect(render()).toContain("gegenereerd voorbeeld, geen analyse van je echte bronmap");
    expect(render()).not.toContain("Thema uit bronmap");
  });
});
