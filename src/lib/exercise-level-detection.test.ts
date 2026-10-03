import { describe, expect, it } from "vitest";

import { detectExerciseLevelFromSource } from "./exercise-level-detection";
import { exerciseLevelRecognitionSchema, parseSourceProfileConfig } from "./source-profile-config";

const source = (name: string, directorySegments: string[] = []) => ({ name, directorySegments });
const directoryConfig = {
  method: "subdirectory" as const,
  source: { type: "exercise_resource" as const, resourceId: "worked-solution" },
  mapping: { opwarmer: "Opwarmer", basis: "Basis", uitdaging: "Uitdaging", verdieping: "Verdieping" },
};

describe("exercise level source detection", () => {
  it.each([
    ["Opwarmer", "opwarmer"],
    ["basis", "basis"],
    ["UITDAGING", "uitdaging"],
    ["Verdieping", "verdieping"],
  ] as const)("matches complete subdirectory segment %s case-insensitively", (segment, level) => {
    expect(detectExerciseLevelFromSource([source("PF1_Oef1.png", [segment])], directoryConfig)).toEqual({ level, conflict: false });
  });

  it("does not partially match a directory, ignores empty mappings and reports conflicts", () => {
    const withEmpty = { ...directoryConfig, mapping: { ...directoryConfig.mapping, opwarmer: "" } };
    expect(detectExerciseLevelFromSource([source("x.png", ["Basisextra"])], directoryConfig)).toEqual({ level: null, conflict: false });
    expect(detectExerciseLevelFromSource([source("x.png", ["Opwarmer"])], withEmpty)).toEqual({ level: null, conflict: false });
    expect(detectExerciseLevelFromSource([source("x.png", ["Basis", "Uitdaging"])], directoryConfig)).toEqual({ level: null, conflict: true });
  });

  it.each([
    ["PF2_Oef3_O.png", "opwarmer"],
    ["PF2_Oef4_B.png", "basis"],
    ["Oef5_U", "uitdaging"],
    ["Oef6_V", "verdieping"],
  ] as const)("recognizes suffix marker in %s", (name, level) => {
    const config = exerciseLevelRecognitionSchema.parse({
      method: "marker", source: { type: "exercise_resource", resourceId: "worked-solution" },
      convention: "suffix_code", prefix: "", mapping: { opwarmer: "O", basis: "B", uitdaging: "U", verdieping: "V" },
    });
    expect(detectExerciseLevelFromSource([source(name)], config)).toEqual({ level, conflict: false });
  });

  it.each([
    ["PF1_Oef2a_Niv1.png", "opwarmer"],
    ["PF1_Oef2b_Niv2.png", "basis"],
    ["Oef2c_Niv3", "uitdaging"],
    ["Oef2d_Niv4", "verdieping"],
  ] as const)("recognizes prefixed marker in %s", (name, level) => {
    const config = exerciseLevelRecognitionSchema.parse({
      method: "marker", source: { type: "exercise_directory" }, convention: "prefixed_code", prefix: "Niv",
      mapping: { opwarmer: "1", basis: "2", uitdaging: "3", verdieping: "4" },
    });
    expect(detectExerciseLevelFromSource([source(name)], config)).toEqual({ level, conflict: false });
  });

  it("rejects partial markers, reports multiple markers and validates duplicate configuration", () => {
    const input = {
      method: "marker", source: { type: "exercise_directory" }, convention: "suffix_code", prefix: "",
      mapping: { opwarmer: "O", basis: "B", uitdaging: "U", verdieping: "V" },
    } as const;
    const config = exerciseLevelRecognitionSchema.parse(input);
    expect(detectExerciseLevelFromSource([source("OefBeter")], config)).toEqual({ level: null, conflict: false });
    expect(detectExerciseLevelFromSource([source("Oef3_O_B")], config)).toEqual({ level: null, conflict: true });
    expect(() => exerciseLevelRecognitionSchema.parse({ ...input, mapping: { ...input.mapping, basis: "O" } })).toThrow("uniek");
  });

  it("keeps legacy profiles disabled and rejects a global resource as exercise-specific source", () => {
    const legacy = parseSourceProfileConfig({ configVersion: 1, scanner: { convention: "legacy_portfolio_v1" } });
    expect(legacy.levelRecognition).toEqual({ method: "none" });
    expect(() => parseSourceProfileConfig({
      ...legacy,
      levelRecognition: {
        method: "marker", source: { type: "exercise_resource", resourceId: "assignments" }, convention: "suffix_code", prefix: "",
        mapping: { opwarmer: "O", basis: "B", uitdaging: "U", verdieping: "V" },
      },
    })).toThrow("bestaand onderdeel per oefening");
  });
});
