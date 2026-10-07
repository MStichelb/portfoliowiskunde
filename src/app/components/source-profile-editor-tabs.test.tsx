import { isValidElement, useState, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  return { ...react, useId: () => "editor", useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (value: unknown) => { hooks.values[index] = value; }];
  } };
});
import { SourceProfileTabs } from "./source-profile-section-tabs";

function nodes(value: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!isValidElement<Record<string, unknown>>(value)) return [];
  return [value, ...nodes(value.props.children)];
}
function EditorHarness() {
  const [name, setName] = useState("Origineel");
  return SourceProfileTabs({ keepMounted: true, ariaLabel: "Editor", panels: [
    { id: "overview", label: "Overzicht", content: <input name="name" value={name} onChange={(event) => setName(event.target.value)} /> },
    { id: "materials", label: "Materialen", content: <input name="materials" defaultValue="Bewaar materiaal" /> },
  ] });
}
function render() { hooks.cursor = 0; return EditorHarness(); }
function active(tree: unknown) { return nodes(tree).filter((node) => node.props.role === "tabpanel" && !node.props.hidden); }
function click(label: string) {
  const tab = nodes(render()).find((node) => node.props.role === "tab" && node.props.children === label)!;
  (tab.props.onClick as () => void)();
}

describe("local profile editor tabs", () => {
  beforeEach(() => { hooks.values = []; });
  it("starts on Overview and shows one panel while retaining every field and stable panel keys", () => {
    const initial = render();
    expect(active(initial)).toHaveLength(1);
    expect(active(initial)[0].props.id).toContain("overview-panel");
    const keys = nodes(initial).filter((node) => node.props.role === "tabpanel").map((node) => node.key);
    click("Materialen");
    const changed = render();
    expect(active(changed)).toHaveLength(1);
    expect(active(changed)[0].props.id).toContain("materials-panel");
    expect(nodes(changed).filter((node) => node.props.role === "tabpanel").map((node) => node.key)).toEqual(keys);
    expect(nodes(changed).filter((node) => node.type === "input").map((node) => node.props.name)).toEqual(["name", "materials"]);
    expect(nodes(changed).some((node) => node.props.disabled)).toBe(false);
  });
  it("retains edits when switching away and back without submitting", () => {
    const input = nodes(render()).find((node) => node.props.name === "name")!;
    (input.props.onChange as (event: unknown) => void)({ target: { value: "Aangepast" } });
    click("Materialen"); click("Overzicht");
    expect(nodes(render()).find((node) => node.props.name === "name")?.props.value).toBe("Aangepast");
    expect(nodes(render()).filter((node) => node.props.role === "tab").every((node) => node.props.type === "button")).toBe(true);
  });
  it("reveals an invalid field's panel so native form validation can focus it", () => {
    const panel = nodes(render()).find((node) => node.props.role === "tabpanel" && String(node.props.id).includes("materials"))!;
    (panel.props.onInvalidCapture as (event: unknown) => void)({ currentTarget: { closest: () => null } });
    expect(active(render())[0].props.id).toContain("materials-panel");
  });
  it("keeps the first invalid field visible when another hidden tab also has invalid fields", () => {
    const panel = nodes(render()).find((node) => node.props.role === "tabpanel" && String(node.props.id).includes("materials"))!;
    (panel.props.onInvalidCapture as (event: unknown) => void)({ currentTarget: { closest: () => ({ querySelector: () => ({}) }), contains: () => false } });
    expect(active(render())[0].props.id).toContain("overview-panel");
  });
  it("supports arrow, Home and End navigation with focus on the selected tab", () => {
    const focus = vi.fn();
    vi.stubGlobal("document", { getElementById: vi.fn(() => ({ focus })) });
    const tab = nodes(render()).find((node) => node.props.role === "tab")!;
    const preventDefault = vi.fn();
    (tab.props.onKeyDown as (event: unknown) => void)({ key: "End", preventDefault });
    expect(active(render())[0].props.id).toContain("materials-panel");
    expect(focus).toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
