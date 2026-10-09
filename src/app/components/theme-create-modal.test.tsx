import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ show: vi.fn(), index: 0, showModal: vi.fn(), close: vi.fn(), focus: vi.fn(), pending: vi.fn() }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useId: () => "create-title",
  useRef: () => ({ current: hooks.index++ === 0 ? { showModal: hooks.showModal, close: hooks.close } : { focus: hooks.focus } }),
  useContext: () => hooks.show,
  useState: () => [false, hooks.pending],
}));
import { ThemeCreateModal } from "./theme-create-modal";

function nodes(value: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!isValidElement<Record<string, unknown>>(value)) return [];
  return [value, ...nodes(value.props.children)];
}
function render(action: (form: FormData) => Promise<void> = vi.fn(async () => {})) {
  hooks.index = 0;
  return nodes(ThemeCreateModal({ action, learningSpaceId: "space-5", singular: "Deel" }));
}
beforeEach(() => vi.clearAllMocks());
describe("theme creation modal", () => {
  it("opens the existing dialog pattern and keeps the form inside the modal", () => {
    const tree = render();
    (tree.find((node) => node.props.className === "secondary-button theme-add-button")!.props.onClick as () => void)();
    expect(hooks.showModal).toHaveBeenCalledOnce();
    const dialog = tree.find((node) => node.type === "dialog")!;
    expect(dialog.props.open).toBeUndefined();
    expect(nodes(dialog).some((node) => node.type === "form")).toBe(true);
    expect(tree.find((node) => node.type === "h2")!.props.children).toEqual(["Deel", " toevoegen"]);
    expect(tree.find((node) => node.props.name === "learningSpaceId")!.props.value).toBe("space-5");
    const form = tree.find((node) => node.type === "form")!;
    const footer = nodes(form).find((node) => node.props.className === "confirm-dialog-actions")!;
    const buttons = nodes(footer).filter((node) => node.type === "button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0].props.children).toBe("Annuleren");
    expect(buttons[0].props.type).toBe("button");
    expect(buttons[1].props.children).toEqual(["Deel", " toevoegen"]);
    expect(buttons[1].props.type).toBe("submit");
    const label = nodes(form).find((node) => node.type === "label")!;
    expect((label.props.children as unknown[])[0]).toBe("Naam");
    expect(nodes(label).some((node) => node.type === "input" && node.props.name === "name")).toBe(true);
  });
  it("passes the form to the unchanged action and closes after success", async () => {
    const action = vi.fn(async () => {});
    const tree = render(action);
    const data = new FormData(); data.set("name", "Extra"); data.set("learningSpaceId", "space-5");
    await (tree.find((node) => node.type === "form")!.props.action as (form: FormData) => Promise<void>)(data);
    expect(action).toHaveBeenCalledWith(data);
    expect(hooks.close).toHaveBeenCalledOnce();
    expect(hooks.show).toHaveBeenCalledWith({ type: "success", message: "Deel toegevoegd." });
  });
  it("preserves action errors and leaves the dialog open on failure", async () => {
    const action = vi.fn(async () => { throw new Error("Naam bestaat al"); });
    const tree = render(action);
    await (tree.find((node) => node.type === "form")!.props.action as (form: FormData) => Promise<void>)(new FormData());
    expect(hooks.show).toHaveBeenCalledWith({ type: "error", message: "Deel kon niet worden toegevoegd. Probeer opnieuw." });
    expect(hooks.close).not.toHaveBeenCalled();
    expect(hooks.pending).toHaveBeenLastCalledWith(false);
  });
  it("cancels and restores focus to the trigger", () => {
    const tree = render();
    (tree.find((node) => node.type === "button" && node.props.children === "Annuleren")!.props.onClick as () => void)();
    expect(hooks.close).toHaveBeenCalledOnce();
    (tree.find((node) => node.type === "dialog")!.props.onClose as () => void)();
    expect(hooks.focus).toHaveBeenCalledOnce();
  });
});
