import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const context = vi.hoisted(() => ({ spaces: [{ id: "a", shortLabel: "A", name: "Eerste", sortOrder: 1 }, { id: "b", shortLabel: "B", name: "Tweede", sortOrder: 2 }], selected: { id: "a", shortLabel: "A" }, canChoose: true, select: vi.fn() }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useContext: () => context }));
import { SourceProfileViewContext } from "./source-profile-presentation";

function nodes(value: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!isValidElement<Record<string, unknown>>(value)) return [];
  return [value, ...nodes(value.props.children)];
}
describe("header view context interaction", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("selects a presentation context and closes the dropdown without submitting", () => {
    const tree = SourceProfileViewContext();
    const choices = nodes(tree).filter((node) => node.type === "button");
    expect(choices).toHaveLength(2);
    expect(choices.every((node) => node.props.type === "button" && !node.props.name)).toBe(true);
    expect(choices[0].props["aria-pressed"]).toBe(true);
    const focus = vi.fn();
    const details = { open: true, querySelector: () => ({ focus }) };
    (choices[1].props.onClick as (event: unknown) => void)({ currentTarget: { closest: () => details } });
    expect(context.select).toHaveBeenCalledWith("b");
    expect(details.open).toBe(false);
    expect(focus).toHaveBeenCalled();
  });
  it("Escape closes only the open dropdown and prevents the modal's Escape handler", () => {
    const tree = SourceProfileViewContext();
    const focus = vi.fn();
    const event = { key: "Escape", currentTarget: { open: true, querySelector: () => ({ focus }) }, stopPropagation: vi.fn(), preventDefault: vi.fn() };
    (tree.props.onKeyDown as (event: unknown) => void)(event);
    expect(event.currentTarget.open).toBe(false);
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
    event.stopPropagation.mockClear();
    (tree.props.onKeyDown as (event: unknown) => void)(event);
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });
});
