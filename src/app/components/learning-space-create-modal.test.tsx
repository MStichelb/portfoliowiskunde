import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LearningSpaceCreateModal } from "./learning-space-create-modal";

describe("LearningSpaceCreateModal", () => {
  it("renders a compact trigger while closed", () => {
    const markup = renderToStaticMarkup(<LearningSpaceCreateModal action={() => undefined} subjects={subjects} />);

    expect(markup).toContain("Leeromgeving toevoegen");
    expect(markup).toContain("lucide-folder-plus");
    expect(markup).not.toContain('role="dialog"');
  });

  it("renders the four-step wizard and cancel action when open", () => {
    const markup = renderToStaticMarkup(<LearningSpaceCreateModal action={() => undefined} subjects={subjects} initialOpen />);

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('name="name"');
    expect(markup).toContain('name="slug"');
    expect(markup).toContain('name="shortLabel"');
    expect(markup).not.toContain('name="sortOrder"');
    expect(markup).not.toContain("Sortering");
    expect(markup).toContain('name="description"');
    expect(markup).toContain('name="cardColor"');
    expect(markup).toContain('name="subjectId"');
    expect(markup).toContain("Beschrijving");
    expect(markup).toContain('name="creationFlow" value="wizard"');
    expect(markup).toContain("Annuleren");
    expect(markup).toContain('data-step="4" hidden=""');
  });

  it("only top-aligns the wizard when the profile subeditor is open and preserves modal margins", async () => {
    const css = await readFile(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain('.confirm-backdrop:has(.learning-space-create-form[data-profile-editor-open="true"]) { align-items: start;');
    expect(css).toContain("padding-top: clamp(24px, 5vh, 48px)");
    expect(css).toContain("max-height: calc(100dvh - 36px)");
    expect(css).toContain('width: fit-content');
    expect(css).toContain('min-width: min(800px, calc(100vw - 48px))');
    expect(css).toContain('max-width: min(1100px, calc(100vw - 48px))');
    expect(css).toContain('.learning-space-create-dialog:has(.learning-space-create-form[data-profile-editor-open="true"])');
    expect(css).toContain("width: min(880px, 100%)");
    const markup = renderToStaticMarkup(<LearningSpaceCreateModal action={() => undefined} subjects={subjects} initialOpen />);
    expect(markup).not.toContain('data-profile-editor-open="true"');
  });
  it("keeps a validation error visible inside the open modal", () => {
    const markup = renderToStaticMarkup(<LearningSpaceCreateModal action={() => undefined} subjects={subjects} initialOpen error="Controleer de ingevulde gegevens." />);

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Controleer de ingevulde gegevens.");
  });
});

const subjects = [
  { id: "subject-wiskunde", name: "Wiskunde", sortOrder: 10, isActive: true, usageCount: 0, createdAt: "2026-09-26T00:00:00.000Z", updatedAt: "2026-09-26T00:00:00.000Z" },
];
