import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { deleteSetting, getSetting, setSetting } from "@/lib/repositories";
import { SourceAccessError, SourceFileNotFoundError, SourceTransientError } from "@/lib/source-errors";
import { LEGACY_SUPERADMIN_USER_ID } from "@/lib/identity";
import {
  disconnectStorageConnection,
  getDefaultStorageConnection,
  getStorageConnection,
  LEGACY_ONEDRIVE_CONNECTION_ID,
  readStorageCredentials,
  saveStorageCredentials,
} from "@/lib/storage-connections";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const refreshInFlight = new Map<string, Promise<string>>();

interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface MicrosoftConfiguration {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  redirectUri: string;
}

export interface GraphDriveItem {
  id: string;
  name: string;
  eTag?: string;
  lastModifiedDateTime?: string;
  size?: number;
  file?: { mimeType?: string; hashes?: Record<string, string> };
  folder?: Record<string, unknown>;
  parentReference?: { driveId?: string };
}

export function getMicrosoftConfiguration(): MicrosoftConfiguration | null {
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim();
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim();
  const tenantId = process.env.MICROSOFT_TENANT_ID?.trim();
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !tenantId || !redirectUri) return null;
  return { clientId, clientSecret, tenantId, redirectUri };
}

export function getMicrosoftConfigurationProblem(): string | null {
  if (!getMicrosoftConfiguration()) return "MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_TENANT_ID en MICROSOFT_REDIRECT_URI moeten ingesteld zijn.";
  if (!getTokenEncryptionKey()) return "GRAPH_TOKEN_ENCRYPTION_KEY moet een base64-gecodeerde sleutel van 32 bytes zijn.";
  return null;
}

export function createMicrosoftAuthorizationUrl(state: string, codeChallenge: string): string {
  const config = requiredMicrosoftConfiguration();
  const url = new URL(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/authorize`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", "offline_access Files.Read");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export function createPkceChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

export async function exchangeMicrosoftCode(code: string, codeVerifier: string, ownerUserId = LEGACY_SUPERADMIN_USER_ID): Promise<void> {
  const config = requiredMicrosoftConfiguration();
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    redirect_uri: config.redirectUri,
    scope: "offline_access Files.Read",
  });
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !payload || typeof payload.access_token !== "string" || typeof payload.refresh_token !== "string") {
    throw new Error("Microsoft kon geen toegangstoken uitgeven.");
  }
  await storeTokens(ownerUserId, {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + Number(payload.expires_in ?? 3600) * 1000,
  });
}

export async function getGraphAccessToken(storageConnectionId = LEGACY_ONEDRIVE_CONNECTION_ID): Promise<string> {
  const tokens = await readTokens(storageConnectionId);
  if (!tokens) throw new Error("OneDrive is nog niet verbonden.");
  if (tokens.expiresAt > Date.now() + 60_000) return tokens.accessToken;

  if (!refreshInFlight.has(storageConnectionId)) {
    const refresh = refreshGraphAccessToken(storageConnectionId, tokens).finally(() => { refreshInFlight.delete(storageConnectionId); });
    refreshInFlight.set(storageConnectionId, refresh);
  }
  return refreshInFlight.get(storageConnectionId)!;
}

async function refreshGraphAccessToken(storageConnectionId: string, tokens: OAuthTokens): Promise<string> {
  const config = requiredMicrosoftConfiguration();
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
      scope: "offline_access Files.Read",
    }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !payload || typeof payload.access_token !== "string") {
    throw new Error("De OneDrive-verbinding is verlopen. Verbind opnieuw in het beheer.");
  }
  const refreshed = {
    accessToken: payload.access_token,
    refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : tokens.refreshToken,
    expiresAt: Date.now() + Number(payload.expires_in ?? 3600) * 1000,
  };
  const connection = await getDefaultStorageConnectionForId(storageConnectionId);
  await storeTokens(connection.ownerUserId, refreshed, storageConnectionId);
  return refreshed.accessToken;
}

export async function graphJson<T>(pathOrUrl: string, storageConnectionId?: string): Promise<T> {
  const token = await getGraphAccessToken(storageConnectionId);
  const url = microsoftGraphUrl(pathOrUrl);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) throw graphResponseError(response.status);
  return response.json() as Promise<T>;
}

export async function readGraphFile(driveId: string, itemId: string, storageConnectionId?: string): Promise<Buffer> {
  const download = await openGraphFile(driveId, itemId, undefined, undefined, {}, storageConnectionId);
  return Buffer.from(await download.arrayBuffer());
}

interface OpenGraphFileDependencies {
  fetch?: typeof fetch;
  getAccessToken?: typeof getGraphAccessToken;
}

export async function openGraphFile(driveId: string, itemId: string, range?: string, signal?: AbortSignal, dependencies: OpenGraphFileDependencies = {}, storageConnectionId?: string): Promise<Response> {
  const fetchImplementation = dependencies.fetch ?? fetch;
  const token = await (dependencies.getAccessToken ?? getGraphAccessToken)(storageConnectionId);
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  if (range) headers.set("Range", range);
  const response = await fetchImplementation(`${GRAPH_BASE_URL}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`, {
    headers, redirect: "manual", cache: "no-store", signal,
  });
  if (response.ok) return response;
  const downloadUrl = response.headers.get("location");
  if (!downloadUrl) throw graphResponseError(response.status);
  const target = new URL(downloadUrl);
  if (target.protocol !== "https:") throw new Error("Microsoft Graph leverde een onveilige download-URL.");
  const downloadHeaders = new Headers();
  if (range) downloadHeaders.set("Range", range);
  const download = await fetchImplementation(target, { headers: downloadHeaders, cache: "no-store", signal });
  if (!download.ok) throw graphResponseError(download.status);
  return download;
}

export async function resolveDriveFolder(relativePath: string, storageConnectionId = LEGACY_ONEDRIVE_CONNECTION_ID): Promise<{ driveId: string; folderId: string }> {
  const normalized = normalizeOneDriveFolderPath(relativePath);
  if (!normalized) throw new Error("Vul een OneDrive-bronmap in.");
  const item = await graphJson<GraphDriveItem>(`/me/drive/root:/${normalized.split("/").map(encodeURIComponent).join("/")}:?$select=id,name,folder,parentReference`, storageConnectionId);
  if (!item.id || !item.folder || !item.parentReference?.driveId) throw new Error("De geconfigureerde OneDrive-bron is geen toegankelijke map.");
  return { driveId: item.parentReference.driveId, folderId: item.id };
}

export function normalizeOneDriveFolderPath(value: string): string | null {
  const segments = value.trim().replaceAll("\\", "/").split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) return null;
  return segments.join("/");
}

export async function hasOneDriveConnection(): Promise<boolean> {
  return Boolean(await readTokens(LEGACY_ONEDRIVE_CONNECTION_ID)) && Boolean(await getSetting("onedrive_drive_id")) && Boolean(await getSetting("onedrive_folder_id"));
}

export async function hasOneDriveAuthorization(userId = LEGACY_SUPERADMIN_USER_ID): Promise<boolean> {
  const connection = await getDefaultStorageConnection(userId, "onedrive");
  return Boolean(connection && await readTokens(connection.id));
}

export async function saveOneDriveConnection(folderPath: string): Promise<void> {
  const normalized = normalizeOneDriveFolderPath(folderPath);
  if (!normalized) throw new Error("De OneDrive-bronmap is ongeldig.");
  const resolved = await resolveDriveFolder(normalized);
  await Promise.all([
    setSetting("onedrive_folder_path", normalized),
    setSetting("onedrive_drive_id", resolved.driveId),
    setSetting("onedrive_folder_id", resolved.folderId),
    setSetting("onedrive_connected_at", new Date().toISOString()),
  ]);
}

export async function getOneDriveConnection() {
  const [driveId, folderId, folderPath, connectedAt, storageConnection] = await Promise.all([
    getSetting("onedrive_drive_id"), getSetting("onedrive_folder_id"), getSetting("onedrive_folder_path"), getSetting("onedrive_connected_at"),
    getDefaultStorageConnection(LEGACY_SUPERADMIN_USER_ID, "onedrive"),
  ]);
  if (!driveId || !folderId || !storageConnection) return null;
  return { driveId, folderId, folderPath, connectedAt, storageConnectionId: storageConnection.id };
}

export async function setOneDriveFolderPath(value: string): Promise<void> {
  const normalized = normalizeOneDriveFolderPath(value);
  if (!normalized) throw new Error("Gebruik een relatief OneDrive-pad zonder . of ...");
  await setSetting("onedrive_folder_path", normalized);
}

export async function getOneDriveFolderPath(): Promise<string> {
  return (await getSetting("onedrive_folder_path")) ?? "";
}

export async function disconnectOneDrive(userId = LEGACY_SUPERADMIN_USER_ID): Promise<void> {
  const connection = await getDefaultStorageConnection(userId, "onedrive");
  if (connection) await disconnectStorageConnection(userId, connection.id);
  if (userId === LEGACY_SUPERADMIN_USER_ID) {
    await Promise.all(["onedrive_drive_id", "onedrive_folder_id", "onedrive_connected_at"].map(deleteSetting));
  }
}

function requiredMicrosoftConfiguration(): MicrosoftConfiguration {
  const config = getMicrosoftConfiguration();
  const problem = getMicrosoftConfigurationProblem();
  if (!config || problem) throw new Error(problem ?? "Microsoft-configuratie ontbreekt.");
  return config;
}

async function storeTokens(ownerUserId: string, tokens: OAuthTokens, storageConnectionId?: string): Promise<void> {
  await saveStorageCredentials({
    ownerUserId,
    provider: "onedrive",
    connectionId: storageConnectionId,
    encryptedCredentials: encrypt(JSON.stringify(tokens)),
    displayName: "Persoonlijke OneDrive",
  });
}

async function readTokens(storageConnectionId: string): Promise<OAuthTokens | null> {
  const encrypted = await readStorageCredentials(storageConnectionId);
  if (!encrypted) return null;
  try {
    const parsed = JSON.parse(decrypt(encrypted)) as OAuthTokens;
    return typeof parsed.accessToken === "string" && typeof parsed.refreshToken === "string" && typeof parsed.expiresAt === "number" ? parsed : null;
  } catch {
    return null;
  }
}

async function getDefaultStorageConnectionForId(storageConnectionId: string) {
  const connection = await getStorageConnection(storageConnectionId);
  if (!connection || connection.provider !== "onedrive") throw new Error("De OneDrive-storageverbinding bestaat niet meer.");
  return connection;
}

function getTokenEncryptionKey(): Buffer | null {
  const value = process.env.GRAPH_TOKEN_ENCRYPTION_KEY?.trim();
  if (!value) return null;
  try {
    const key = Buffer.from(value, "base64");
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

export function microsoftGraphUrl(pathOrUrl: string): string {
  const url = pathOrUrl.startsWith("https://") ? new URL(pathOrUrl) : new URL(`${GRAPH_BASE_URL}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`);
  if (url.protocol !== "https:" || url.hostname !== "graph.microsoft.com" || (url.pathname !== "/v1.0" && !url.pathname.startsWith("/v1.0/"))) {
    throw new Error("Onverwachte Microsoft Graph-URL.");
  }
  return url.toString();
}

function encrypt(plaintext: string): string {
  const key = getTokenEncryptionKey();
  if (!key) throw new Error("GRAPH_TOKEN_ENCRYPTION_KEY ontbreekt of is ongeldig.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decrypt(value: string): string {
  const [version, iv, tag, content, extra] = value.split(".");
  const key = getTokenEncryptionKey();
  if (version !== "v1" || !iv || !tag || !content || extra || !key) throw new Error("Ongeldige opgeslagen OneDrive-token.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(content, "base64url")), decipher.final()]).toString("utf8");
}

function graphResponseError(status: number): SourceAccessError {
  if (status === 404) return new SourceFileNotFoundError("Het OneDrive-bronbestand bestaat niet meer.");
  if (status === 429 || status >= 500) return new SourceTransientError("OneDrive is tijdelijk niet beschikbaar. Probeer later opnieuw.");
  return new SourceAccessError(`Microsoft Graph weigerde het bronbestand (HTTP ${status}).`);
}
