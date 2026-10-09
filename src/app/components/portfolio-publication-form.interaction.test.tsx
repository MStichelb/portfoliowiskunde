import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ show: vi.fn(), values: [] as unknown[], cursor: 0 }));
vi.mock("react", async (importOriginal: () => Promise<typeof import("react")>) => ({
  ...await importOriginal(),
  useContext: () => hooks.show,
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (value: unknown) => { hooks.values[index] = value; }];
  },
}));

import { PortfolioPublicationForm } from "./portfolio-publication-form";

beforeEach(() => { hooks.values = []; hooks.cursor = 0; });

describe("portfolio theme selection after save", () => {
  it.each([["systems", "systems"], [null, "systems"], ["systems", "analysis"]] as const)("preserves the stored theme through save, native reset and remount (%s -> %s)", async (initial: string | null, target: string) => {
    const action = vi.fn(async (data: FormData) => ({ themeId: String(data.get("themeId")) }));
    const props = { ...formProps(action), themeId: initial };
    const tree = PortfolioPublicationForm(props);
    const select = themeSelect(tree)!;
    expect(select.value).toBe(initial ?? "");
    expect(select.defaultValue).toBeUndefined();
    select.onChange({ target: { value: target } });
    const data = new FormData();
    data.set("themeId", target);
    await tree.props.action(data);
    const preventDefault = vi.fn();
    tree.props.onReset({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    hooks.cursor = 0;
    const saved = PortfolioPublicationForm(props);
    expect(action).toHaveBeenCalledWith(data);
    expect(themeSelect(saved)?.value).toBe(target);
    expect(renderToStaticMarkup(saved)).toContain(`<option value="${target}" selected="">`);
    hooks.values = []; hooks.cursor = 0;
    expect(themeSelect(PortfolioPublicationForm({ ...props, themeId: target }))?.value).toBe(target);
  });

  it("uses the server-confirmed relation rather than blindly keeping the submitted choice", async () => {
    const props = formProps(async () => ({ themeId: "analysis" }));
    const tree = PortfolioPublicationForm(props);
    themeSelect(tree)!.onChange({ target: { value: "systems" } });
    await tree.props.action(new FormData());
    hooks.cursor = 0;
    expect(themeSelect(PortfolioPublicationForm(props))?.value).toBe("analysis");
  });

  it("keeps folder mode disabled and follows the source theme supplied by the server", () => {
    const props = { ...formProps(() => undefined), themeMode: "folder" as const, themeId: "systems" };
    expect(themeSelect(PortfolioPublicationForm(props))).toMatchObject({ disabled: true, value: "systems" });
    hooks.cursor = 0;
    expect(themeSelect(PortfolioPublicationForm({ ...props, themeId: null }))).toMatchObject({ disabled: true, value: "" });
  });
});

function formProps(action: Parameters<typeof PortfolioPublicationForm>[0]["action"]): Parameters<typeof PortfolioPublicationForm>[0] {
  return { id: "portfolio-1", title: "Stelsels", cardColor: "#E7EEF2", visible: true, limited: false, publishFrom: "", publishUntil: "",
    customText: null, customTextPosition: "above_documents", themeId: null, themeMode: "none",
    themes: [{ id: "systems", name: "Stelsels" }, { id: "analysis", name: "Analyse" }], miscellaneousLabel: "Overige portfolio's", action };
}

interface SelectProps { name?: string; children?: ReactNode; value?: string; defaultValue?: string; disabled?: boolean; onChange: (event: { target: { value: string } }) => void; }
function themeSelect(node: ReactNode): SelectProps | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<SelectProps>(child)) continue;
    if (child.type === "select" && child.props.name === "themeId") return child.props;
    const found = themeSelect(child.props.children);
    if (found) return found;
  }
}
