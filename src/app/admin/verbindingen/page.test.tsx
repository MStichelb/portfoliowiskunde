import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  hasOneDriveAuthorization: vi.fn(),
  getMicrosoftConfigurationProblem: vi.fn(),
  getGoogleServiceAccountConfigurationProblem: vi.fn(),
  getPublicEmergencyAccess: vi.fn(),
  getSmartschoolConfig: vi.fn(),
  listManagedUsers: vi.fn(),
}));

vi.mock("@/app/admin/instellingen/actions", () => ({ setPublicEmergencyAccessAction: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdminUser: mocks.requireAdminUser }));
vi.mock("@/lib/google-service-account-config", () => ({ getGoogleServiceAccountConfigurationProblem: mocks.getGoogleServiceAccountConfigurationProblem }));
vi.mock("@/lib/onedrive", () => ({
  getMicrosoftConfigurationProblem: mocks.getMicrosoftConfigurationProblem,
  hasOneDriveAuthorization: mocks.hasOneDriveAuthorization,
}));
vi.mock("@/lib/public-access", () => ({ getPublicEmergencyAccess: mocks.getPublicEmergencyAccess }));
vi.mock("@/lib/smartschool-client", () => ({ getSmartschoolConfig: mocks.getSmartschoolConfig }));
vi.mock("@/lib/user-management", () => ({ listManagedUsers: mocks.listManagedUsers }));

import ConnectionsPage from "./page";

describe("connections page visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasOneDriveAuthorization.mockResolvedValue(true);
    mocks.getMicrosoftConfigurationProblem.mockReturnValue(null);
    mocks.getGoogleServiceAccountConfigurationProblem.mockReturnValue(null);
    mocks.getPublicEmergencyAccess.mockResolvedValue({ enabled: false, enabledAt: null });
    mocks.getSmartschoolConfig.mockReturnValue({});
    mocks.listManagedUsers.mockResolvedValue([]);
  });

  it("shows a teacher only their personal OneDrive connection", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("teacher"));

    const markup = renderToStaticMarkup(await ConnectionsPage({ searchParams: Promise.resolve({}) }));

    expect(markup).toContain('id="onedrive-heading"');
    expect(markup).toContain('href="/api/onedrive/connect"');
    expect(markup).toContain("OneDrive verbonden");
    expect(markup).not.toContain("geconnecteerd");
    expect(markup).not.toContain('id="smartschool-heading"');
    expect(markup).not.toContain('id="google-drive-heading"');
    expect(mocks.getPublicEmergencyAccess).not.toHaveBeenCalled();
    expect(mocks.listManagedUsers).not.toHaveBeenCalled();
  });

  it("shows a superadmin OneDrive, Smartschool, emergency access and Google Drive", async () => {
    mocks.requireAdminUser.mockResolvedValue(user("superadmin"));
    mocks.listManagedUsers.mockResolvedValue([{ ...user("superadmin"), hasSmartschoolIdentity: true }]);

    const markup = renderToStaticMarkup(await ConnectionsPage({ searchParams: Promise.resolve({}) }));

    expect(markup).toContain('id="onedrive-heading"');
    expect(markup).toContain('id="smartschool-heading"');
    expect(markup).toContain('id="emergency-access-heading"');
    expect(markup).toContain('id="google-drive-heading"');
    expect(markup).toContain('href="/api/auth/smartschool/link"');
    expect(markup).toContain("Google Drive geconfigureerd");
    expect(markup).not.toContain("serviceaccount");
  });
});

function user(role: "teacher" | "superadmin") {
  return {
    id: `${role}-1`,
    displayName: role,
    firstName: role,
    lastName: null,
    email: null,
    role,
    status: "active" as const,
    classGroupOverrideId: null,
  };
}
