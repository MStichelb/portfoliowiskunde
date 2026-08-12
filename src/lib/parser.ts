import type {
  ParsedPortfolioDirectory,
  ParsedSectionDirectory,
  ParsedSolutionFile,
} from "@/lib/domain";

const PORTFOLIO_DIRECTORY = /^portfolio\s+(\d+[a-z]?)\s*-\s*(.+)$/i;
const SECTION_DIRECTORY = /^(\d+)\s*-\s*(.+)$/;
const SOLUTION_PREFIX = /^pf(\d+[a-z]?)\s*-\s*oef(\d+)([a-z]?)(.*)\.(pdf|png|jpe?g)$/i;
const STEP_TOKEN = /\((\d+)\)/g;

export function normalizePortfolioCode(code: string): string {
  return code.trim().toUpperCase();
}

export function parsePortfolioDirectory(
  name: string,
): ParsedPortfolioDirectory | null {
  const match = name.trim().match(PORTFOLIO_DIRECTORY);
  if (!match) return null;

  return {
    code: normalizePortfolioCode(match[1]),
    title: match[2].trim(),
  };
}

export function parseSectionDirectory(name: string): ParsedSectionDirectory | null {
  const match = name.trim().match(SECTION_DIRECTORY);
  if (!match) return null;

  return { order: Number(match[1]), title: match[2].trim() };
}

export function parseSolutionFileName(name: string): ParsedSolutionFile | null {
  const match = name.trim().match(SOLUTION_PREFIX);
  if (!match) return null;

  const exerciseNumber = Number(match[2]);
  const exerciseSuffix = (match[3] ?? "").toLowerCase();
  const extension = match[5].toLowerCase() as ParsedSolutionFile["extension"];
  const tail = match[4].trim();
  const steps = [...tail.matchAll(STEP_TOKEN)];
  if (steps.length > 1) return null;
  const withoutStep = tail.replace(STEP_TOKEN, "");
  if (/[()]/.test(withoutStep)) return null;
  if (withoutStep && !withoutStep.startsWith("-")) return null;

  const tokens = withoutStep ? withoutStep.slice(1).split("-").map((token) => token.trim()) : [];
  if (tokens.some((token) => token.length === 0)) return null;
  const alternativeMarkers = tokens.filter((token) => token.toLowerCase() === "alt");
  if (alternativeMarkers.length > 1) return null;

  return {
    portfolioCode: normalizePortfolioCode(match[1]),
    exerciseNumber,
    exerciseSuffix,
    exerciseCode: `${exerciseNumber}${exerciseSuffix}`,
    // Only an exact hyphen-delimited `alt` token is structural. All other tokens are descriptions.
    variant: alternativeMarkers.length === 1 ? "alternative" : "standard",
    step: steps[0] ? Number(steps[0][1]) : 1,
    extension,
  };
}
