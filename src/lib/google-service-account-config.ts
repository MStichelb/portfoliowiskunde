import { createPrivateKey } from "node:crypto";

export const GOOGLE_DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

export interface GoogleServiceAccountCredentials {
  type: "service_account";
  project_id: string;
  client_email: string;
  private_key: string;
}

interface GoogleServiceAccountEnvironment {
  [key: string]: string | undefined;
  GOOGLE_SERVICE_ACCOUNT_JSON_B64?: string;
}

export function getGoogleServiceAccountCredentials(environment: GoogleServiceAccountEnvironment = process.env): GoogleServiceAccountCredentials {
  const encoded = environment.GOOGLE_SERVICE_ACCOUNT_JSON_B64?.trim();
  if (!encoded) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON_B64 ontbreekt.");
  if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON_B64 is geen geldige base64-waarde.");
  }

  let parsed: unknown;
  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON_B64 bevat geen geldig JSON-keybestand.");
  }

  if (!isRecord(parsed) || parsed.type !== "service_account" || typeof parsed.project_id !== "string" || !parsed.project_id.trim()
    || typeof parsed.client_email !== "string" || !/^[^@\s]+@[^@\s]+$/.test(parsed.client_email)
    || typeof parsed.private_key !== "string" || !parsed.private_key.includes("BEGIN PRIVATE KEY")) {
    throw new Error("Het Google service-accountkeybestand mist verplichte velden.");
  }
  try {
    createPrivateKey(parsed.private_key);
  } catch {
    throw new Error("De private key in het Google service-accountkeybestand is ongeldig.");
  }

  return {
    type: "service_account",
    project_id: parsed.project_id.trim(),
    client_email: parsed.client_email.trim(),
    private_key: parsed.private_key,
  };
}

export function getGoogleServiceAccountConfigurationProblem(environment: GoogleServiceAccountEnvironment = process.env): string | null {
  try {
    getGoogleServiceAccountCredentials(environment);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "De Google service-accountconfiguratie is ongeldig.";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
