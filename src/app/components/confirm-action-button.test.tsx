import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ConfirmActionButton } from "./confirm-action-button";

describe("ConfirmActionButton", () => {
  it("lijnt annuleren en verwijderen samen uit in de modalfooter", () => {
    const markup = renderToStaticMarkup(<ConfirmActionButton
      action={() => undefined}
      label="Open"
      confirmTitle="Gebruiker verwijderen?"
      confirmText="Deze gebruiker wordt verwijderd."
      initiallyOpen
    />);

    const footer = markup.match(/<div class="confirm-dialog-actions">[\s\S]*?<\/div>/)?.[0] ?? "";
    expect(footer).toContain("class=\"secondary-button\"");
    expect(footer).toContain("Annuleren");
    expect(footer).toContain("class=\"confirm-dialog-action-form\"");
    expect(footer).toContain("class=\"danger-button\"");
    expect(footer).toContain("Verwijderen");
  });
});
