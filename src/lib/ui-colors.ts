export const DEFAULT_LEARNING_SPACE_COLOR = "#DCEFE9";
export const DEFAULT_PORTFOLIO_COLOR = "#E7EEF2";
export const DEFAULT_LEARNING_SPACE_DESCRIPTION = "Portfolio's en uitwerkingen.";

const HEX_COLOR = /^#[0-9A-F]{6}$/;

export function normalizeHexColor(value: string, fallback: string): string {
  const normalized = value.trim().toUpperCase();
  return HEX_COLOR.test(normalized) ? normalized : fallback;
}

export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value.trim().toUpperCase());
}

export function deriveLightColor(value: string, fallback: string): string {
  const color = normalizeHexColor(value, fallback);
  const accentWeight = 0.2;
  const channels = [1, 3, 5].map((index) => {
    const accent = Number.parseInt(color.slice(index, index + 2), 16);
    return Math.round(accent * accentWeight + 255 * (1 - accentWeight));
  });
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export function cardColorStyle(value: string, fallback: string): CSSProperties & { "--card-color": string } {
  return { "--card-color": normalizeHexColor(value, fallback) };
}
import type { CSSProperties } from "react";
