import type {
  ParsedPortfolioDirectory,
  ParsedSectionDirectory,
  ParsedSolutionFile,
} from "@/lib/domain";

const PORTFOLIO_DIRECTORY = /^portfolio\s+(\d+[a-z]?)\s*-\s*(.+)$/i;
const SECTION_DIRECTORY = /^(\d+)\s*-\s*(.+)$/;
const SOLUTION_FILE =
  /^pf(\d+[a-z]?)\s*-\s*oef(\d+)([a-z]?)(?:\s*-\s*(alt))?(?:\((\d+)\))?\.(pdf|png|jpe?g)$/i;

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
  const match = name.trim().match(SOLUTION_FILE);
  if (!match) return null;

  const exerciseNumber = Number(match[2]);
  const exerciseSuffix = (match[3] ?? "").toLowerCase();
  const extension = match[6].toLowerCase() as ParsedSolutionFile["extension"];

  return {
    portfolioCode: normalizePortfolioCode(match[1]),
    exerciseNumber,
    exerciseSuffix,
    exerciseCode: `${exerciseNumber}${exerciseSuffix}`,
    variant: match[4] ? "alternative" : "standard",
    step: match[5] ? Number(match[5]) : 1,
    extension,
  };
}
