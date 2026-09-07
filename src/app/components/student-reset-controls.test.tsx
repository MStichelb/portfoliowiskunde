import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudentResetControls } from "./student-reset-controls";

describe("StudentResetControls", () => {
  it("houdt de destructieve bulkacties standaard ingeklapt", () => {
    const markup = renderToStaticMarkup(<StudentResetControls
      classes={[{ id: "class-5", label: "5WIS", studentCount: 12 }]}
      totalStudents={31}
      resetClassAction={() => undefined}
      resetAllAction={() => undefined}
    />);
    expect(markup).toContain("Leerlingen verwijderen");
    expect(markup).toContain("aria-expanded=\"false\"");
    expect(markup).not.toContain("Te verwijderen klas");
    expect(markup).not.toContain("Klas verwijderen");
    expect(markup).not.toContain("Alle leerlingen verwijderen");
  });

  it("toont na openen de bestaande klas- en totaalacties", () => {
    const markup = renderToStaticMarkup(<StudentResetControls
      classes={[{ id: "class-5", label: "5WIS", studentCount: 12 }]}
      totalStudents={31}
      resetClassAction={() => undefined}
      resetAllAction={() => undefined}
      initiallyOpen
    />);
    expect(markup).toContain("aria-expanded=\"true\"");
    expect(markup).toContain("Te verwijderen klas");
    expect(markup).toContain("5WIS (12)");
    expect(markup).toContain("aria-label=\"Leerlingen uit deze klas verwijderen?\"");
    expect(markup).toContain("aria-label=\"Alle leerlingen verwijderen?\"");
    expect(markup).toContain("Klas verwijderen");
    expect(markup).toContain("Alle leerlingen verwijderen");
  });

  it("schakelt klas- en bulkreset uit wanneer er geen leerlingen zijn", () => {
    const markup = renderToStaticMarkup(<StudentResetControls classes={[]} totalStudents={0} resetClassAction={() => undefined} resetAllAction={() => undefined} initiallyOpen />);
    expect(markup.match(/disabled=\"\"/g)).toHaveLength(2);
  });
});
