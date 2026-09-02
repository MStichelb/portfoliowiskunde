import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getAuthenticatedUser: vi.fn(), isAdminUserAuthenticated: vi.fn(), getAuthenticationProblem: vi.fn() }));

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  isAdminUserAuthenticated: mocks.isAdminUserAuthenticated,
  getAuthenticationProblem: mocks.getAuthenticationProblem,
}));
vi.mock("@/app/breakglass/actions", () => ({ breakGlassLoginAction: vi.fn() }));
vi.mock("@/app/components/page-banner", () => ({ PageBanner: ({ variant }: { variant: string }) => <div className={`page-banner-${variant}`} /> }));

import SmartschoolLoginPage from "./aanmelden/page";
import AdminLoginPage from "./admin/login/page";
import BreakGlassPage from "./breakglass/page";

describe("login and break-glass UX", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUser.mockResolvedValue(null);
    mocks.isAdminUserAuthenticated.mockResolvedValue(false);
    mocks.getAuthenticationProblem.mockReturnValue(null);
  });

  it("keeps the normal login page student-focused without Settings, password or break-glass link", async () => {
    const markup = renderToStaticMarkup(await SmartschoolLoginPage({ searchParams: Promise.resolve({}) }));
    expect(markup).toContain("Aanmelden met Smartschool");
    expect(markup).toContain("page-banner-main");
    expect(markup).not.toContain("Herstelwachtwoord");
    expect(markup).not.toContain("breakglass");
    expect(markup).not.toContain("Beheer");
  });

  it("keeps the admin login page Smartschool-only", async () => {
    const markup = renderToStaticMarkup(await AdminLoginPage());
    expect(markup).toContain("Aanmelden met Smartschool");
    expect(markup).not.toContain("Herstelwachtwoord");
    expect(markup).not.toContain("breakglass");
  });

  it("provides the separate password-protected break-glass route", async () => {
    const markup = renderToStaticMarkup(await BreakGlassPage({ searchParams: Promise.resolve({}) }));
    expect(markup).toContain("Noodtoegang beheer");
    expect(markup).toContain("Herstelwachtwoord");
    expect(markup).toContain('type="password"');
  });
});
