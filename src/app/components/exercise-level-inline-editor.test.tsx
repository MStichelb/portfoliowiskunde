import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_EXERCISE_LEVEL_PRESENTATION } from "@/lib/exercise-level-presentation";

import { ExerciseLevelInlineEditor } from "./exercise-level-inline-editor";

describe("ExerciseLevelInlineEditor", () => {
  it("renders an anchored native popover with immediate accessible choices", () => {
    const presentation = {
      ...DEFAULT_EXERCISE_LEVEL_PRESENTATION,
      basis: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.basis, displayName: "Kern", color: "#ABCDEF" },
      uitdaging: { ...DEFAULT_EXERCISE_LEVEL_PRESENTATION.uitdaging, displayName: "Plus", symbolId: "large_circle" as const, count: 3, color: "#123456" },
    };
    const markup = renderToStaticMarkup(<ExerciseLevelInlineEditor
      exerciseId="exercise-1"
      learningSpaceId="space-5"
      levelSource="basis"
      levelOverrideMode="level"
      levelOverride="uitdaging"
      effectiveLevel="uitdaging"
      presentation={presentation}
      action={vi.fn()}
    />);

    expect(markup).toContain('popover="auto"');
    expect(markup).toContain('role="menu"');
    expect(markup).toContain('aria-haspopup="menu"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('value="inherit" role="menuitemradio"');
    expect(markup).toContain('value="none" role="menuitemradio"');
    expect(markup).toContain('value="level:uitdaging" role="menuitemradio" aria-checked="true" name="levelChoice"');
    expect(markup).toContain("Kern");
    expect(markup).toContain("Plus");
    expect(markup).toContain("Bronniveau: Kern");
    expect(markup).toContain("Handmatig ingesteld voor deze oefening.");
    expect(markup).toContain('aria-label="Handmatig ingesteld"');
    expect(markup.match(/background-color:#D0D6DD;color:#123456/g)).toHaveLength(2);
    expect(markup.match(/⬤⬤⬤/g)).toHaveLength(2);
  });

  it("shows automatic source context without a manual indicator", () => {
    const markup = renderToStaticMarkup(<ExerciseLevelInlineEditor
      exerciseId="exercise-2"
      learningSpaceId="space-5"
      levelSource={null}
      levelOverrideMode="inherit"
      levelOverride={null}
      effectiveLevel={null}
      action={vi.fn()}
    />);

    expect(markup).toContain("Nog geen niveau herkend");
    expect(markup).toContain("Automatisch overgenomen van de bron.");
    expect(markup).not.toContain('aria-label="Handmatig ingesteld"');
    expect(markup).toContain('value="inherit" role="menuitemradio" aria-checked="true"');
  });
});
