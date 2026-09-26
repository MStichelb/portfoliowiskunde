import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn() }));

vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));

import SystemPage from "./page";

describe("SystemPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ id: "admin", role: "superadmin", status: "active" });
  });

  it("shows the single global Subjects entry to a superadmin", async () => {
    const markup = renderToStaticMarkup(await SystemPage());
    expect(markup).toContain("Appbrede instellingen");
    expect(markup).toContain('href="/admin/systeem/vakken"');
    expect(markup).toContain("Vakken");
  });

  it("stops rendering when the superadmin guard rejects", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("REDIRECT:/admin/login"));
    await expect(SystemPage()).rejects.toThrow("REDIRECT:/admin/login");
  });
});
