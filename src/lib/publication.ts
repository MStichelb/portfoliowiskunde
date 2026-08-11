export type PortfolioVisibilityMode = "hidden" | "visible";
export type ChildVisibilityMode = "inherit" | "hidden" | "visible";

export interface PublicationWindow {
  publishFrom: string | null;
  publishUntil: string | null;
}

export interface PortfolioPublication extends PublicationWindow {
  visible: boolean;
}

export interface ChildPublication extends PublicationWindow {
  mode: ChildVisibilityMode;
}

export function isWithinPublicationWindow(window: PublicationWindow, now = new Date()): boolean {
  const current = now.getTime();
  const from = window.publishFrom ? Date.parse(window.publishFrom) : null;
  const until = window.publishUntil ? Date.parse(window.publishUntil) : null;
  if ((from !== null && !Number.isFinite(from)) || (until !== null && !Number.isFinite(until))) return false;
  return (from === null || current >= from) && (until === null || current <= until);
}

export function isPortfolioPublished(publication: PortfolioPublication, now = new Date()): boolean {
  return publication.visible && isWithinPublicationWindow(publication, now);
}

export function isChildPublished(parentIsPublished: boolean, publication: ChildPublication, now = new Date()): boolean {
  if (!parentIsPublished || publication.mode === "hidden") return false;
  if (publication.mode === "inherit") return parentIsPublished;
  return isWithinPublicationWindow(publication, now);
}

export function publicationStatus(
  publication: PortfolioPublication | ChildPublication,
  now = new Date(),
): "hidden" | "scheduled" | "expired" | "visible" | "inherit" {
  if ("visible" in publication && !publication.visible) return "hidden";
  if ("mode" in publication && publication.mode === "hidden") return "hidden";
  if ("mode" in publication && publication.mode === "inherit") return "inherit";
  if (publication.publishFrom && Date.parse(publication.publishFrom) > now.getTime()) return "scheduled";
  if (publication.publishUntil && Date.parse(publication.publishUntil) < now.getTime()) return "expired";
  return "visible";
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
  const roundTrip = formatBrusselsDateTimeInput(date);
  return roundTrip === value ? date.toISOString() : null;
}

export function formatBrusselsDateTimeInput(value: string | Date | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const values = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRUSSELS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).reduce<Record<string, string>>((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function timeZoneOffset(timestamp: number): number {
  const values = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRUSSELS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp)).reduce<Record<string, string>>((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  const zonedTimestamp = Date.UTC(
    Number(values.year), Number(values.month) - 1, Number(values.day),
    Number(values.hour), Number(values.minute), Number(values.second),
  );
  return zonedTimestamp - timestamp;
}
