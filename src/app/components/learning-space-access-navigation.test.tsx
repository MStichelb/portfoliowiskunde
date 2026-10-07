import { isValidElement, type ReactElement } from "react";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, context: "teachers", action: vi.fn() }));
vi.mock("react", async (original: <T>() => Promise<T>) => {
  const react = await original<typeof import("react")>();
  return { ...react,
    useContext: () => hooks.context,
    useMemo: (factory: () => unknown) => factory(),
    useCallback: (callback: unknown) => callback,
    useEffect: () => undefined,
    useRef: (initial: unknown) => ({ current: initial }),
    useId: () => "student-search-dialog",
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.values)) hooks.values[index] = initial;
      return [hooks.values[index], (value: unknown) => { hooks.values[index] = typeof value === "function" ? value(hooks.values[index]) : value; }];
    },
  };
});

import { LearningSpaceAccessNavigation, LearningSpaceAccessPanel } from "./learning-space-access-navigation";
import { LearningSpaceLocalNavigation } from "./learning-space-local-navigation";
import { LearningSpaceGroupMappingForm } from "./learning-space-group-mapping-form";
import { LearningSpaceStudentAccessModal } from "./learning-space-student-access-modal";
import { LearningSpaceStudentRoster } from "./learning-space-student-roster";

function nodes(value: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!isValidElement<Record<string, unknown>>(value)) return [];
  if (value.type === LearningSpaceLocalNavigation) return nodes(LearningSpaceLocalNavigation(value.props as Parameters<typeof LearningSpaceLocalNavigation>[0]));
  return [value, ...nodes(value.props.children)];
}

function render() {
  hooks.cursor = 0;
  const groupForm = LearningSpaceGroupMappingForm({ learningSpaceId: "space", label: "Klasgroep", groups: [{ provider: "smartschool", externalGroupId: "class-5", externalGroupName: "5WIS" }], action: hooks.action });
  const modal = LearningSpaceStudentAccessModal({ learningSpaceId: "space", candidates: [student], action: hooks.action });
  const roster = LearningSpaceStudentRoster({ students: [{ ...student, relevantGroupNames: ["5WIS"], individualAccess: true, groupDerivedAccess: true }] });
  const navigation = LearningSpaceAccessNavigation({ children: [
    <LearningSpaceAccessPanel key="teachers" section="teachers"><form action={hooks.action}><select name="userId" defaultValue="teacher"><option value="teacher">Leraar</option></select></form></LearningSpaceAccessPanel>,
    <LearningSpaceAccessPanel key="groups" section="groups">{groupForm}</LearningSpaceAccessPanel>,
    <LearningSpaceAccessPanel key="individual" section="individual">{modal}</LearningSpaceAccessPanel>,
    <LearningSpaceAccessPanel key="students" section="students">{roster}</LearningSpaceAccessPanel>,
  ] });
  hooks.context = navigation.props.value;
  const panels = nodes(navigation).filter((node) => node.type === LearningSpaceAccessPanel)
    .map((node) => LearningSpaceAccessPanel(node.props as Parameters<typeof LearningSpaceAccessPanel>[0]));
  return { navigation, panels, groupForm, modal, roster };
}

function click(label: string) {
  const button = nodes(render().navigation).find((node) => node.type === "button" && node.props.children === label)!;
  (button.props.onClick as () => void)();
}

describe("LearningSpace access local navigation", () => {
  beforeEach(() => { hooks.values = []; hooks.context = "teachers"; hooks.action.mockReset(); });

  it("starts on Teachers with the same grouped navigation as Settings", () => {
    const { navigation, panels } = render();
    const groups = nodes(navigation).filter((node) => node.props.role === "group");
    expect(groups.map((node) => node.props["aria-label"])).toEqual(["Leraren", "Koppelen", "Leerlingen"]);
    expect(groups.map((group) => nodes(group).filter((node) => node.type === "button").map((node) => node.props.children)))
      .toEqual([["Leraren"], ["Groepen", "Individueel"], ["Leerlingen"]]);
    expect(panels).toHaveLength(4);
    expect(panels.filter((panel) => !panel.props.hidden).map((panel) => panel.props.id)).toEqual(["access-panel-teachers"]);
    expect(nodes(navigation).some((node) => node.props.className === "learning-space-settings-layout")).toBe(true);
  });

  it.each(["Leraren", "Groepen", "Individueel", "Leerlingen"])("shows only %s without submitting or removing other panels", (label: string) => {
    const original = render();
    click(label);
    const changed = render();
    expect(changed.panels.map((panel) => panel.props.id)).toEqual(original.panels.map((panel) => panel.props.id));
    expect(changed.panels.filter((panel) => !panel.props.hidden)).toHaveLength(1);
    expect(nodes(changed.navigation).filter((node) => node.props["aria-current"] === "true").map((node) => node.props.children)).toEqual([label]);
    expect(nodes(changed.navigation).filter((node) => node.props["aria-controls"]).every((node) => node.props.type === "button")).toBe(true);
    expect(hooks.action).not.toHaveBeenCalled();
  });

  it("retains the existing group selection through navigation", () => {
    const select = nodes(render().groupForm).find((node) => node.props.name === "externalGroupId")!;
    (select.props.onChange as (event: unknown) => void)({ target: { value: "class-5" } });
    click("Leerlingen"); click("Leraren"); click("Groepen");
    expect(nodes(render().groupForm).find((node) => node.props.name === "externalGroupId")?.props.value).toBe("class-5");
    expect(hooks.action).not.toHaveBeenCalled();
  });

  it("retains the open individual search modal and search query through navigation", () => {
    const trigger = nodes(render().modal).find((node) => node.props.className === "secondary-button student-access-trigger")!;
    (trigger.props.onClick as () => void)();
    const search = nodes(render().modal).find((node) => node.props.placeholder === "Zoek op naam, voornaam of klas")!;
    (search.props.onChange as (event: unknown) => void)({ target: { value: "Anna" } });
    click("Groepen"); click("Individueel");
    const changed = nodes(render().modal);
    expect(changed.some((node) => node.props.role === "dialog")).toBe(true);
    expect(changed.find((node) => node.props.placeholder === "Zoek op naam, voornaam of klas")?.props.value).toBe("Anna");
    expect(hooks.action).not.toHaveBeenCalled();
  });

  it("retains roster search and group filter through navigation", () => {
    const search = nodes(render().roster).find((node) => node.props.placeholder === "Zoek op naam, voornaam of klas/groep")!;
    (search.props.onChange as (event: unknown) => void)({ target: { value: "Anna" } });
    const filter = nodes(render().roster).find((node) => node.props["aria-label"] === "Klas/groep")!;
    (filter.props.onChange as (event: unknown) => void)({ target: { value: "5WIS" } });
    click("Individueel"); click("Leraren"); click("Leerlingen");
    const changed = nodes(render().roster);
    expect(changed.find((node) => node.props.placeholder === "Zoek op naam, voornaam of klas/groep")?.props.value).toBe("Anna");
    expect(changed.find((node) => node.props["aria-label"] === "Klas/groep")?.props.value).toBe("5WIS");
    expect(hooks.action).not.toHaveBeenCalled();
  });

  it("keeps keyboard navigation across group boundaries", () => {
    const focus = vi.fn();
    vi.stubGlobal("document", { getElementById: vi.fn(() => ({ focus })) });
    const button = nodes(render().navigation).find((node) => node.props.id === "access-nav-teachers")!;
    const preventDefault = vi.fn();
    (button.props.onKeyDown as (event: unknown) => void)({ key: "ArrowDown", preventDefault });
    expect(render().panels.find((panel) => panel.props.id === "access-panel-groups")?.props.hidden).toBe(false);
    expect(focus).toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("reuses responsive navigation and limits the stable viewport gutter to the two local pages", async () => {
    const css = await readFile(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain("html:has(.learning-space-settings-page, .learning-space-access-page) { scrollbar-gutter: stable; }");
    expect(css).toContain(".learning-space-settings-navigation { display: flex; flex-wrap: wrap;");
    expect(css).toContain(".learning-space-settings-group-label { display: none; }");
    expect(css).toContain("border-left-color: #8a3340");
  });
});

const student = { userId: "student", displayName: "Anna De Smet", firstName: "Anna", lastName: "De Smet", className: "5WIS", status: "active" as const };
