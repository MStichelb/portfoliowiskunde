import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudentResetControls } from "./student-reset-controls";

describe("StudentResetControls", () => {
  it("toont afzonderlijke bevestigingsacties met klas- en totaalaantallen", () => {
    const markup = renderToStaticMarkup(<StudentResetControls
      classes={[{ id: "class-5", label: "5WIS", studentCount: 12 }]}
      totalStudents={31}
      resetClassAction={() => undefined}
      resetAllAction={() => undefined}
    />);
    expect(markup).toContain("5WIS (12)");
    expect(markup).toContain("aria-label=\"Leerlingen uit deze klas verwijderen?\"");
    expect(markup).toContain("aria-label=\"Alle leerlingen verwijderen?\"");
    expect(markup).toContain("Klas verwijderen");
    expect(markup).toContain("Alle leerlingen verwijderen");
  });

  it("schakelt klas- en bulkreset uit wanneer er geen leerlingen zijn", () => {
    const markup = renderToStaticMarkup(<StudentResetControls classes={[]} totalStudents={0} resetClassAction={() => undefined} resetAllAction={() => undefined} />);
    expect(markup.match(/disabled=\"\"/g)).toHaveLength(2);
  });
});
