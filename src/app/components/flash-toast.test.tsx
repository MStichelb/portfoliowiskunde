import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The repository uses server rendering and controlled hooks rather than a DOM test dependency.
const hooks = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as Array<{ current: unknown }>, cursor: 0, refCursor: 0,
  effects: [] as Array<() => void | (() => void)>, show: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.states)) hooks.states[index] = initial;
    return [hooks.states[index], (value: unknown) => {
      hooks.states[index] = typeof value === "function" ? value(hooks.states[index]) : value;
    }];
  },
  useRef: (initial: unknown) => hooks.refs[hooks.refCursor++] ?? (hooks.refs[hooks.refCursor - 1] = { current: initial }),
  useCallback: (callback: unknown) => callback,
  useContext: () => hooks.show,
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
}));

import { consumeToastFeedback, ExerciseNoteFeedback, FlashToast, Toast, ToastProvider } from "./flash-toast";

function render<T>(callback: () => T): T {
  hooks.cursor = 0; hooks.refCursor = 0; hooks.effects = [];
  return callback();
}
function effects() { return hooks.effects.map((effect) => effect()).filter((cleanup) => typeof cleanup === "function"); }
function nodes(value: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!isValidElement<Record<string, unknown>>(value)) return [];
  return [value, ...nodes(value.props.children)];
}
const dismissed = vi.fn();
let href: string;
const replace = vi.fn((_state: unknown, _title: string, path: string) => { href = new URL(path, href).href; });

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  hooks.states = []; hooks.refs = []; hooks.effects = [];
  href = "https://example.test/admin/5/toegang?accessSaved=1&tab=groups&filter=a&filter=b#students";
  vi.stubGlobal("window", {
    location: { get href() { return href; } }, history: { replaceState: replace },
    setTimeout, clearTimeout, matchMedia: vi.fn(() => ({ matches: false })),
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("shared toast", () => {
  it("measures the navigation edge and observes mobile resizing, scrolling and modal changes", () => {
    const property = vi.fn(), disconnect = vi.fn(), observe = vi.fn();
    let bottom = 82;
    const nav = { getBoundingClientRect: () => ({ bottom }) };
    const modal = { matches: () => true };
    let dialogs: unknown[] = [];
    let update: () => void = () => {};
    vi.stubGlobal("document", { body: {}, querySelector: () => nav, querySelectorAll: () => dialogs, documentElement: { style: { setProperty: property } } });
    vi.stubGlobal("MutationObserver", class { constructor(callback: () => void) { update = callback; } observe = observe; disconnect = disconnect; });
    vi.stubGlobal("ResizeObserver", class { observe = observe; disconnect = disconnect; });
    Object.assign(window, { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    render(() => ToastProvider({ children: null }));
    const cleanups = effects();
    expect(property).toHaveBeenLastCalledWith("--toast-header-bottom", "82px");
    bottom = 110; update();
    expect(property).toHaveBeenLastCalledWith("--toast-header-bottom", "110px");
    dialogs = [modal]; update();
    expect(hooks.states).toContain(modal); // Moves the stack inside the modal, outside inert page content.
    dialogs = []; bottom = -54; update();
    expect(property).toHaveBeenLastCalledWith("--toast-header-bottom", "0px");
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain("var(--toast-header-bottom, 54px) + 12px");
    expect(window.addEventListener).toHaveBeenCalledWith("scroll", expect.any(Function), true);
    cleanups.forEach((cleanup) => cleanup());
    expect(disconnect).toHaveBeenCalledTimes(2);
  });
  it("retains the original success deadline when moving the stack into a dialog", () => {
    const expiresAt = Date.now() + 2000;
    render(() => Toast({ type: "success", message: "Klaar", expiresAt, onDismiss: dismissed })); effects();
    vi.advanceTimersByTime(1999); expect(hooks.states[0]).toBe(false);
    vi.advanceTimersByTime(1); expect(hooks.states[0]).toBe(true);
  });
  it.each([['success', 'status'], ['error', 'alert']] as const)("renders %s with its fixed design and accessible role", (type, role) => {
    const markup = renderToStaticMarkup(render(() => Toast({ type, message: "Opgeslagen & klaar", onDismiss: dismissed })));
    expect(markup).toContain(`class="toast toast-${type}"`);
    expect(markup).toContain(`role="${role}"`);
    expect(markup).toContain('aria-label="Melding sluiten"');
    expect(markup).toContain('type="button"');
    expect(markup).toContain("Opgeslagen &amp; klaar");
  });
  it("starts dismissing success at exactly five seconds and completes the exit animation", () => {
    const props = { type: "success" as const, message: "Klaar", onDismiss: dismissed };
    render(() => Toast(props)); const cleanup = effects();
    vi.advanceTimersByTime(4999); expect(hooks.states[0]).toBe(false);
    vi.advanceTimersByTime(1); expect(hooks.states[0]).toBe(true);
    cleanup.forEach((fn) => fn());
    const tree = render(() => Toast(props)); effects();
    expect(tree.props.className).toContain("toast-closing");
    vi.advanceTimersByTime(160); expect(dismissed).toHaveBeenCalledOnce();
  });
  it("keeps errors until manually dismissed", () => {
    render(() => Toast({ type: "error", message: "Mislukt", onDismiss: dismissed })); effects();
    vi.advanceTimersByTime(60000);
    expect(hooks.states[0]).toBe(false); expect(dismissed).not.toHaveBeenCalled();
  });
  it.each(["success", "error"] as const)("manually closes %s", (type) => {
    const props = { type, message: "Klaar", onDismiss: dismissed };
    const tree = render(() => Toast(props));
    const button = nodes(tree).find((node) => node.type === "button")!;
    (button.props.onClick as () => void)();
    render(() => Toast(props)); effects(); vi.advanceTimersByTime(160);
    expect(dismissed).toHaveBeenCalledOnce();
  });
  it("skips exit delay for reduced motion and disables CSS animations", () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    hooks.states = [true];
    render(() => Toast({ type: "error", message: "Mislukt", onDismiss: dismissed })); effects();
    vi.advanceTimersByTime(0); expect(dismissed).toHaveBeenCalledOnce();
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain("@media (prefers-reduced-motion: reduce) { .toast, .toast-closing { animation: none;");
    expect(css).toMatch(/\.toast-stack \{[^}]*position: fixed;[^}]*flex-direction: column;[^}]*gap: 10px;/);
  });
  it("stacks messages with independent identities and removal", () => {
    const first = render(() => ToastProvider({ children: null }));
    first.props.value({ type: "success", message: "Eerste" });
    first.props.value({ type: "error", message: "Tweede" });
    const tree = render(() => ToastProvider({ children: null }));
    const toasts = nodes(tree).filter((node) => node.type === Toast);
    expect(toasts.map((node) => node.props.message)).toEqual(["Eerste", "Tweede"]);
    expect(toasts[0].key).not.toBe(toasts[1].key);
    (toasts[0].props.onDismiss as () => void)();
    expect(nodes(render(() => ToastProvider({ children: null }))).filter((node) => node.type === Toast).map((node) => node.props.message)).toEqual(["Tweede"]);
  });
});

describe("flash feedback consumption", () => {
  it("consumes note completion while retaining the exercise anchor and other query state", () => {
    href = "https://example.test/admin/wis/portfolio/p?filter=visible&noteFeedback=deleted#exercise-e";
    render(() => ExerciseNoteFeedback()); effects(); effects();
    expect(hooks.show).toHaveBeenCalledExactlyOnceWith({ type: "success", message: "Oefennotitie verwijderd." });
    expect(href).toBe("https://example.test/admin/wis/portfolio/p?filter=visible#exercise-e");
  });
  it("removes only feedback, preserving repeated query values and hash", () => {
    expect(consumeToastFeedback("accessSaved")).toBe(true);
    expect(replace).toHaveBeenCalledWith(null, "", "/admin/5/toegang?tab=groups&filter=a&filter=b#students");
    expect(consumeToastFeedback("accessSaved")).toBe(false);
    expect(replace).toHaveBeenCalledOnce();
  });
  it.each(["success", "error"] as const)("shows %s once across effect replay, tab rerenders and remounts", (type) => {
    const props = { type, message: "Feedback", feedbackKey: "accessSaved" };
    render(() => FlashToast(props)); effects(); effects();
    render(() => FlashToast(props)); effects();
    hooks.refs = []; // A local panel remount still cannot revive consumed URL feedback.
    render(() => FlashToast(props)); effects();
    expect(hooks.show).toHaveBeenCalledExactlyOnceWith({ type, message: "Feedback" });
    href = "https://example.test/admin/5/toegang?accessSaved=1";
    render(() => FlashToast(props)); effects();
    expect(hooks.show).toHaveBeenCalledTimes(2);
  });
  it("consumes multiple messages independently", () => {
    href = "https://example.test/admin?created=1&error=failed&filter=active";
    render(() => FlashToast({ type: "success", message: "Aangemaakt", feedbackKey: "created" })); effects();
    render(() => FlashToast({ type: "error", message: "Mislukt", feedbackKey: "error" })); effects();
    expect(hooks.show).toHaveBeenCalledTimes(2);
    expect(href).toBe("https://example.test/admin?filter=active");
  });
  it("does not duplicate local feedback on parent rerenders", () => {
    const props = { type: "success" as const, message: "Klaar" };
    render(() => FlashToast(props)); effects(); effects();
    render(() => FlashToast(props)); effects();
    expect(hooks.show).toHaveBeenCalledOnce();
  });
});
