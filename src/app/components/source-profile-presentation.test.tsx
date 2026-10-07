import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG } from "@/lib/source-profile-config";
import type { SourceProfilePresentationSpace } from "@/lib/source-profile-presentation";

const state = vi.hoisted(() => ({ selected: null as string | null, tab: "overview", interpretation: false }));
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  return { ...react, useState: (initial: unknown) => initial === false && state.interpretation ? [true, () => undefined] : initial === "a" || initial === "b" ? [state.selected ?? initial, (value: string) => { state.selected = value; }] : initial === "overview" ? [state.tab, (value: string) => { state.tab = value; }] : react.useState(initial) };
});
import { SourceProfilePresentation, SourceProfileViewContext } from "./source-profile-presentation";
import { SourceProfileExerciseConfigurationEditors } from "./source-profile-exercise-configuration-editors";
import { LearningSpaceCreationProfileEditor } from "./learning-space-creation-profile-editor";
import { SourceProfileStructurePreview } from "./source-profile-structure-preview";
import { useSourceProfileLabels } from "./source-profile-presentation";

const a: SourceProfilePresentationSpace = { id: "a", name: "Eerste", shortLabel: "A", sortOrder: 1 };
const b: SourceProfilePresentationSpace = { id: "b", name: "Tweede", shortLabel: "B", sortOrder: 2, themeLabelSingular: "Deel", themeLabelPlural: "Delen", collectionLabelSingular: "Hoofdstuk", collectionLabelPlural: "Hoofdstukken", sectionLabelSingular: "Sectie", sectionLabelPlural: "Secties", exerciseLabelSingular: "Opdracht", exerciseLabelPlural: "Opdrachten" };
const config = structuredClone(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
config.scanner.portfolio.themeMode = "folder";
config.scanner.exercise = { exerciseMode: "files", numberLocation: "start", marker: "Bewaar deze tekst" };
config.exerciseResources[0].recognition.directory = { target: "file_name", operator: "ends_with", value: "-inactief", caseSensitive: true };
function editor(readOnly = false) {
  return <SourceProfileExerciseConfigurationEditors readOnly={readOnly} globalResources={config.globalResources} portfolioScanner={config.scanner.portfolio} scanner={config.scanner.exercise} resources={config.exerciseResources} levelRecognition={config.levelRecognition} ownerIdField="sourceProfileId" ownerId="profile" editorKey="profile" />;
}
function fields(markup: string) { return [...markup.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"/g)].map((match) => [match[1], match[2]]); }
function LabelProbe() { const labels = useSourceProfileLabels(); return <p>{labels.collectionHeading} · {labels.sectionHeading} · {labels.exerciseHeading}</p>; }

describe("source profile presentation", () => {
  it("keeps document and material file types inline in both editor contexts", async () => {
    const css = await readFile(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    // Match the wizard fieldset specificity so the later shared rule wins.
    const sharedRule = "fieldset.source-profile-resource-extensions { display: flex; flex-wrap: wrap;";
    expect(css).toContain(sharedRule);
    expect(css.indexOf(sharedRule)).toBeGreaterThan(css.indexOf(".learning-space-create-form fieldset { display: grid;"));
    expect(css).toContain("fieldset.source-profile-resource-extensions { row-gap: 10px; column-gap: 16px;");
    expect(css).toContain("fieldset.source-profile-resource-extensions { column-gap: 14px;");
    expect(css).toContain(".source-profile-resource-extensions label, .source-profile-resource-checkbox { display: inline-flex;");
    expect(css).toContain(".source-profile-resource-extensions input, .source-profile-resource-checkbox input { width: 16px;");
    for (const file of ["source-profile-global-resources-editor.tsx", "source-profile-exercise-resources-editor.tsx"]) {
      const source = await readFile(path.join(process.cwd(), "src/app/components", file), "utf8");
      expect(source).toContain('<fieldset className="source-profile-resource-extensions">');
      expect(source).toContain("<legend>Toegelaten bestandstypen</legend>");
    }
  });
  beforeEach(() => { state.selected = null; state.tab = "overview"; state.interpretation = false; });
  it("uses system defaults for an unlinked profile without a selector", () => {
    const markup = renderToStaticMarkup(<SourceProfilePresentation><SourceProfileViewContext /><LabelProbe /></SourceProfilePresentation>);
    expect(markup).toContain("Portfolio&#x27;s herkennen");
    expect(markup).toContain("Onderdelen herkennen");
    expect(markup).not.toContain("<select");
    expect(markup).toContain("Standaardtermen");
    expect(markup).not.toContain("<details");
  });
  it("implicitly uses its single LearningSpace and fixes context when opened from that space", () => {
    const single = renderToStaticMarkup(<SourceProfilePresentation spaces={[b]}><SourceProfileViewContext /><LabelProbe /></SourceProfilePresentation>);
    expect(single).toContain("Hoofdstukken herkennen");
    expect(single).not.toContain("<select");
    expect(single).not.toContain("<details");
    expect(single).toContain(">B</span>");
    const fixed = renderToStaticMarkup(<SourceProfilePresentation spaces={[a, b]} contextSpaceId="b"><SourceProfileViewContext /><LabelProbe /></SourceProfilePresentation>);
    expect(fixed).toContain("Secties herkennen");
    expect(fixed).not.toContain("<select");
    expect(fixed).not.toContain("<details");
  });
  it("keeps the selector for a shared profile with only one accessible context", () => {
    const markup = renderToStaticMarkup(<SourceProfilePresentation spaces={[b]} linkedSpaceCount={2}><SourceProfileViewContext /><LabelProbe /></SourceProfilePresentation>);
    expect(markup).toContain("Benamingen weergeven als");
    expect(markup).toContain("Hoofdstukken herkennen");
    expect(markup).toContain("B — Tweede");
    expect(markup).not.toContain("A — Eerste");
  });
  it("changes only presentation labels while preserving the entire serialized configuration", () => {
    state.tab = "materials";
    const before = JSON.stringify(config);
    const props = { spaces: [a, b], children: <><SourceProfileViewContext />{editor()}</> };
    const tree = SourceProfilePresentation(props);
    const originalMarkup = renderToStaticMarkup(tree);
    const view = tree.props.value;
    expect(originalMarkup).not.toContain('name="context');
    view.select("b");
    const changedMarkup = renderToStaticMarkup(SourceProfilePresentation(props));
    expect(originalMarkup).toContain("Benamingen weergeven als");
    for (const heading of ["Hoofdstukken herkennen", "Documenten bij hoofdstukken", "Secties herkennen", "Opdrachten herkennen", "Materialen bij opdrachten"]) expect(changedMarkup).toContain(heading);
    expect(changedMarkup).not.toContain("Deel uit bronmap");
    expect(changedMarkup).toContain("Interpretatie tonen");
    expect(changedMarkup).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Materialen<\/button>/);
    expect(fields(changedMarkup)).toEqual(fields(originalMarkup));
    expect(fields(changedMarkup)).toHaveLength(5);
    expect(changedMarkup).toContain("Bewaar deze tekst");
    expect(changedMarkup).toContain("-inactief");
    expect(JSON.stringify(config)).toBe(before);
  });
  it("updates visible interpretation through the real view-context provider without changing source names", () => {
    state.interpretation = true;
    const props = { spaces: [a, b], children: <SourceProfileStructurePreview scanner={config.scanner.exercise} portfolioScanner={config.scanner.portfolio} resources={config.exerciseResources} globalResources={config.globalResources} levelRecognition={config.levelRecognition} /> };
    const original = JSON.stringify(config);
    const tree = SourceProfilePresentation(props);
    const before = renderToStaticMarkup(tree);
    tree.props.value.select("b");
    const after = renderToStaticMarkup(SourceProfilePresentation(props));
    expect(before).toContain("Thema: Analyse");
    expect(after).toContain("Deel: Analyse");
    expect(after).toContain("Hoofdstuk 1.1 · Stelsels oplossen");
    expect(after).toContain("Sectie 1.1 · Inleiding");
    expect(after).toContain("Opdracht 3");
    const names = (markup: string) => [...markup.matchAll(/<span>([^<]*)<\/span>/g)].map((match) => match[1]);
    expect(names(after)).toEqual(names(before));
    expect(JSON.stringify(config)).toBe(original);
  });
  it("formats uppercase and lowercase terms for tabs and titles without changing stored terms", () => {
    const terms = { ...b, themeLabelPlural: "DOMEINEN", collectionLabelPlural: "bundels", exerciseLabelPlural: "OPGAVEN" };
    const before = JSON.stringify(terms);
    const markup = renderToStaticMarkup(<SourceProfilePresentation spaces={[terms]}>{editor()}</SourceProfilePresentation>);
    expect(markup).toContain('>Domeinen</button>');
    expect(markup).toContain('<h3>Domeinen</h3>');
    expect(markup).not.toContain('>Structuur<');
    expect(markup).toContain('>Bundels</button>');
    expect(markup).toContain('>Opgaven</button>');
    expect(markup).toContain("Bundels herkennen");
    expect(markup).toContain("Opgaven herkennen");
    expect(JSON.stringify(terms)).toBe(before);
  });
  it("keeps nine full-length laptop tabs with compact sizing in narrower containers", async () => {
    const terms = { ...b, themeLabelPlural: "Hoofdstukken", collectionLabelPlural: "Oefeningenreeksen", sectionLabelPlural: "Onderdelen", exerciseLabelPlural: "Vraagstukken" };
    const markup = renderToStaticMarkup(<SourceProfilePresentation spaces={[terms]}>{editor()}</SourceProfilePresentation>);
    const tabs = [...markup.matchAll(/role="tab"[^>]*>([^<]+)<\/button>/g)].map((match) => match[1]);
    expect(tabs).toEqual(["Overzicht", "Hoofdstukken", "Oefeningenreeksen", "Documenten", "Onderdelen", "Vraagstukken", "Materialen", "Niveaus", "Voorbeeld"]);
    const css = await readFile(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain("width: fit-content");
    expect(css).toContain("min-width: min(800px, calc(100vw - 48px))");
    expect(css).toContain("max-width: min(1100px, calc(100vw - 48px))");
    const wrapper = css.match(/\.source-profile-config-sections \{([^}]+)\}/)![1];
    expect(wrapper).toContain("width: 100%");
    expect(wrapper).not.toContain("max-width");
    const panel = css.match(/\.source-profile-editor-panel \{([^}]+)\}/)![1];
    expect(panel).toContain("max-width: 760px");
    expect(panel).toContain("contain: inline-size");
    expect(panel).toContain("margin-inline: auto");
    expect(css).toContain("@media (max-width: 760px)");
    expect(css).toContain(".source-profile-editor-tabs { gap: 0; }");
    expect(css).toContain("padding-inline: 6px; font-size: 12px");
    expect(css).toMatch(/\.source-profile-editor-tabs \{[^}]*width: max-content[^}]*flex-wrap: nowrap[^}]*overflow-x: auto/);
    expect(css).toMatch(/\.source-profile-editor-tabs button \{[^}]*white-space: nowrap/);
  });
  it.each(["short", "long"])("shares intrinsic navigation sizing in manage and wizard contexts (%s)", async (shape) => {
    const terms = { ...b, themeLabelPlural: shape === "short" ? "Thema's" : "Hoofdstukken", collectionLabelPlural: shape === "short" ? "Bundels" : "Oefeningenreeksen", sectionLabelPlural: "Onderdelen", exerciseLabelPlural: shape === "short" ? "Opgaven" : "Vraagstukken" };
    const manage = renderToStaticMarkup(<SourceProfilePresentation spaces={[terms]}>{editor()}</SourceProfilePresentation>);
    const wizard = renderToStaticMarkup(<SourceProfilePresentation spaces={[terms]}><LearningSpaceCreationProfileEditor config={config} draftKey="test" /></SourceProfilePresentation>);
    const labels = (markup: string) => [...markup.matchAll(/role="tab"[^>]*>([^<]+)<\/button>/g)].map((match) => match[1]);
    expect(labels(manage)).toHaveLength(9);
    expect(labels(wizard)).toEqual(labels(manage));
    expect(labels(manage)[2]).toBe(terms.collectionLabelPlural);
    for (const markup of [manage, wizard]) {
      expect(markup).toContain("Interpretatie tonen");
      expect(markup).toContain('aria-label="Voorbeeld van de mapstructuur"');
    }
    const css = await readFile(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    const sizing = css.match(/\.source-profile-manage-dialog,\s*\.learning-space-create-dialog:has\([^\n]+\) \{([^}]+)\}/)![1];
    expect(sizing).toContain("width: fit-content");
    expect(sizing).toContain("container-type: normal");
    expect(sizing).toContain("min-width: min(800px, calc(100vw - 48px))");
    expect(sizing).toContain("max-width: min(1100px, calc(100vw - 48px))");
    expect(css).toContain(".source-profile-editor-tabs { width: max-content;");
    expect(css).toContain(".source-profile-editor-panel { contain: inline-size;");
    expect(css).toContain(".learning-space-create-dialog { display: flex;");
    expect(css).toContain("width: min(880px, 100%)");
  });
  it("keeps Overview compact and the preview permanently expanded within its own tab", () => {
    state.tab = "preview";
    const markup = renderToStaticMarkup(editor());
    expect(markup).not.toContain("Dit bronprofiel bepaalt hoe mappen en bestanden worden herkend.");
    expect(markup).toContain("Voorbeeld van je bronmap");
    expect(markup).toContain("Een voorbeeld op basis van je instellingen.");
    expect(markup).toContain('aria-label="Voorbeeld van de mapstructuur"');
    expect(markup).not.toContain("<details");
    expect(markup).not.toContain("<summary");
    expect(markup).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Voorbeeld<\/button>/);
  });
  it.each([false, true])("keeps the semantic section order and read-only rights (%s)", (readOnly) => {
    const markup = renderToStaticMarkup(<SourceProfilePresentation spaces={[b]}>{editor(readOnly)}</SourceProfilePresentation>);
    const headings = ["<h3>Overzicht</h3>", "<h3>Delen</h3>", "<h3>Hoofdstukken herkennen</h3>", ">Documenten bij hoofdstukken</h3>", "<h3>Secties herkennen</h3>", ">Opdrachten herkennen</h3>", ">Materialen bij opdrachten</h3>", ">Niveaus</h3>", "Voorbeeld van je bronmap"];
    const positions = headings.map((heading) => markup.indexOf(heading));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((x, y) => x - y));
    expect(markup).toContain("Mapnaam begint met");
    expect(markup).not.toContain("Portfoliomarker");
    expect(markup).not.toContain("Drive-map");
    if (readOnly) { expect(markup).not.toContain("<input"); expect(markup).toContain('role="switch"'); expect(fields(markup)).toEqual([]); expect(markup).not.toContain("Regel toevoegen"); }
  });
});
