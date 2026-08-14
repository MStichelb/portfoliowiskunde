import { describe, expect, it } from "vitest";

import { InvalidRangeHeaderError, RangeNotSatisfiableError, parseRangeHeader, resolveByteRange } from "./byte-range";

describe("single HTTP byte ranges", () => {
  it("parses bounded, open-ended and suffix ranges", () => {
    expect(parseRangeHeader("bytes=0-99")).toEqual({ kind: "offset", start: 0, end: 99 });
    expect(parseRangeHeader("bytes=100-")).toEqual({ kind: "offset", start: 100 });
    expect(parseRangeHeader("bytes=-50")).toEqual({ kind: "suffix", length: 50 });
  });

  it.each(["items=0-1", "bytes=", "bytes=10-1", "bytes=0-1,4-5", "bytes=-0"])("rejects malformed or multipart range %s", (value) => {
    expect(() => parseRangeHeader(value)).toThrow(InvalidRangeHeaderError);
  });

  it("clamps ranges to the actual file size and rejects out-of-range starts", () => {
    expect(resolveByteRange({ kind: "offset", start: 100 }, 250)).toEqual({ start: 100, end: 249, length: 150 });
    expect(resolveByteRange({ kind: "offset", start: 0, end: 999 }, 250)).toEqual({ start: 0, end: 249, length: 250 });
    expect(resolveByteRange({ kind: "suffix", length: 20 }, 250)).toEqual({ start: 230, end: 249, length: 20 });
    expect(() => resolveByteRange({ kind: "offset", start: 250 }, 250)).toThrow(RangeNotSatisfiableError);
  });
});
