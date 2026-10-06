import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, refCursor: 0, form: null as unknown, submitted: null as Promise<unknown> | null }));
vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();
  return {
    ...original,
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.values)) hooks.values[index] = typeof initial === "function" ? initial() : initial;
      return [hooks.values[index], (next: unknown) => { hooks.values[index] = typeof next === "function" ? next(hooks.values[index]) : next; }];
    },
    useRef: () => ({ current: hooks.refCursor++ === 0 ? hooks.form : null }),
    useEffect: () => undefined,
    useActionState: (action: (previous: null, data: FormData) => Promise<unknown>) => [null, (data: FormData) => { hooks.submitted = action(null, data); }, false],
    startTransition: (callback: () => void) => callback(),
  };
});
import { LearningSpaceCreateForm } from "./learning-space-create-form";
import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG as config } from "@/lib/source-profile-config";
import { LearningSpaceCreationProfileEditor } from "./learning-space-creation-profile-editor";
import { terminologyScenario } from "@/lib/learning-space-creation-wizard";

const NativeFormData = globalThis.FormData;
let fields: FormData;
const action = vi.fn();
const cancel = vi.fn();
afterEach(() => { vi.unstubAllGlobals(); });
function render() {
  hooks.cursor = 0; hooks.refCursor = 0;
  return LearningSpaceCreateForm({ action, subjects: [], onCancel: cancel, options: { templates: [{ id: "template-1", name: "Standaard", description: null, summary: [], config }], copies: [{ id: "other-space", name: "Andere ruimte", description: null, summary: [], config }], links: [{ id: "profile-1", name: "Gedeeld", description: null, summary: [], config }] } });
}
function nodes(value: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!isValidElement<Record<string, unknown>>(value)) return [];
  return [value, ...nodes(value.props.children)];
}
function click(label: string) {
  const button = nodes(render()).find((node) => node.type === "button" && node.props.children === label)!;
  (button.props.onClick as () => void)();
}
function change(name: string, value: string) {
  const field = nodes(render()).find((node) => node.props.name === name)!;
  (field.props.onChange as (event: unknown) => void)({ target: { value } }); fields.set(name, value);
}
function draftFields() {
  fields.set("profileDraftEnabled", "1");
  for (const [name, value] of Object.entries({ portfolioScannerJson: config.scanner.portfolio, exerciseScannerJson: config.scanner.exercise, resourcesJson: config.globalResources, exerciseResourcesJson: config.exerciseResources, levelRecognitionJson: config.levelRecognition })) fields.set(name, JSON.stringify(value));
}
function profileStep() { click("Volgende"); click("Volgende"); }
function submit() {
  const form = render();
  const preventDefault = vi.fn();
  (form.props.onSubmit as (event: unknown) => void)({ currentTarget: hooks.form, preventDefault });
  expect(preventDefault).toHaveBeenCalledOnce();
}

beforeEach(() => {
  vi.clearAllMocks(); hooks.values = []; hooks.submitted = null;
  fields = new NativeFormData();
  for (const [key, value] of Object.entries({ subjectId: "subject-wiskunde", name: "Mijn ruimte", shortLabel: "MIJN", slug: "mijn-ruimte", description: "Mijn beschrijving", cardColor: "#DCEFE9", profileMode: "later", sourceSetup: "later" })) fields.set(key, value);
  const terms = terminologyScenario("portfolio");
  for (const entity of ["theme", "collection", "section", "exercise"] as const) {
    fields.set(`${entity}LabelSingular`, terms[entity].singular); fields.set(`${entity}LabelPlural`, terms[entity].plural);
  }
  fields.set("exerciseLabelShort", terms.exercise.short);
  hooks.form = { querySelectorAll: () => [] };
  vi.stubGlobal("FormData", class extends NativeFormData {
    constructor(form?: unknown) { super(); if (form === hooks.form) for (const [key, value] of fields.entries()) this.append(key, value); }
  });
  action.mockResolvedValue({ error: null, spaceId: "space-new", slug: "mijn-ruimte", summary: "Aangemaakt", warnings: [] });
});

describe("wizard navigation handlers", () => {
  it.each(["chapter", "bundle"])("uses %s terminology in the profile intro and summary", (preset) => {
    click("Volgende");
    const select = nodes(render()).find((node) => node.type === "select" && node.props.value === "portfolio" && !node.props.name)!;
    (select.props.onChange as (event: unknown) => void)({ target: { value: preset } });
    click("Volgende"); change("profileMode", "template");
    const terms = terminologyScenario(preset);
    const paragraphs = nodes(render()).filter((node) => node.type === "p").map((node) => Array.isArray(node.props.children) ? node.props.children.join("") : node.props.children).join(" ");
    expect(paragraphs).toContain(`als ${terms.collection.plural.toLowerCase()} en ${terms.exercise.plural.toLowerCase()} worden herkend`);
    const summary = nodes(render()).filter((node) => node.type === "li").map((node) => node.props.children).join(" ");
    expect(summary).toContain(`${terms.collection.plural}:`);
    expect(summary).toContain(`${terms.exercise.plural}:`);
    expect(summary).toContain(`Documenten bij ${terms.collection.plural.toLowerCase()}:`);
  });
  it.each(["template", "copy", "link", "later"])("offers one edit CTA only for an editable %s choice", (mode) => {
    profileStep(); change("profileMode", mode);
    const tree = nodes(render());
    expect(tree.some((node) => node.type === "select" && node.props.name === "profileIntent")).toBe(false);
    expect(tree.filter((node) => node.type === "button" && node.props.children === "Bronprofiel controleren en aanpassen")).toHaveLength(["template", "copy"].includes(mode) ? 1 : 0);
    if (mode === "later") expect(tree.some((node) => node.props.className === "source-profile-summary")).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });
  it.each([1, 2, 3, 4])("keeps the stepper without a duplicate counter in step %s", (step) => {
    for (let index = 1; index < step; index++) click("Volgende");
    const tree = nodes(render());
    expect(tree.some((node) => node.props.className === "creation-stepper")).toBe(true);
    expect(tree.filter((node) => node.type === "p").map((node) => String(node.props.children)).join(" ")).not.toMatch(/Stap.*van 4/);
    if (step === 4) expect(tree.some((node) => node.type === "h3" && node.props.children === "Bron")).toBe(true);
  });
  it("blocks invalid next steps and preserves custom controlled fields through previous/next", () => {
    fields.delete("subjectId"); click("Volgende");
    expect(nodes(render()).some((node) => node.props.role === "alert")).toBe(true);
    fields.set("subjectId", "subject-wiskunde"); click("Volgende");
    const custom = nodes(render()).find((node) => node.props.name === "themeLabelSingular")!;
    (custom.props.onChange as (event: unknown) => void)({ target: { value: "Domein" } }); fields.set("themeLabelSingular", "Domein");
    click("Volgende"); click("Vorige"); click("Vorige"); click("Volgende");
    expect(nodes(render()).find((node) => node.props.name === "themeLabelSingular")?.props.value).toBe("Domein");
    expect(fields.get("description")).toBe("Mijn beschrijving");
    expect(action).not.toHaveBeenCalled();
  });
  it("cancel and Enter before the final step never create a space", () => {
    submit(); click("Annuleren");
    expect(cancel).toHaveBeenCalledOnce(); expect(action).not.toHaveBeenCalled();
  });
  it.each(["template", "copy"])("opens %s editing locally and retains the same draft through closing and previous/next", (mode) => {
    profileStep(); change("profileMode", mode); fields.set("profileSelectionId", mode === "template" ? "template-1" : "other-space");
    click("Bronprofiel controleren en aanpassen"); draftFields();
    fields.set("portfolioScannerJson", JSON.stringify({ ...config.scanner.portfolio, marker: "Eigen bundel" }));
    const editor = nodes(render()).find((node) => node.type === LearningSpaceCreationProfileEditor)!;
    expect(editor.props.draftKey).toBe(`${mode}:${mode === "template" ? "template-1" : "other-space"}`);
    click("Wijzigingen gebruiken");
    expect(nodes(render()).some((node) => node.type === "li" && String(node.props.children).includes("Eigen bundel"))).toBe(true);
    click("Vorige"); click("Volgende"); click("Bronprofiel controleren en aanpassen");
    expect(nodes(render()).find((node) => node.type === LearningSpaceCreationProfileEditor)?.props.config).toBe(editor.props.config);
    expect(fields.get("description")).toBe("Mijn beschrijving"); expect(action).not.toHaveBeenCalled();
    click("Terug naar keuze"); change("profileMode", "link");
    expect(nodes(render()).filter((node) => node.props.className === "creation-profile-draft").every((node) => node.props.disabled)).toBe(true);
    expect(nodes(render()).some((node) => node.props.name === "profileIntent")).toBe(false);
    expect(nodes(render()).some((node) => node.props.name === "profileDraftEnabled")).toBe(false);
  });
  it("shows the template summary before opening its editor and Later disables the draft", () => {
    profileStep(); change("profileMode", "template");
    expect(nodes(render()).some((node) => node.type === LearningSpaceCreationProfileEditor)).toBe(false);
    expect(nodes(render()).some((node) => node.props.className === "source-profile-summary")).toBe(true);
    expect(nodes(render()).some((node) => node.props.children === "Start met een bestaand sjabloon en pas het aan waar nodig.")).toBe(true);
    expect(nodes(render()).some((node) => node.props.children === "Wijzigingen gebruiken")).toBe(false);
    click("Bronprofiel controleren en aanpassen");
    expect(nodes(render()).some((node) => node.props.children === "Wijzigingen gebruiken")).toBe(true);
    click("Terug naar keuze"); change("profileMode", "later");
    expect(nodes(render()).some((node) => node.props.name === "profileDraftEnabled")).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });
  it("keeps provider fields mounted but enables only the selected source", () => {
    profileStep(); change("profileMode", "later"); click("Volgende");
    const choice = nodes(render()).find((node) => node.type === "select" && node.props.value === "" && !node.props.name)!;
    (choice.props.onChange as (event: unknown) => void)({ target: { value: "onedrive" } });
    const selected = nodes(render()).find((node) => node.type === "fieldset" && nodes(node.props.children).some((child) => child.props.name === "oneDriveDriveId"));
    expect(selected?.props.disabled).toBe(false);
    expect(nodes(render()).find((node) => node.type === "details")?.props.open).toBe(false);
    click("Vorige"); click("Volgende");
    expect(nodes(render()).find((node) => node.type === "select" && !node.props.name)?.props.value).toBe("portfolio");
    expect(nodes(render()).some((node) => node.type === "select" && node.props.value === "onedrive")).toBe(true);
  });
  it("submits the selected template and local draft through the existing clone flow only at creation", async () => {
    profileStep(); change("profileMode", "template"); change("profileSelectionId", "template-1");
    click("Bronprofiel controleren en aanpassen"); draftFields();
    fields.set("portfolioScannerJson", JSON.stringify({ ...config.scanner.portfolio, marker: "Eigen bundel" }));
    click("Wijzigingen gebruiken");
    expect(action).not.toHaveBeenCalled();
    click("Volgende"); submit(); await hooks.submitted;
    expect(action).toHaveBeenCalledOnce();
    const data = action.mock.calls[0][0] as FormData;
    expect(data.get("profileMode")).toBe("template");
    expect(data.get("profileSelectionId")).toBe("template-1");
    expect(data.get("profileDraftEnabled")).toBe("1");
    expect(JSON.parse(String(data.get("portfolioScannerJson"))).marker).toBe("Eigen bundel");
    expect(config.scanner.portfolio.marker).not.toBe("Eigen bundel");
  });

  it("dispatches exactly once on the final submit with all previous values", async () => {
    click("Volgende"); click("Volgende"); click("Volgende"); submit();
    await hooks.submitted;
    expect(action).toHaveBeenCalledOnce();
    const data = action.mock.calls[0][0] as FormData;
    expect(data.get("name")).toBe("Mijn ruimte"); expect(data.get("description")).toBe("Mijn beschrijving");
  });
});
