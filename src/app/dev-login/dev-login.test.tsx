import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isDevDummyUserId: vi.fn(),
  listDevDummyUsers: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
  redirect: vi.fn((destination: string) => { throw new Error(`NEXT_REDIRECT:${destination}`); }),
  startUserSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ startUserSession: mocks.startUserSession }));
vi.mock("@/lib/identity", () => ({ getUser: mocks.getUser }));
vi.mock("@/lib/dev-users", () => ({
  isDevDummyUserId: mocks.isDevDummyUserId,
  listDevDummyUsers: mocks.listDevDummyUsers,
}));
vi.mock("@/app/components/page-banner", () => ({ PageBanner: () => null }));

import { devLoginAction } from "./actions";
import DevLoginPage from "./page";

describe("development-only login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "development");
    mocks.listDevDummyUsers.mockResolvedValue([]);
    mocks.isDevDummyUserId.mockReturnValue(true);
  });

  afterEach(() => vi.unstubAllEnvs());

  it("rejects the route outside development on the server", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(DevLoginPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.listDevDummyUsers).not.toHaveBeenCalled();
  });

  it("renders seeded dummy accounts without a password field", async () => {
    mocks.listDevDummyUsers.mockResolvedValue([
      user("dev-dummy-teacher-olivia-owner", "Olivia Owner", "teacher"),
      user("dev-dummy-student-karel-klasgroep", "Karel Klasgroep", "student"),
    ]);

    const markup = renderToStaticMarkup(await DevLoginPage());

    expect(markup).toContain("Olivia Owner");
    expect(markup).toContain("Karel Klasgroep");
    expect(markup).toContain("Inloggen");
    expect(markup).not.toContain('type="password"');
  });

  it("accepts only allowlisted dummy user IDs", async () => {
    mocks.isDevDummyUserId.mockReturnValue(false);
    const formData = new FormData();
    formData.set("userId", "real-user");

    await expect(devLoginAction(formData)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.startUserSession).not.toHaveBeenCalled();
  });

  it("rejects the server action outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const formData = new FormData();
    formData.set("userId", "dev-dummy-teacher-olivia-owner");

    await expect(devLoginAction(formData)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.startUserSession).not.toHaveBeenCalled();
  });
  it.each([
    ["teacher", "/admin"],
    ["student", "/"],
  ] as const)("starts the existing session and redirects a %s", async (role, destination) => {
    const account = user(`dev-dummy-${role}`, "Dummy", role);
    mocks.getUser.mockResolvedValue(account);
    const formData = new FormData();
    formData.set("userId", account.id);

    await expect(devLoginAction(formData)).rejects.toThrow(`NEXT_REDIRECT:${destination}`);
    expect(mocks.startUserSession).toHaveBeenCalledWith(account.id);
    expect(mocks.redirect).toHaveBeenCalledWith(destination);
  });

  it("redirects a disabled dummy account to a friendly error state without starting a session", async () => {
    mocks.getUser.mockResolvedValue({ ...user("dev-dummy-disabled", "Disabled", "student"), status: "disabled" });
    const formData = new FormData();
    formData.set("userId", "dev-dummy-disabled");

    await expect(devLoginAction(formData)).rejects.toThrow("NEXT_REDIRECT:/dev-login?error=disabled");
    expect(mocks.startUserSession).not.toHaveBeenCalled();

    const markup = renderToStaticMarkup(await DevLoginPage({ searchParams: Promise.resolve({ error: "disabled" }) }));
    expect(markup).toContain("Deze gebruiker is uitgeschakeld. Neem contact op met de beheerder.");
    expect(markup).toContain('role="alert"');
  });
});

function user(id: string, displayName: string, role: "teacher" | "student") {
  return { id, displayName, firstName: displayName.split(" ")[0], lastName: null, email: null, role, status: "active" as const, classGroupOverrideId: null };
}
