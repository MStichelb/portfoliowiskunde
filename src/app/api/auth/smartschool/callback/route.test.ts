import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createSmartschoolOAuthState, SMARTSCHOOL_STATE_COOKIE } from "@/lib/smartschool-oauth-state";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  createUserSession: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  findOrCreateExternalUser: vi.fn(),
  linkExternalIdentityToUser: vi.fn(),
  replaceExternalIdentityGroups: vi.fn(),
  updateUserFromExternalIdentity: vi.fn(),
  getAccessibleLearningSpaceIds: vi.fn(),
  getLearningSpaces: vi.fn(),
}));

vi.mock("@/lib/smartschool-client", () => ({
  getSmartschoolConfig: () => ({ clientId: "id", clientSecret: "secret", platformUrl: "https://school.smartschool.be", redirectUri: "http://localhost/callback" }),
  SmartschoolAuthProvider: class { authenticate = mocks.authenticate; },
}));
vi.mock("@/lib/auth", () => ({
  createUserSession: mocks.createUserSession,
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  SESSION_COOKIE: "portfolio_admin_session",
  sessionCookieOptions: () => ({ httpOnly: true, maxAge: 100, path: "/", sameSite: "lax", secure: false }),
}));
vi.mock("@/lib/identity", () => ({
  findOrCreateExternalUser: mocks.findOrCreateExternalUser,
  linkExternalIdentityToUser: mocks.linkExternalIdentityToUser,
  replaceExternalIdentityGroups: mocks.replaceExternalIdentityGroups,
  updateUserFromExternalIdentity: mocks.updateUserFromExternalIdentity,
}));
vi.mock("@/lib/authorization", () => ({ getAccessibleLearningSpaceIds: mocks.getAccessibleLearningSpaceIds }));
vi.mock("@/lib/repositories", () => ({ getLearningSpaces: mocks.getLearningSpaces }));

import { GET } from "./route";

const identity = { provider: "smartschool", providerSubject: "subject", providerPlatform: "https://school.smartschool.be", displayName: "Leerling" };
const groups = [{ provider: "smartschool", externalGroupId: "group-5", membershipType: "direct" as const }];
const student = { id: "user-1", displayName: "Leerling", email: null, role: "student" as const, status: "active" as const };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ADMIN_SESSION_SECRET", "callback-state-secret");
  mocks.authenticate.mockResolvedValue({ identity, groups });
  mocks.findOrCreateExternalUser.mockResolvedValue({ user: student, identity: { id: "identity-1" }, created: true });
  mocks.replaceExternalIdentityGroups.mockResolvedValue(undefined);
  mocks.updateUserFromExternalIdentity.mockResolvedValue(student);
  mocks.getAccessibleLearningSpaceIds.mockResolvedValue(["space-5"]);
  mocks.getLearningSpaces.mockResolvedValue([{ id: "space-5", slug: "5" }]);
  mocks.createUserSession.mockResolvedValue({ token: "signed-session", maxAge: 100 });
});

describe("GET /api/auth/smartschool/callback", () => {
  it("weigert een state mismatch zonder tokenexchange", async () => {
    const response = await GET(callbackRequest({ returnedState: "wrong" }));
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname + location.search).toBe("/aanmelden?error=state");
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });

  it("handelt een OAuth-fout veilig af zonder providerdetails te reflecteren", async () => {
    const response = await GET(callbackRequest({ oauthError: "access_denied" }));
    expect(response.headers.get("location")).toContain("/aanmelden?error=oauth");
    expect(response.headers.get("location")).not.toContain("access_denied");
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });

  it("stuurt token- of profielproblemen naar een nette foutpagina zonder technische details", async () => {
    const logging = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.authenticate.mockRejectedValue(new Error("secret token exchange detail"));
    const response = await GET(callbackRequest());
    expect(response.headers.get("location")).toContain("/aanmelden?error=auth");
    expect(response.headers.get("location")).not.toContain("secret");
    expect(logging).toHaveBeenCalledWith("Smartschool OAuth callback failed.", expect.objectContaining({ intent: "login", errorType: "Error" }));
    logging.mockRestore();
  });

  it("maakt een interne sessie en routeert één LearningSpace automatisch", async () => {
    const response = await GET(callbackRequest());
    expect(mocks.authenticate).toHaveBeenCalledWith({ code: "auth-code" });
    expect(mocks.findOrCreateExternalUser).toHaveBeenCalledWith(identity);
    expect(mocks.updateUserFromExternalIdentity).toHaveBeenCalledWith(student.id, identity);
    expect(mocks.replaceExternalIdentityGroups).toHaveBeenCalledWith("identity-1", groups);
    expect(response.headers.get("location")).toBe("http://localhost/5");
    expect(response.headers.get("set-cookie")).toContain("portfolio_admin_session=signed-session");
  });

  it("blokkeert een disabled bestaande user", async () => {
    mocks.findOrCreateExternalUser.mockResolvedValue({ user: { ...student, status: "disabled" }, identity: { id: "identity-1" }, created: false });
    mocks.updateUserFromExternalIdentity.mockResolvedValue({ ...student, status: "disabled" });
    const response = await GET(callbackRequest());
    expect(response.headers.get("location")).toContain("/aanmelden?error=disabled");
    expect(mocks.createUserSession).not.toHaveBeenCalled();
  });

  it("koppelt alleen vanuit dezelfde actieve superadminsessie zonder tweede user", async () => {
    const superadmin = { ...student, id: "user-legacy-superadmin", role: "superadmin" as const };
    mocks.getAuthenticatedUser.mockResolvedValue(superadmin);
    mocks.linkExternalIdentityToUser.mockResolvedValue({ id: "identity-superadmin", userId: superadmin.id });
    mocks.updateUserFromExternalIdentity.mockResolvedValue(superadmin);
    mocks.getAccessibleLearningSpaceIds.mockResolvedValue(["space-5"]);
    const response = await GET(callbackRequest({ intent: "link", userId: superadmin.id }));
    expect(mocks.linkExternalIdentityToUser).toHaveBeenCalledWith(superadmin.id, identity);
    expect(mocks.findOrCreateExternalUser).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("/admin?smartschool=linked");
  });
});

function callbackRequest(options: { returnedState?: string; oauthError?: string; intent?: "login" | "link"; userId?: string } = {}) {
  const state = createSmartschoolOAuthState("callback-state-secret", { intent: options.intent, userId: options.userId }, Date.now());
  const url = new URL("http://localhost/api/auth/smartschool/callback");
  url.searchParams.set("state", options.returnedState ?? state.state);
  url.searchParams.set("code", "auth-code");
  if (options.oauthError) url.searchParams.set("error", options.oauthError);
  return new NextRequest(url, { headers: { cookie: `${SMARTSCHOOL_STATE_COOKIE}=${state.cookieValue}` } });
}
