import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG } from "@/lib/source-profile-config";
import type { SourceProfilePresentationSpace } from "@/lib/source-profile-presentation";

const state = vi.hoisted(() => ({ selected: null as string | null, tab: "overview" }));
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  return { ...react, useState: (initial: unknown) => initial === "a" || initial === "b" ? [state.selected ?? initial, (value: string) => { state.selected = value; }] : initial === "overview" ? [state.tab, (value: string) => { state.tab = value; }] : react.useState(initial) };
});
import { SourceProfilePresentation, SourceProfileViewContext } from "./source-profile-presentation";
import { SourceProfileExerciseConfigurationEditors } from "./source-profile-exercise-configuration-editors";
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
  beforeEach(() => { state.selected = null; state.tab = "overview"; });
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
    expect(changedMarkup).toContain("Deel uit bronmap");
    expect(changedMarkup).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Materialen<\/button>/);
    expect(fields(changedMarkup)).toEqual(fields(originalMarkup));
    expect(fields(changedMarkup)).toHaveLength(5);
    expect(changedMarkup).toContain("Bewaar deze tekst");
    expect(changedMarkup).toContain("-inactief");
    expect(JSON.stringify(config)).toBe(before);
  });
  it("formats uppercase and lowercase terms for tabs and titles without changing stored terms", () => {
    const terms = { ...b, collectionLabelPlural: "bundels", exerciseLabelPlural: "OPGAVEN" };
    const before = JSON.stringify(terms);
    const markup = renderToStaticMarkup(<SourceProfilePresentation spaces={[terms]}>{editor()}</SourceProfilePresentation>);
    expect(markup).toContain('>Bundels</button>');
    expect(markup).toContain('>Opgaven</button>');
    expect(markup).toContain("Bundels herkennen");
    expect(markup).toContain("Opgaven herkennen");
    expect(JSON.stringify(terms)).toBe(before);
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
    const headings = ["<h3>Overzicht</h3>", "<h3>Structuur</h3>", "<h3>Hoofdstukken herkennen</h3>", ">Documenten bij hoofdstukken</h3>", "<h3>Secties herkennen</h3>", ">Opdrachten herkennen</h3>", ">Materialen bij opdrachten</h3>", ">Niveaus</h3>", "Voorbeeld van je bronmap"];
    const positions = headings.map((heading) => markup.indexOf(heading));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((x, y) => x - y));
    expect(markup).toContain("Mapnaam begint met");
    expect(markup).not.toContain("Portfoliomarker");
    expect(markup).not.toContain("Drive-map");
    if (readOnly) { expect(markup).not.toContain("<input"); expect(markup).not.toContain("Regel toevoegen"); }
  });
});
