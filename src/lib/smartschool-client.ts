import type { ExternalAuthProvider, ExternalAuthenticationResult } from "@/lib/external-auth-provider";
import type { NormalizedExternalIdentity, NormalizedGroupMembership } from "@/lib/identity";

export const SMARTSCHOOL_PRODUCTION_REDIRECT_URI = "https://portfoliowiskunde.vercel.app/api/auth/smartschool/callback";
export const SMARTSCHOOL_SCOPES = "userinfo groupinfo";

export interface SmartschoolConfig {
  clientId: string;
  clientSecret: string;
  platformUrl: string;
  redirectUri: string;
}

export const SMARTSCHOOL_UNAVAILABLE_MESSAGE = "Aanmelden via Smartschool is momenteel niet beschikbaar. Probeer het later opnieuw.";

export interface SmartschoolCallbackInput {
  code: string;
}

export class SmartschoolClientError extends Error {
  constructor(message = SMARTSCHOOL_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = "SmartschoolClientError";
  }
}

export function getSmartschoolConfig(environment: NodeJS.ProcessEnv = process.env): SmartschoolConfig {
  const clientId = environment.SMARTSCHOOL_CLIENT_ID?.trim();
  const clientSecret = environment.SMARTSCHOOL_CLIENT_SECRET?.trim();
  const platform = environment.SMARTSCHOOL_PLATFORM_URL?.trim();
  const redirectUri = environment.SMARTSCHOOL_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !platform || !redirectUri) throw new SmartschoolClientError("De Smartschool-configuratie is onvolledig.");

  const platformUrl = normalizeSmartschoolPlatform(platform);
  const parsedRedirect = parseUrl(redirectUri, "SMARTSCHOOL_REDIRECT_URI is ongeldig.");
  if (parsedRedirect.protocol !== "https:" && !(environment.NODE_ENV !== "production" && parsedRedirect.protocol === "http:" && parsedRedirect.hostname === "localhost")) {
    throw new SmartschoolClientError("SMARTSCHOOL_REDIRECT_URI moet HTTPS gebruiken.");
  }
  if (environment.NODE_ENV === "production" && parsedRedirect.toString() !== SMARTSCHOOL_PRODUCTION_REDIRECT_URI) {
    throw new SmartschoolClientError("SMARTSCHOOL_REDIRECT_URI komt niet overeen met de productiecallback.");
  }
  return { clientId, clientSecret, platformUrl, redirectUri: parsedRedirect.toString() };
}

export function smartschoolAuthorizationUrl(config: SmartschoolConfig, state: string): URL {
  const url = new URL(`${config.platformUrl}/OAuth`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SMARTSCHOOL_SCOPES);
  url.searchParams.set("state", state);
  return url;
}

export class SmartschoolAuthProvider implements ExternalAuthProvider<SmartschoolCallbackInput> {
  readonly id = "smartschool";

  constructor(
    private readonly config: SmartschoolConfig,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  async authenticate({ code }: SmartschoolCallbackInput): Promise<ExternalAuthenticationResult> {
    const accessToken = await this.exchangeCode(code);
    const [userinfo, groupinfo] = await Promise.all([
      this.profileCall("userinfo", accessToken),
      this.profileCall("groupinfo", accessToken),
    ]);
    return normalizeSmartschoolResponses(userinfo, groupinfo, this.config.platformUrl);
  }

  private async exchangeCode(code: string): Promise<string> {
    const response = await this.formPost(`${this.config.platformUrl}/OAuth/index/token`, {
      grant_type: "authorization_code",
      code,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.config.redirectUri,
    });
    const accessToken = isRecord(response) && typeof response.access_token === "string" ? response.access_token : null;
    if (!accessToken) throw new SmartschoolClientError();
    return accessToken;
  }

  private profileCall(endpoint: "userinfo" | "groupinfo", accessToken: string): Promise<unknown> {
    return this.formPost(`${this.config.platformUrl}/Api/V1/${endpoint}`, { access_token: accessToken });
  }

  private async formPost(url: string, values: Record<string, string>): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImplementation(url, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(values),
        cache: "no-store",
      });
    } catch {
      throw new SmartschoolClientError();
    }
    if (!response.ok) throw new SmartschoolClientError();
    try {
      return await response.json();
    } catch {
      throw new SmartschoolClientError();
    }
  }
}

export function normalizeSmartschoolResponses(userinfo: unknown, groupinfo: unknown, configuredPlatform: string): ExternalAuthenticationResult {
  if (!isRecord(userinfo) || typeof userinfo.userID !== "string" || !userinfo.userID.trim()) throw new SmartschoolClientError();
  const platform = typeof userinfo.platform === "string" && userinfo.platform.trim()
    ? normalizeSmartschoolPlatform(userinfo.platform)
    : configuredPlatform;
  if (platform !== configuredPlatform) throw new SmartschoolClientError();

  const identity: NormalizedExternalIdentity = {
    provider: "smartschool",
    providerSubject: userinfo.userID.trim(),
    providerPlatform: platform,
    displayName: smartschoolDisplayName(userinfo),
  };
  const groups = isRecord(groupinfo) ? [
    ...normalizeGroups(groupinfo.groups, "direct", platform),
    ...normalizeGroups(groupinfo.parentGroups, "parent", platform),
  ] : [];
  return { identity, groups };
}

export function normalizeSmartschoolPlatform(value: string): string {
  const url = parseUrl(value, "SMARTSCHOOL_PLATFORM_URL is ongeldig.");
  if (url.protocol !== "https:") throw new SmartschoolClientError("SMARTSCHOOL_PLATFORM_URL moet HTTPS gebruiken.");
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new SmartschoolClientError("SMARTSCHOOL_PLATFORM_URL moet alleen de platform-origin bevatten.");
  }
  return url.origin.toLowerCase();
}

function normalizeGroups(value: unknown, membershipType: "direct" | "parent", platform: string): NormalizedGroupMembership[] {
  if (!Array.isArray(value)) return [];
  const groups: NormalizedGroupMembership[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate) || typeof candidate.groupID !== "string" || !candidate.groupID.trim()) continue;
    if (typeof candidate.platform === "string" && candidate.platform.trim()) {
      try {
        if (normalizeSmartschoolPlatform(candidate.platform) !== platform) continue;
      } catch {
        continue;
      }
    }
    groups.push({
      provider: "smartschool",
      externalGroupId: candidate.groupID.trim(),
      externalGroupName: firstString(candidate.name, candidate.description),
      membershipType,
    });
  }
  return groups;
}

function smartschoolDisplayName(profile: Record<string, unknown>): string {
  return firstString(
    profile.fullname,
    [firstString(profile.actualUserName), firstString(profile.actualUserSurname)].filter(Boolean).join(" "),
    [firstString(profile.name), firstString(profile.surname)].filter(Boolean).join(" "),
    profile.username,
  ) ?? "Smartschoolgebruiker";
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function parseUrl(value: string, message: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new SmartschoolClientError(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
