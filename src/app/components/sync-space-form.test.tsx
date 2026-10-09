import { renderToStaticMarkup } from "react-dom/server";
import { Children, isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminActionState } from "@/app/admin/actions";

const hooks = vi.hoisted(() => ({ show: vi.fn(),
  state: { error: null } as AdminActionState,
  dismissed: null as AdminActionState | null,
  pending: false,
  action: vi.fn(),
  effect: vi.fn(),
  ref: vi.fn(() => ({ current: null })),
}));

vi.mock("react", async (importOriginal: () => Promise<typeof import("react")>) => ({
  ...await importOriginal(),
  useActionState: () => [hooks.state, hooks.action],
  useContext: () => hooks.show,
  useState: () => [hooks.dismissed, (state: AdminActionState) => { hooks.dismissed = state; }],
  useRef: hooks.ref,
  useId: () => "sync-conflict",
  useCallback: (callback: () => void) => callback,
  useEffect: hooks.effect,
}));

vi.mock("react-dom", async (importOriginal: () => Promise<typeof import("react-dom")>) => ({
  ...await importOriginal(),
  useFormStatus: () => ({ pending: hooks.pending }),
}));

vi.mock("@/app/admin/actions", () => ({
  syncSpaceAction: vi.fn(),
}));

import { SyncSpaceForm } from "./sync-space-form";

const conflict = "Oefeningscode 3b komt meerdere keren voor binnen portfolio 1B: Algebra/Portfolio 1B en Algebra/Portfolio 1B/1 Basis. Verplaats de volledige oefening naar één onderdeel of rechtstreeks naar de portfoliomap.";
const render = () => renderToStaticMarkup(<SyncSpaceForm learningSpaceId="space-5" />);

beforeEach(() => {
  hooks.state = { error: null };
  hooks.dismissed = null;
  hooks.pending = false;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("SyncSpaceForm", () => {
  it.each(["Stel eerst een bronprofiel en bron in.", "Stel eerst een bronprofiel in.", "Stel eerst een bron in.", null])("keeps the sync button visible and applies reason %s", (disabledReason) => {
    const markup = renderToStaticMarkup(<SyncSpaceForm learningSpaceId="space-5" disabledReason={disabledReason} />);
    expect(markup).toContain("Nu synchroniseren");
    expect(markup.includes('disabled=""')).toBe(Boolean(disabledReason));
    expect(markup.includes("sync-setup-disabled")).toBe(Boolean(disabledReason));
    expect(markup).toContain("primary-button sync-submit-button");
    if (disabledReason) expect(markup).toContain(`title="${disabledReason}"`);
  });

  it("keeps the existing sync action wiring and shows RefreshCw", () => {
    const markup = render();

    expect(markup).toContain('action="javascript:throw new Error');
    expect(markup).toContain('name="learningSpaceId" value="space-5"');
    expect(markup).toContain("Nu synchroniseren");
    expect(markup).toContain("lucide-refresh-cw");
    expect(markup).not.toContain('role="dialog"');
  });

  it("shows the conflict in the existing compact dialog with actionable text instead of an inline message", () => {
    hooks.state = { error: conflict };
    const markup = render();
    expect(markup).toContain('class="confirm-backdrop"');
    expect(markup).toContain('class="confirm-dialog" role="dialog" aria-modal="true"');
    expect(markup).toContain("Synchronisatie niet gelukt");
    expect(markup).toContain("Oefeningscode 3b werd op meerdere plaatsen gevonden in bundel 1B.");
    expect(markup).toContain("Verplaats alle bestanden van deze oefening naar hetzelfde onderdeel of rechtstreeks naar de bundelmap.");
    expect(markup).not.toContain("Algebra/");
    expect(markup).not.toContain("form-message");
    expect(markup).not.toMatch(/constraint|database|reconciliation/i);
    expect(markup.match(/>Sluiten</g)).toHaveLength(1);
    expect(markup.match(/<form/g)).toHaveLength(1);
    expect(markup.indexOf('role="dialog"')).toBeGreaterThan(markup.indexOf("</form>"));
  });

  it("closes without submitting and reopens after another failed sync with the same message", () => {
    hooks.state = { error: conflict };
    const close = findCloseButton(SyncSpaceForm({ learningSpaceId: "space-5" }));
    vi.stubGlobal("requestAnimationFrame", vi.fn());
    expect(close).toBeDefined();
    close!();
    expect(render()).not.toContain('role="dialog"');
    expect(render()).not.toContain("form-message");
    expect(hooks.action).not.toHaveBeenCalled();
    hooks.state = { error: conflict };
    expect(render()).toContain('role="dialog"');
  });

  it("focuses Sluiten, keeps keyboard focus in the dialog and restores focus on Escape", () => {
    hooks.state = { error: conflict };
    SyncSpaceForm({ learningSpaceId: "space-5" });
    const submitFocus = vi.fn();
    const closeFocus = vi.fn();
    Object.assign(hooks.ref.mock.results[0].value, { current: { querySelector: () => ({ focus: submitFocus }) } });
    Object.assign(hooks.ref.mock.results[1].value, { current: { focus: closeFocus } });
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal("window", { addEventListener, removeEventListener });
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => callback());
    const cleanup = hooks.effect.mock.calls[0][0]();
    expect(closeFocus).toHaveBeenCalledOnce();
    const onKeyDown = addEventListener.mock.calls[0][1];
    const preventDefault = vi.fn();
    onKeyDown({ key: "Tab", preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    onKeyDown({ key: "Escape" });
    expect(submitFocus).toHaveBeenCalledOnce();
    expect(render()).not.toContain('role="dialog"');
    cleanup();
    expect(removeEventListener).toHaveBeenCalledWith("keydown", onKeyDown);
  });

  it("keeps the pending button and successful sync presentation unchanged", () => {
    hooks.pending = true;
    expect(render()).toContain('disabled=""');
    expect(render()).toContain("Synchroniseren...");
    hooks.pending = false;
    hooks.state = { error: conflict };
    expect(render()).toContain('role="dialog"');
    hooks.state = { error: null };
    expect(render()).toContain("Nu synchroniseren");
    expect(render()).not.toContain('role="dialog"');
    expect(render()).not.toContain("form-message");
  });

  it.each([
    "Er loopt al een synchronisatie voor deze leeromgeving.",
    "Deze leeromgeving is gearchiveerd en kan niet worden gesynchroniseerd.",
    "De ingestelde bronmap bestaat niet of is niet bereikbaar.",
  ])("does not render transient sync failures inline: %s", (error: string) => {
    hooks.state = { error };
    const markup = render();
    expect(markup).not.toContain('class="form-message" role="alert"');
    expect(markup).not.toContain(error);
    expect(markup).not.toContain('role="dialog"');
  });
});

function findCloseButton(node: ReactNode): (() => void) | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(child)) continue;
    if (child.type === "button" && child.props.children === "Sluiten") return child.props.onClick;
    const close = findCloseButton(child.props.children);
    if (close) return close;
  }
}
