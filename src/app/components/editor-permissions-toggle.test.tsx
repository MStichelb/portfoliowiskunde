import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { commitEditorPermissionsToggle, EditorPermissionsToggle } from "./editor-permissions-toggle";

describe("EditorPermissionsToggle", () => {
  it("renders a read-only switch without turning it into a form submit", () => {
    const markup = renderToStaticMarkup(<EditorPermissionsToggle
      learningSpaceId="space-5"
      initialEnabled={false}
      canChange={false}
      action={vi.fn()}
    />);
    const switchButton = markup.match(/<button[^>]*role="switch"[^>]*>/)?.[0] ?? "";

    expect(switchButton).toContain('type="button"');
    expect(switchButton).toContain('aria-checked="false"');
    expect(switchButton).toContain('aria-readonly="true"');
    expect(switchButton).toContain("disabled");
  });

  it("keeps the requested value after a successful autosave", async () => {
    const action = vi.fn().mockResolvedValue({ saved: true, error: null });

    await expect(commitEditorPermissionsToggle(false, true, action)).resolves.toEqual({ enabled: true, error: null });
    expect(action).toHaveBeenCalledOnce();
  });

  it("rolls back after a handled server failure", async () => {
    const action = vi.fn().mockResolvedValue({ saved: false, error: "Opslaan mislukt." });

    await expect(commitEditorPermissionsToggle(false, true, action)).resolves.toEqual({ enabled: false, error: "Opslaan mislukt." });
  });

  it("rolls back after an unexpected server failure", async () => {
    const action = vi.fn().mockRejectedValue(new Error("database unavailable"));

    await expect(commitEditorPermissionsToggle(true, false, action)).resolves.toEqual({
      enabled: true,
      error: "De bewerkersrechten konden niet worden opgeslagen.",
    });
  });
});
