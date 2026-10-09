import { isValidElement, type ReactElement } from "react";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ refs: [] as unknown[], cursor: 0, open: false }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useId: () => "role-test",
  useRef: () => ({ current: hooks.refs[hooks.cursor++] }),
  useState: () => [hooks.open, (value: boolean) => { hooks.open = value; }],
}));

import { TeacherRoleBadge, TeacherRoleInlineEditor } from "./teacher-role-inline-editor";

function nodes(value: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!isValidElement<Record<string, unknown>>(value)) return [];
  return [value, ...nodes(value.props.children)];
}

const action = vi.fn<(data: FormData) => Promise<void>>();
const focus = vi.fn();
const choices = [{ focus: vi.fn() }, { focus: vi.fn() }];
const trigger = { focus, getBoundingClientRect: () => ({ left: 290, top: 150, bottom: 180 }) };
const popover = {
  matches: vi.fn(() => hooks.open),
  showPopover: vi.fn(() => { hooks.open = true; }),
  hidePopover: vi.fn(() => { hooks.open = false; }),
  querySelector: vi.fn(() => choices[1]),
  querySelectorAll: vi.fn(() => choices),
  getBoundingClientRect: () => ({ width: 220, height: 140 }),
  style: { left: "", top: "" },
};

function render(role: "viewer" | "editor" = "editor") {
  hooks.cursor = 0;
  return TeacherRoleInlineEditor({ learningSpaceId: "space-5", userId: "teacher-1", name: "Elias Editor", role, action });
}

beforeEach(() => {
  vi.clearAllMocks();
  hooks.refs = [trigger, popover]; hooks.open = false;
  action.mockResolvedValue(undefined);
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => { callback(); return 1; });
  vi.stubGlobal("window", { innerWidth: 320, innerHeight: 260 });
  vi.stubGlobal("document", { activeElement: choices[1] });
});
afterEach(() => vi.unstubAllGlobals());

describe("teacher role popover", () => {
  it("uses the same badge sizing for all roles and muted fixed owner styling", async () => {
    const css = await readFile(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    const badge = css.match(/\.teacher-role-badge \{([^}]+)\}/)![1];
    expect(badge).toContain("min-height: 28px;");
    expect(badge).toContain("font-size: 13px;");
    expect(badge).toContain("font-weight: 700;");
    const ownerRules = [...css.matchAll(/\.teacher-role-badge-owner \{([^}]+)\}/g)];
    expect(ownerRules).toHaveLength(2);
    for (const rule of ownerRules) {
      expect(rule[1]).toContain("background: #edf1ef;");
      expect(rule[1]).toContain("color: #68757b;");
    }
    expect(css).not.toMatch(/teacher-role-badge-owner[^{}]*:(?:hover|focus)/);
  });
  it.each(["viewer", "editor"] as const)("opens the %s badge, selects the current role and fits the viewport", (role) => {
    const tree = render(role);
    const markup = renderToStaticMarkup(tree);
    expect(markup).toContain('aria-label="Rol van Elias Editor wijzigen"');
    expect(markup).toContain('popover="auto"');
    expect(markup).toContain('role="menu" aria-label="Rol"');
    const buttons = nodes(tree).filter((node) => node.props.role === "menuitemradio");
    expect(buttons.map((button) => [button.props.value, button.props["aria-checked"]]))
      .toEqual([["viewer", role === "viewer"], ["editor", role === "editor"]]);
    expect(markup).toContain('name="learningSpaceId" value="space-5"');
    expect(markup).toContain('name="userId" value="teacher-1"');
    const toggle = nodes(tree).find((node) => node.props["aria-haspopup"] === "menu")!;
    (toggle.props.onClick as () => void)();
    expect(popover.showPopover).toHaveBeenCalledOnce();
    expect(choices[1].focus).toHaveBeenCalledOnce();
    expect(popover.style).toEqual({ left: "88px", top: "108px" });
    const menu = nodes(tree).find((node) => node.props.role === "menu")!;
    (menu.props.onToggle as (event: unknown) => void)({ currentTarget: popover });
    expect(nodes(render(role)).find((node) => node.props["aria-haspopup"] === "menu")?.props["aria-expanded"]).toBe(true);
    (toggle.props.onClick as () => void)();
    expect(popover.hidePopover).toHaveBeenCalledOnce();
  });

  it.each(["viewer", "editor"] as const)("submits %s through the supplied action and closes after success", async (role) => {
    hooks.open = true;
    const form = nodes(render()).find((node) => node.type === "form")!;
    const data = new FormData();
    data.set("learningSpaceId", "space-5"); data.set("userId", "teacher-1"); data.set("role", role);
    await (form.props.action as (data: FormData) => Promise<void>)(data);
    expect(action).toHaveBeenCalledWith(data);
    expect(popover.hidePopover).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
    expect(hooks.open).toBe(false);
  });

  it("propagates action failures without prematurely closing the popover", async () => {
    action.mockRejectedValue(new Error("Bestaande foutfeedback"));
    const form = nodes(render()).find((node) => node.type === "form")!;
    await expect((form.props.action as (data: FormData) => Promise<void>)(new FormData())).rejects.toThrow("Bestaande foutfeedback");
    expect(popover.hidePopover).not.toHaveBeenCalled();
  });

  it("supports arrow navigation and closes on Escape with focus returned to the badge", () => {
    const menu = nodes(render()).find((node) => node.props.role === "menu")!;
    const keydown = menu.props.onKeyDown as (event: unknown) => void;
    const preventDefault = vi.fn();
    keydown({ key: "ArrowDown", currentTarget: popover, preventDefault });
    expect(choices[0].focus).toHaveBeenCalledOnce();
    keydown({ key: "Escape", currentTarget: popover, preventDefault });
    expect(popover.hidePopover).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
  });

  it("renders the owner badge without a trigger, form or popover", () => {
    const markup = renderToStaticMarkup(<TeacherRoleBadge role="owner" />);
    expect(markup).toContain("Eigenaar");
    expect(markup).not.toMatch(/<button|<form|popover=/);
  });
});
