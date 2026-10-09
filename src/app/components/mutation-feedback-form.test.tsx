import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ show: vi.fn(), state: null as string | null, actions: [] as Array<(previous: never, data: FormData) => Promise<unknown>> }));
vi.mock("./flash-toast", () => ({ useToast: () => hooks.show }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: () => [hooks.state, (value: string | null) => { hooks.state = value; }],
}));

import { MutationFeedbackForm, useMutationFeedback } from "./mutation-feedback-form";

beforeEach(() => { vi.clearAllMocks(); hooks.state = null; });
describe("opt-in mutation feedback", () => {
  it("confirms each explicit successful save, including repeated identical saves", async () => {
    const run = useMutationFeedback();
    const action = vi.fn(async () => ({ themeId: "confirmed" }));
    expect(await run(action, "Opgeslagen.")).toEqual({ ok: true, result: { themeId: "confirmed" } });
    await run(action, "Opgeslagen.");
    expect(hooks.show).toHaveBeenCalledTimes(2);
    expect(hooks.show).toHaveBeenLastCalledWith({ type: "success", message: "Opgeslagen." });
  });
  it("allows silent successful toggles but reports their failed persistence", async () => {
    const run = useMutationFeedback();
    await run(async () => undefined);
    expect(hooks.show).not.toHaveBeenCalled();
    expect((await run(async () => ({ error: "Zichtbaarheid kon niet worden opgeslagen." }))).ok).toBe(false);
    expect(hooks.show).toHaveBeenCalledWith({ type: "error", message: "Zichtbaarheid kon niet worden opgeslagen." });
  });
  it("keeps correctable planning validation inline without a toast or losing form fields", async () => {
    const action = vi.fn(async () => ({ validationError: "De einddatum moet na de begindatum liggen." }));
    const props = { action, successMessage: "Planning opgeslagen.", children: <input name="publishUntil" defaultValue="2026-10-08T10:00" /> };
    await MutationFeedbackForm(props).props.action(new FormData());
    const tree = MutationFeedbackForm(props);
    const children = tree.props.children as ReactElement[];
    expect(isValidElement(children[0])).toBe(true);
    expect(children[0].props).toMatchObject({ name: "publishUntil", defaultValue: "2026-10-08T10:00" });
    expect(children[1].props).toMatchObject({ role: "alert", children: "De einddatum moet na de begindatum liggen." });
    expect(hooks.show).not.toHaveBeenCalled();
  });
  it("maps unexpected/network failures without exposing exception details", async () => {
    const run = useMutationFeedback();
    expect((await run(async () => { throw new Error("SQL connection secret"); }, "Opgeslagen.", "Opslaan mislukt. Probeer opnieuw.")).ok).toBe(false);
    expect(hooks.show).toHaveBeenCalledExactlyOnceWith({ type: "error", message: "Opslaan mislukt. Probeer opnieuw." });
  });
  it("preserves framework redirects and access failures", async () => {
    const run = useMutationFeedback();
    const redirect = Object.assign(new Error("redirect"), { digest: "NEXT_REDIRECT;replace;/aanmelden;303;" });
    await expect(run(async () => { throw redirect; })).rejects.toBe(redirect);
    const forbidden = Object.assign(new Error("Geen toegang"), { name: "AuthorizationError" });
    await expect(run(async () => { throw forbidden; })).rejects.toBe(forbidden);
    const sanitized = Object.assign(new Error("Server error"), { digest: "production-access-failure" });
    await expect(run(async () => { throw sanitized; })).rejects.toBe(sanitized);
    expect(hooks.show).not.toHaveBeenCalled();
  });
});
