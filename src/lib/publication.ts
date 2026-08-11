export type PortfolioVisibilityMode = "hidden" | "visible";
export type ChildVisibilityMode = "hidden" | "visible";
export type EffectivePublicationState = "visible" | "will-be-visible" | "will-remain-hidden" | "hidden";
export type EffectivePublicationReason = "self-hidden" | "parent-hidden" | "parent-scheduled" | "self-scheduled" | "expired" | null;

export interface PublicationWindow { publishFrom: string | null; publishUntil: string | null; }
export interface PortfolioPublication extends PublicationWindow { visible: boolean; limited: boolean; }
export interface ChildPublication extends PublicationWindow { mode: ChildVisibilityMode; limited: boolean; }
export interface EffectivePublication { configuredVisibility: ChildVisibilityMode; state: EffectivePublicationState; reason: EffectivePublicationReason; effectiveFrom: string | null; effectiveUntil: string | null; }

export function resolvePortfolioPublication(publication: PortfolioPublication, now = new Date()): EffectivePublication {
  return resolvePublication(publication.visible ? "visible" : "hidden", publication.limited, publication, null, now);
}

export function resolveChildPublication(publication: ChildPublication, parent: EffectivePublication, now = new Date()): EffectivePublication {
  return resolvePublication(publication.mode, publication.limited, publication, parent, now);
}

export function isPortfolioPublished(publication: PortfolioPublication, now = new Date()): boolean { return resolvePortfolioPublication(publication, now).state === "visible"; }
export function isChildPublished(parent: EffectivePublication, publication: ChildPublication, now = new Date()): boolean { return resolveChildPublication(publication, parent, now).state === "visible"; }

function resolvePublication(configuredVisibility: ChildVisibilityMode, limited: boolean, window: PublicationWindow, parent: EffectivePublication | null, now: Date): EffectivePublication {
  const ownFrom = limited ? validDate(window.publishFrom) : null;
  const ownUntil = limited ? validDate(window.publishUntil) : null;
  const effectiveFrom = latestDate(parent?.effectiveFrom ?? null, ownFrom);
  const effectiveUntil = earliestDate(parent?.effectiveUntil ?? null, ownUntil);
  if (configuredVisibility === "hidden") return { configuredVisibility, state: "hidden", reason: "self-hidden", effectiveFrom, effectiveUntil };
  if (parent && parent.state !== "visible") {
    const scheduled = parent.state === "will-be-visible";
    return { configuredVisibility, state: scheduled ? "will-be-visible" : "will-remain-hidden", reason: scheduled ? "parent-scheduled" : "parent-hidden", effectiveFrom, effectiveUntil };
  }
  const current = now.getTime();
  if (effectiveFrom && current < Date.parse(effectiveFrom)) return { configuredVisibility, state: "will-be-visible", reason: parent?.effectiveFrom === effectiveFrom ? "parent-scheduled" : "self-scheduled", effectiveFrom, effectiveUntil };
  if (effectiveUntil && current > Date.parse(effectiveUntil)) return { configuredVisibility, state: "hidden", reason: "expired", effectiveFrom, effectiveUntil };
  return { configuredVisibility, state: "visible", reason: null, effectiveFrom, effectiveUntil };
}

function validDate(value: string | null): string | null { return value && Number.isFinite(Date.parse(value)) ? value : null; }
function latestDate(a: string | null, b: string | null): string | null { if (!a) return b; if (!b) return a; return Date.parse(a) >= Date.parse(b) ? a : b; }
function earliestDate(a: string | null, b: string | null): string | null { if (!a) return b; if (!b) return a; return Date.parse(a) <= Date.parse(b) ? a : b; }

export function formatPublicationLabel(status: EffectivePublication, now = new Date()): string {
  if (status.state === "hidden") return status.reason === "expired" && status.effectiveUntil ? `Zichtbaar tot ${formatDate(status.effectiveUntil)}` : "Verborgen";
  if (status.state === "will-remain-hidden") return "Wordt verborgen";
  if (status.state === "will-be-visible" && status.effectiveFrom && Date.parse(status.effectiveFrom) > now.getTime()) return status.effectiveUntil ? `Zichtbaar van ${formatDate(status.effectiveFrom)} tot ${formatDate(status.effectiveUntil)}` : `Zichtbaar vanaf ${formatDate(status.effectiveFrom)}`;
  return status.effectiveUntil && Date.parse(status.effectiveUntil) > now.getTime() ? `Zichtbaar tot ${formatDate(status.effectiveUntil)}` : "Zichtbaar";
}
function formatDate(value: string): string { return new Intl.DateTimeFormat("nl-BE", { timeZone: BRUSSELS_TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value)); }

const BRUSSELS_TIME_ZONE = "Europe/Brussels";
export function parseBrusselsDateTime(value: string): string | null { const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/); if (!match) return null; const [, year, month, day, hour, minute] = match; const localAsUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)); let candidate = localAsUtc - timeZoneOffset(localAsUtc); candidate = localAsUtc - timeZoneOffset(candidate); const date = new Date(candidate); return formatBrusselsDateTimeInput(date) === value ? date.toISOString() : null; }
export function formatBrusselsDateTimeInput(value: string | Date | null): string { if (!value) return ""; const date = value instanceof Date ? value : new Date(value); if (Number.isNaN(date.getTime())) return ""; const values = new Intl.DateTimeFormat("en-CA", { timeZone: BRUSSELS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).reduce<Record<string, string>>((result, part) => { result[part.type] = part.value; return result; }, {}); return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`; }
function timeZoneOffset(timestamp: number): number { const values = new Intl.DateTimeFormat("en-CA", { timeZone: BRUSSELS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(timestamp)).reduce<Record<string, string>>((result, part) => { result[part.type] = part.value; return result; }, {}); return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second)) - timestamp; }
