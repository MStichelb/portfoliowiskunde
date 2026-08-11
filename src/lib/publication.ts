export type PortfolioVisibilityMode = "hidden" | "visible";
export type ChildVisibilityMode = "hidden" | "visible";
export type EffectivePublicationState = "visible" | "pending" | "hidden";
export type EffectivePublicationReason = "self-hidden" | "parent" | "scheduled" | "expired" | null;

export interface PublicationWindow {
  publishFrom: string | null;
  publishUntil: string | null;
}

export interface PortfolioPublication extends PublicationWindow {
  visible: boolean;
  limited: boolean;
}

export interface ChildPublication extends PublicationWindow {
  mode: ChildVisibilityMode;
}

export interface EffectivePublication {
  configuredVisibility: ChildVisibilityMode;
  state: EffectivePublicationState;
  reason: EffectivePublicationReason;
}

export function resolvePortfolioPublication(publication: PortfolioPublication, now = new Date()): EffectivePublication {
  return resolvePublication(publication.visible ? "visible" : "hidden", publication.limited ? publication : { publishFrom: null, publishUntil: null }, null, now);
}

export function resolveChildPublication(publication: ChildPublication, parent: EffectivePublication, now = new Date()): EffectivePublication {
  return resolvePublication(publication.mode, publication, parent, now);
}

export function isPortfolioPublished(publication: PortfolioPublication, now = new Date()): boolean {
  return resolvePortfolioPublication(publication, now).state === "visible";
}

export function isChildPublished(parent: EffectivePublication | boolean, publication: ChildPublication, now = new Date()): boolean {
  const resolvedParent = typeof parent === "boolean"
    ? { configuredVisibility: "visible" as const, state: parent ? "visible" as const : "pending" as const, reason: parent ? null : "parent" as const }
    : parent;
  return resolveChildPublication(publication, resolvedParent, now).state === "visible";
}

function resolvePublication(configuredVisibility: ChildVisibilityMode, window: PublicationWindow, parent: EffectivePublication | null, now: Date): EffectivePublication {
  if (configuredVisibility === "hidden") return { configuredVisibility, state: "hidden", reason: "self-hidden" };
  if (parent && parent.state !== "visible") return { configuredVisibility, state: "pending", reason: "parent" };
  const current = now.getTime();
  const from = window.publishFrom ? Date.parse(window.publishFrom) : null;
  const until = window.publishUntil ? Date.parse(window.publishUntil) : null;
  if ((from !== null && !Number.isFinite(from)) || (until !== null && !Number.isFinite(until))) return { configuredVisibility, state: "pending", reason: "scheduled" };
  if (from !== null && current < from) return { configuredVisibility, state: "pending", reason: "scheduled" };
  if (until !== null && current > until) return { configuredVisibility, state: "hidden", reason: "expired" };
  return { configuredVisibility, state: "visible", reason: null };
}

const BRUSSELS_TIME_ZONE = "Europe/Brussels";

export function parseBrusselsDateTime(value: string): string | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const localAsUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  let candidate = localAsUtc - timeZoneOffset(localAsUtc);
  candidate = localAsUtc - timeZoneOffset(candidate);
  const date = new Date(candidate);
  return formatBrusselsDateTimeInput(date) === value ? date.toISOString() : null;
}

export function formatBrusselsDateTimeInput(value: string | Date | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const values = new Intl.DateTimeFormat("en-CA", { timeZone: BRUSSELS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).reduce<Record<string, string>>((result, part) => { result[part.type] = part.value; return result; }, {});
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function timeZoneOffset(timestamp: number): number {
  const values = new Intl.DateTimeFormat("en-CA", { timeZone: BRUSSELS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(timestamp)).reduce<Record<string, string>>((result, part) => { result[part.type] = part.value; return result; }, {});
  return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second)) - timestamp;
}
