import "server-only";

import { GoogleAuth } from "google-auth-library";

import { getGoogleServiceAccountCredentials, GOOGLE_DRIVE_READONLY_SCOPE } from "@/lib/google-service-account-config";
import { SourceConfigurationError } from "@/lib/source-errors";

let auth: GoogleAuth | undefined;

export async function getGoogleDriveAccessToken(): Promise<string> {
  let credentials;
  try {
    credentials = getGoogleServiceAccountCredentials();
  } catch (error) {
    const message = error instanceof Error ? error.message : "De Google service-accountconfiguratie is ongeldig.";
    throw new SourceConfigurationError(message);
  }

  try {
    auth ??= new GoogleAuth({ credentials, scopes: [GOOGLE_DRIVE_READONLY_SCOPE] });
    const token = await auth.getAccessToken();
    if (!token) throw new Error("Google leverde geen toegangstoken.");
    return token;
  } catch {
    throw new SourceConfigurationError("Google Drive-authenticatie is geweigerd. Controleer het service-accountkeybestand en of de Drive API actief is.");
  }
}
