import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getMicrosoftConfigurationProblem: vi.fn(),
  createMicrosoftAuthorizationUrl: vi.fn(),
  createPkceChallenge: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser }));
vi.mock("@/lib/onedrive", () => ({
  getMicrosoftConfigurationProblem: mocks.getMicrosoftConfigurationProblem,
  createMicrosoftAuthorizationUrl: mocks.createMicrosoftAuthorizationUrl,
  createPkceChallenge: mocks.createPkceChallenge,
}));

import { GET } from "./route";

const teacher = {
  id: "teacher-1",
  displayName: "Leraar Voorbeeld",
  firstName: "Leraar",
  lastName: "Voorbeeld",
  email: null,
  role: "teacher" as const,
  status: "active" as const,
  classGroupOverrideId: null,
};

describe("GET /api/onedrive/connect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUser.mockResolvedValue(teacher);
    mocks.getMicrosoftConfigurationProblem.mockReturnValue(null);
    mocks.createPkceChallenge.mockReturnValue("challenge");
    mocks.createMicrosoftAuthorizationUrl.mockReturnValue(new URL("https://login.microsoftonline.com/tenant/oauth2/v2.0/authorize"));
  });

  it("start voor een leraar een echte providerredirect en bindt de callback aan diens user-ID", async () => {
    const response = await GET(new Request("http://localhost:3000/api/onedrive/connect"));
    expect(response.headers.get("location")).toBe("https://login.microsoftonline.com/tenant/oauth2/v2.0/authorize");
    const cookies = response.headers.getSetCookie().join("; ");
    expect(cookies).toContain("portfolio_onedrive_oauth_state=");
    expect(cookies).toContain("portfolio_onedrive_oauth_verifier=");
    expect(cookies).toContain("portfolio_onedrive_oauth_owner=teacher-1");
    expect(cookies).toContain("HttpOnly");
  });

  it("stuurt een configuratiefout voor een leraar terug naar diens persoonlijke verbindingen", async () => {
    mocks.getMicrosoftConfigurationProblem.mockReturnValue("Configuratie ontbreekt");
    const response = await GET(new Request("http://localhost:3000/api/onedrive/connect"));
    expect(response.headers.get("location")).toBe("http://localhost:3000/admin/verbindingen?onedrive=configuration-error");
    expect(mocks.createMicrosoftAuthorizationUrl).not.toHaveBeenCalled();
  });

  it("stuurt ook een hoofdbeheerder terug naar de canonieke verbindingenpagina", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue({ ...teacher, role: "superadmin" });
    mocks.getMicrosoftConfigurationProblem.mockReturnValue("Configuratie ontbreekt");

    const response = await GET(new Request("http://localhost:3000/api/onedrive/connect"));

    expect(response.headers.get("location")).toBe("http://localhost:3000/admin/verbindingen?onedrive=configuration-error");
  });

  it("weigert een leerling", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue({ ...teacher, role: "student" });
    const response = await GET(new Request("http://localhost:3000/api/onedrive/connect"));
    expect(response.status).toBe(401);
  });
});
