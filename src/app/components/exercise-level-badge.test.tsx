import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DEFAULT_EXERCISE_LEVEL_PRESENTATION } from "@/lib/exercise-level-presentation";

import { ExerciseLevelBadge } from "./exercise-level-badge";

describe("ExerciseLevelBadge", () => {
  it.each([
    ["opwarmer", "★", "exercise-level-opwarmer", "Opwarmer"],
    ["basis", "★★", "exercise-level-basis", "Basis"],
    ["uitdaging", "★★★", "exercise-level-uitdaging", "Uitdaging"],
    ["verdieping", "◆", "exercise-level-verdieping", "Verdieping"],
  ] as const)("renders the default presentation for %s", (level, symbols, colorClass, label) => {
    const markup = renderToStaticMarkup(<ExerciseLevelBadge level={level} presentation={DEFAULT_EXERCISE_LEVEL_PRESENTATION} />);
    expect(markup).toContain(symbols);
    expect(markup).toContain(colorClass);
    expect(markup).toContain(`aria-label="${label}"`);
    expect(markup).toContain(`title="${label}"`);
  });

  it("renders normal and large circle configurations through the central mapping", () => {
    const presentation = {
      opwarmer: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.opwarmer, symbolId: "circle" as const },
      basis: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.basis, symbolId: "circle" as const },
      uitdaging: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.uitdaging, symbolId: "circle" as const },
      verdieping: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.verdieping, symbolId: "large_circle" as const, count: 4 },
    };
    expect(renderToStaticMarkup(<ExerciseLevelBadge level="uitdaging" presentation={presentation} />)).toContain("●●●");
    expect(renderToStaticMarkup(<ExerciseLevelBadge level="verdieping" presentation={presentation} />)).toContain("⬤⬤⬤⬤");
  });

  it("uses the configured name and color accessibly", () => {
    const presentation = {
      ...DEFAULT_EXERCISE_LEVEL_PRESENTATION,
      basis: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.basis, displayName: "Kern", color: "#123456" },
    };
    const markup = renderToStaticMarkup(<ExerciseLevelBadge level="basis" presentation={presentation} />);
    expect(markup).toContain('aria-label="Kern"');
    expect(markup).toContain('title="Kern"');
    expect(markup).toContain("background-color:#D0D6DD");
    expect(markup).toContain("color:#123456");
  });

  it("keeps admin pills and lets public rendering opt into the background per level", () => {
    const presentation = {
      ...DEFAULT_EXERCISE_LEVEL_PRESENTATION,
      basis: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.basis, showPublicBackground: true },
    };
    const admin = renderToStaticMarkup(<ExerciseLevelBadge level="opwarmer" presentation={presentation} context="admin" />);
    const publicWithoutBackground = renderToStaticMarkup(<ExerciseLevelBadge level="opwarmer" presentation={presentation} context="public" />);
    const publicWithBackground = renderToStaticMarkup(<ExerciseLevelBadge level="basis" presentation={presentation} context="public" />);

    expect(admin).toContain("background-color:");
    expect(admin).not.toContain("exercise-level-badge-symbol-only");
    expect(publicWithoutBackground).not.toContain("background-color:");
    expect(publicWithoutBackground).toContain("exercise-level-badge-symbol-only");
    expect(publicWithBackground).toContain("background-color:");
    expect(publicWithBackground).not.toContain("exercise-level-badge-symbol-only");
  });

  it("keeps a null level neutral and accessible", () => {
    const markup = renderToStaticMarkup(<ExerciseLevelBadge level={null} />);
    expect(markup).toContain("—");
    expect(markup).toContain("exercise-level-none");
    expect(markup).toContain('aria-label="Geen niveau"');
  });
});
