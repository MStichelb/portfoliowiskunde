import type { ByteRangeRequest } from "@/lib/storage/provider";

export interface ResolvedByteRange {
  start: number;
  end: number;
  length: number;
}

export class InvalidRangeHeaderError extends Error {}

export class RangeNotSatisfiableError extends Error {
  constructor(readonly totalLength: number) {
    super("Het gevraagde bytebereik is niet beschikbaar.");
  }
}

export function parseRangeHeader(value: string | null): ByteRangeRequest | undefined {
  if (value === null) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) throw new InvalidRangeHeaderError("Ongeldige Range-header.");

  if (!match[1]) {
    const length = safeInteger(match[2]);
    if (length <= 0) throw new InvalidRangeHeaderError("Ongeldige suffix-range.");
    return { kind: "suffix", length };
  }

  const start = safeInteger(match[1]);
  const end = match[2] ? safeInteger(match[2]) : undefined;
  if (end !== undefined && end < start) throw new InvalidRangeHeaderError("Het einde van de Range ligt voor het begin.");
  return { kind: "offset", start, end };
}

export function resolveByteRange(request: ByteRangeRequest | undefined, totalLength: number): ResolvedByteRange | undefined {
  if (!request) return undefined;
  if (!Number.isSafeInteger(totalLength) || totalLength <= 0) throw new RangeNotSatisfiableError(Math.max(0, totalLength));

  if (request.kind === "suffix") {
    const length = Math.min(request.length, totalLength);
    return { start: totalLength - length, end: totalLength - 1, length };
  }

  if (request.start >= totalLength) throw new RangeNotSatisfiableError(totalLength);
  const end = Math.min(request.end ?? totalLength - 1, totalLength - 1);
  return { start: request.start, end, length: end - request.start + 1 };
}

function safeInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new InvalidRangeHeaderError("Range bevat een ongeldig getal.");
  return parsed;
}
