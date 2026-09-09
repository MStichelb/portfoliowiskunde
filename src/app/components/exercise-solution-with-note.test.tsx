import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ExerciseSolutionWithNote } from "./exercise-solution-with-note";

describe("ExerciseSolutionWithNote", () => {
  it("renders no note when no content exists", () => {
    const markup = render(null, "above_solution");
    expect(markup).not.toContain("exercise-note");
    expect(markup).toContain("Volledige uitwerking");
  });

  it("places one note above the complete solution", () => {
    const markup = render("Denk hieraan.", "above_solution");
    expect(markup.indexOf("Denk hieraan.")).toBeLessThan(markup.indexOf("Volledige uitwerking"));
    expect(markup.match(/class="exercise-note"/g)).toHaveLength(1);
  });

  it("places one note below the complete solution", () => {
    const markup = render("Denk hieraan.", "below_solution");
    expect(markup.indexOf("Denk hieraan.")).toBeGreaterThan(markup.indexOf("Alternatieve uitwerking"));
    expect(markup.match(/class="exercise-note"/g)).toHaveLength(1);
  });

  it("renders multiline content as escaped plain text", () => {
    const markup = render("Eerste regel\n<strong>Tweede regel</strong>", "above_solution");
    expect(markup).toContain("Eerste regel\n&lt;strong&gt;Tweede regel&lt;/strong&gt;");
    expect(markup).not.toContain("<strong>Tweede regel</strong>");
  });
});

function render(customNote: string | null, notePosition: "above_solution" | "below_solution") {
  return renderToStaticMarkup(<ExerciseSolutionWithNote customNote={customNote} notePosition={notePosition}>
    <section>Volledige uitwerking</section><section>Alternatieve uitwerking</section>
  </ExerciseSolutionWithNote>);
}
