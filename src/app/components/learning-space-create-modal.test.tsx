import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LearningSpaceCreateModal } from "./learning-space-create-modal";

describe("LearningSpaceCreateModal", () => {
  it("renders a compact trigger while closed", () => {
    const markup = renderToStaticMarkup(<LearningSpaceCreateModal action={() => undefined} />);

    expect(markup).toContain("Leeromgeving toevoegen");
    expect(markup).toContain("lucide-folder-plus");
    expect(markup).not.toContain('role="dialog"');
  });

  it("renders the existing general create form and cancel action when open", () => {
    const markup = renderToStaticMarkup(<LearningSpaceCreateModal action={() => undefined} initialOpen />);

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('name="name"');
    expect(markup).toContain('name="slug"');
    expect(markup).toContain('name="shortLabel"');
    expect(markup).toContain('name="sortOrder"');
    expect(markup).toContain('name="description"');
    expect(markup).toContain('name="cardColor"');
    expect(markup).toContain("Omschrijving");
    expect(markup).toContain('name="returnTo" value="admin"');
    expect(markup).toContain("Annuleren");
    expect(markup).not.toContain('name="sourceType"');
  });

  it("keeps a validation error visible inside the open modal", () => {
    const markup = renderToStaticMarkup(<LearningSpaceCreateModal action={() => undefined} initialOpen error="Controleer de ingevulde gegevens." />);

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Controleer de ingevulde gegevens.");
  });
});
