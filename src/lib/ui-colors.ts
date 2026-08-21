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

export function cardColorStyle(value: string, fallback: string): CSSProperties & { "--card-color": string } {
  return { "--card-color": normalizeHexColor(value, fallback) };
}
import type { CSSProperties } from "react";
