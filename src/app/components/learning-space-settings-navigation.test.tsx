import { isValidElement, type ReactElement } from "react";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LearningSpace } from "@/lib/repositories";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, context: null as unknown, effects: [] as (() => (() => void))[], save: vi.fn() }));
vi.mock("react", async (original: <T>() => Promise<T>) => {
  const react = await original<typeof import("react")>();
  return { ...react,
    useContext: () => hooks.context,
    useEffect: (effect: () => (() => void)) => { hooks.effects.push(effect); },
    useActionState: (_action: unknown, initial: unknown) => [initial, hooks.save],
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.values)) hooks.values[index] = initial;
      return [hooks.values[index], (value: unknown) => { hooks.values[index] = typeof value === "function" ? value(hooks.values[index]) : value; }];
    },
  };
});

import { LearningSpaceSettingsNavigation, LearningSpaceSettingsPanel, settingsSectionFromHash } from "./learning-space-settings-navigation";
import { LearningSpaceLocalNavigation } from "./learning-space-local-navigation";
import { LearningSpaceSettingsForm } from "./learning-space-settings-form";
import { ExerciseLevelPresentationSettings } from "./exercise-level-presentation-settings";
import { EditorPermissionsToggle } from "./editor-permissions-toggle";

function nodes(value: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!isValidElement<Record<string, unknown>>(value)) return [];
  if (value.type === LearningSpaceLocalNavigation) return nodes(LearningSpaceLocalNavigation(value.props as Parameters<typeof LearningSpaceLocalNavigation>[0]));
  return [value, ...nodes(value.props.children)];
}

function render() {
  hooks.cursor = 0;
  const form = LearningSpaceSettingsForm({ space, subjects: [], canPermanentlyDelete: false, action: hooks.save });
  const navigation = LearningSpaceSettingsNavigation({ children: [form,
    <LearningSpaceSettingsPanel key="profile" section="profile"><form>PROFILE EDITOR</form></LearningSpaceSettingsPanel>,
    <LearningSpaceSettingsPanel key="switch" section="source" continuation><form>SOURCE SWITCH</form></LearningSpaceSettingsPanel>,
  ] });
  hooks.context = navigation.props.value;
  const panels = nodes(navigation).filter((node) => node.type === LearningSpaceSettingsPanel)
    .map((node) => LearningSpaceSettingsPanel(node.props as Parameters<typeof LearningSpaceSettingsPanel>[0]));
  const levelComponent = nodes(form).find((node) => node.type === ExerciseLevelPresentationSettings)!;
  const levels = ExerciseLevelPresentationSettings(levelComponent.props as Parameters<typeof ExerciseLevelPresentationSettings>[0]);
  return { navigation, form, panels, levels };
}

function click(label: string) {
  const button = nodes(render().navigation).find((node) => node.type === "button" && node.props.children === label)!;
  (button.props.onClick as () => void)();
}

describe("LearningSpace settings navigation", () => {
  beforeEach(() => {
    hooks.values = []; hooks.effects = []; hooks.context = null; hooks.save.mockReset();
    vi.stubGlobal("window", { location: { hash: "" }, history: { replaceState: vi.fn() }, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  });

  it("starts on General with one visible main section and all forms mounted", () => {
    const { navigation, panels, form } = render();
    expect(panels.filter((panel) => !panel.props.hidden).map((panel) => panel.props.id)).toEqual(["settings-panel-general"]);
    expect(panels).toHaveLength(9);
    expect(nodes(navigation).filter((node) => node.props["aria-current"] === "true").map((node) => node.props.children)).toEqual(["Algemeen"]);
    expect(nodes(form).filter((node) => node.type === "form")).toHaveLength(1);
    expect(nodes(navigation).filter((node) => node.type === "form")).toHaveLength(3);
  });

  it("groups the eight navigation items under subtle non-interactive labels", () => {
    const { navigation } = render();
    const groups = nodes(navigation).filter((node) => node.props.role === "group");
    expect(groups.map((node) => node.props["aria-label"])).toEqual(["Algemeen", "Personalisatie", "Rechten", "Bron"]);
    expect(groups.map((group) => nodes(group).filter((node) => node.type === "button").map((node) => node.props.children)))
      .toEqual([["Algemeen", "Beheer"], ["Vormgeving", "Benamingen", "Niveaus"], ["Rechten"], ["Bronprofiel", "Bron"]]);
    expect(nodes(navigation).some((node) => node.type === "button" && ["Personalisatie", "Status"].includes(node.props.children as string))).toBe(false);
    expect(settingsSectionFromHash("#lifecycle-settings-heading")).toBe("management");
    expect(settingsSectionFromHash("#rights-settings-heading")).toBe("rights");
  });

  it("uses the existing burgundy accent and compact responsive groups", async () => {
    const css = await readFile(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    const active = css.match(/\.learning-space-settings-navigation button\.is-active \{([^}]+)\}/)![1];
    expect(active).toContain("border-left-color: #8a3340");
    expect(active).toContain("font-weight: 700");
    expect(active).not.toMatch(/#e1f2ed|#b8cec7|#075c75/);
    expect(css).toContain(".learning-space-settings-group-label { display: none; }");
    expect(css).toContain(".learning-space-settings-navigation { display: flex; flex-wrap: wrap;");
  });

  it.each(["Algemeen", "Beheer", "Vormgeving", "Benamingen", "Niveaus", "Rechten", "Bronprofiel", "Bron"])("switches to %s without submitting or unmounting fields", (label: string) => {
    const originalFields = nodes(render().form).filter((node) => node.type === "input").map((node) => node.props.name);
    click(label);
    const { navigation, panels, form } = render();
    expect(nodes(navigation).filter((node) => node.props["aria-current"] === "true").map((node) => node.props.children)).toEqual([label]);
    expect(panels.filter((panel) => !panel.props.hidden && panel.props.id)).toHaveLength(1);
    expect(nodes(form).filter((node) => node.type === "input").map((node) => node.props.name)).toEqual(originalFields);
    expect(nodes(navigation).filter((node) => node.props["aria-controls"]).every((node) => node.props.type === "button")).toBe(true);
    expect(hooks.save).not.toHaveBeenCalled();
  });

  it("retains controlled form edits through navigation and keeps uncontrolled inputs in their stable panel", () => {
    const original = render();
    const color = nodes(original.form).find((node) => node.props.name === "cardColor")!;
    (color.props.onChange as (event: unknown) => void)({ target: { value: "#123abc" } });
    click("Bronprofiel"); click("Vormgeving");
    const changed = render();
    expect(nodes(changed.form).find((node) => node.props.name === "cardColor")?.props.value).toBe("#123ABC");
    expect(nodes(changed.form).find((node) => node.props.name === "name")?.props.defaultValue).toBe("Zesde jaar");
    expect(changed.panels.map((panel) => panel.props.id)).toEqual(original.panels.map((panel) => panel.props.id));
    expect(hooks.save).not.toHaveBeenCalled();
  });

  it("keeps editor permissions mounted with the same action and props across navigation", () => {
    const original = render().panels.find((panel) => panel.props.id === "settings-panel-rights")!;
    const toggle = nodes(original).find((node) => node.type === EditorPermissionsToggle)!;
    expect(toggle.props).toMatchObject({ learningSpaceId: space.id, initialEnabled: false, canChange: true });
    click("Rechten"); click("Beheer"); click("Algemeen"); click("Rechten");
    const retained = render().panels.find((panel) => panel.props.id === "settings-panel-rights")!;
    expect(retained.props.hidden).toBe(false);
    expect(nodes(retained).find((node) => node.type === EditorPermissionsToggle)?.props).toEqual(toggle.props);
    expect(hooks.save).not.toHaveBeenCalled();
    const form = render().form;
    expect(form.props.action).toBe(hooks.save);
  });

  it("keeps every uncontrolled naming field mounted in its same panel across switches", () => {
    const original = render().panels.find((panel) => panel.props.id === "settings-panel-labels")!;
    const fields = nodes(original).filter((node) => node.type === "input");
    expect(fields.map((node) => node.props.name)).toEqual([
      "themeLabelSingular", "themeLabelPlural", "collectionLabelSingular", "collectionLabelPlural",
      "sectionLabelSingular", "sectionLabelPlural", "exerciseLabelSingular", "exerciseLabelPlural", "exerciseLabelShort",
    ]);
    click("Benamingen"); click("Bron"); click("Niveaus"); click("Benamingen");
    const changed = render().panels.find((panel) => panel.props.id === "settings-panel-labels")!;
    expect(changed.props.hidden).toBe(false);
    const retained = nodes(changed).filter((node) => node.type === "input");
    expect(retained.map((node) => [node.type, node.key, node.props.name, node.props.defaultValue]))
      .toEqual(fields.map((node) => [node.type, node.key, node.props.name, node.props.defaultValue]));
    expect(retained.every((node) => node.props.value === undefined && !node.props.disabled)).toBe(true);
    expect(hooks.save).not.toHaveBeenCalled();
  });

  it("retains level edits and reset behavior through section switches without saving", () => {
    const name = nodes(render().levels).find((node) => node.props.name === "levelName_basis")!;
    (name.props.onChange as (event: unknown) => void)({ target: { value: "Kern" } });
    const count = nodes(render().levels).find((node) => node.props.name === "levelCount_basis")!;
    (count.props.onChange as (event: unknown) => void)({ target: { value: "4" } });
    click("Vormgeving"); click("Benamingen"); click("Niveaus");
    const edited = nodes(render().levels);
    expect(edited.find((node) => node.props.name === "levelName_basis")?.props.value).toBe("Kern");
    expect(edited.find((node) => node.props.name === "levelCount_basis")?.props.value).toBe(4);
    const reset = edited.find((node) => node.props["aria-label"] === "Herstel standaardinstellingen voor Kern")!;
    (reset.props.onClick as () => void)();
    expect(nodes(render().levels).find((node) => node.props.name === "levelName_basis")?.props.value).toBe("Basis");
    expect(hooks.save).not.toHaveBeenCalled();
  });

  it.each([["#source-profile-settings", "settings-panel-profile"], ["#source-settings-heading", "settings-panel-source"]])("opens the existing setup CTA %s", (hash: string, panelId: string) => {
    window.location.hash = hash;
    render();
    const cleanup = hooks.effects[0]();
    expect(render().panels.find((panel) => panel.props.id === panelId)?.props.hidden).toBe(false);
    expect(window.addEventListener).toHaveBeenCalledWith("hashchange", expect.any(Function));
    cleanup();
    expect(window.removeEventListener).toHaveBeenCalledWith("hashchange", expect.any(Function));
    expect(hooks.save).not.toHaveBeenCalled();
  });

  it("handles a setup link clicked while already on the settings page", () => {
    render(); hooks.effects[0]();
    window.location.hash = "#source-profile-settings";
    const followHash = vi.mocked(window.addEventListener).mock.calls[0][1] as () => void;
    followHash();
    expect(render().panels.find((panel) => panel.props.id === "settings-panel-profile")?.props.hidden).toBe(false);
    expect(settingsSectionFromHash("#unknown")).toBe("general");
  });

  it("reveals the first invalid field's section without saving", () => {
    const panel = render().panels.find((node) => node.props.id === "settings-panel-source")!;
    panel.props.onInvalidCapture({ currentTarget: { closest: () => null } });
    expect(render().panels.find((node) => node.props.id === "settings-panel-source")?.props.hidden).toBe(false);
    expect(hooks.save).not.toHaveBeenCalled();
  });

  it("keeps the first invalid section active if another section also contains invalid fields", () => {
    const panel = render().panels.find((node) => node.props.id === "settings-panel-source")!;
    panel.props.onInvalidCapture({ currentTarget: { closest: () => ({ querySelector: () => ({}) }), contains: () => false } });
    expect(render().panels.find((node) => node.props.id === "settings-panel-general")?.props.hidden).toBe(false);
  });

  it("supports vertical and horizontal keyboard navigation", () => {
    const focus = vi.fn();
    vi.stubGlobal("document", { getElementById: vi.fn(() => ({ focus })) });
    const first = nodes(render().navigation).find((node) => node.props["aria-controls"] === "settings-panel-general")!;
    const preventDefault = vi.fn();
    (first.props.onKeyDown as (event: unknown) => void)({ key: "ArrowDown", preventDefault });
    expect(render().panels.find((node) => node.props.id === "settings-panel-management")?.props.hidden).toBe(false);
    expect(focus).toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalled();
  });
});

const space: LearningSpace = {
  id: "space-6", subjectId: "subject-wiskunde", subjectName: "Wiskunde", subjectIsActive: true,
  collectionLabelSingular: "Portfolio", collectionLabelPlural: "Portfolio's", exerciseLabelSingular: "Oefening", exerciseLabelPlural: "Oefeningen",
  name: "Zesde jaar", slug: "6", shortLabel: "6WIS", description: "Oefenmateriaal", cardColor: "#DCEFE9", sortOrder: 6,
  isActive: true, archivedAt: null, editorsCanManageAccess: false, sourceType: "local", localSourcePath: "C:\\Portfolio",
  oneDriveDriveId: null, oneDriveFolderId: null, oneDriveFolderPath: null, googleDriveFolderId: null, googleDriveFolderLabel: null,
  sources: [], activeSourceId: null, primarySource: null, mirrorSource: null,
};
