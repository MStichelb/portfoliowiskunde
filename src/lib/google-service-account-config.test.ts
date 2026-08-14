import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  getGoogleServiceAccountConfigurationProblem,
  getGoogleServiceAccountCredentials,
  GOOGLE_DRIVE_READONLY_SCOPE,
} from "./google-service-account-config";

describe("Google service-account configuration", () => {
  it("decodes a complete key and exposes only the read-only Drive scope", () => {
    const environment = { GOOGLE_SERVICE_ACCOUNT_JSON_B64: validCredentials() };
    expect(getGoogleServiceAccountCredentials(environment)).toMatchObject({
      type: "service_account",
      project_id: "portfolio-test",
      client_email: "portfolio-reader@portfolio-test.iam.gserviceaccount.com",
    });
    expect(GOOGLE_DRIVE_READONLY_SCOPE).toBe("https://www.googleapis.com/auth/drive.readonly");
    expect(getGoogleServiceAccountConfigurationProblem(environment)).toBeNull();
  });

  it("rejects missing, malformed and structurally invalid credentials without exposing their contents", () => {
    expect(getGoogleServiceAccountConfigurationProblem({})).toContain("ontbreekt");
    expect(getGoogleServiceAccountConfigurationProblem({ GOOGLE_SERVICE_ACCOUNT_JSON_B64: "***" })).toContain("base64");
    const invalid = Buffer.from(JSON.stringify({ type: "authorized_user", private_key: "secret" })).toString("base64");
    expect(getGoogleServiceAccountConfigurationProblem({ GOOGLE_SERVICE_ACCOUNT_JSON_B64: invalid })).toBe("Het Google service-accountkeybestand mist verplichte velden.");
  });
});

function validCredentials(): string {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return Buffer.from(JSON.stringify({
    type: "service_account",
    project_id: "portfolio-test",
    client_email: "portfolio-reader@portfolio-test.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  })).toString("base64");
}
