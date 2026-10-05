import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PortfolioStructureInfo } from "./portfolio-structure-info";
import styles from "./portfolio-resource-admin.module.css";
import { BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG, type SourceProfileConfig } from "@/lib/source-profile-config";
import { exerciseResourceRuleLabel } from "@/lib/source-profile-recognition-labels";

describe("portfolio source recognition info", () => {
  it("uses the document dialog styling, linking and close pattern with configured terminology", () => {
    const markup = renderInfo(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
    expect(markup).toContain(`class="${styles.infoButton}"`);
    expect(markup).toContain(`class="${styles.modalTarget}" role="dialog"`);
    expect(markup).toContain(`class="${styles.modalBackdrop}"`);
    expect(markup).toContain('href="#portfolio-exercises-rules-portfolio--1"');
    expect(markup).toContain('id="portfolio-exercises-rules-portfolio--1"');
    expect(markup).toContain('aria-label="Sluiten"');
    expect(markup).toContain("Herkenningsregels voor opgaven bekijken");
    expect(markup).toContain(`class="${styles.ruleItem}"`);
    expect(markup).toContain("Nummer staat na tekst “Oef”");
    expect(markup).toContain("Herkenning in");
    expect(markup).toContain("Standaard / overige bestanden");
    expect(markup).toContain("Alternatieve uitwerking");
    expect(markup).toContain("PDF · PNG · JPG · JPEG");
    expect(markup).toContain("Een opgave kan rechtstreeks in een bundel staan of in een onderdeel.");
    expect(markup).toContain("Alle bestanden van één opgave moeten samen in dezelfde bundelmap of hetzelfde onderdeel staan.");
    expect(markup).not.toMatch(/\bscanner\b|\breconciliation\b|\bsection_id\b/);
  });

  it("explains an active code at the start of a file name", () => {
    const profile = structuredClone(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
    profile.scanner.exercise.exerciseMode = "files";
    profile.scanner.exercise.numberLocation = "start";
    const markup = renderInfo(profile);
    expect(markup).toContain("Bestand begint met nummer");
    expect(markup).not.toContain("Nummer staat na tekst");
  });

  it.each(["files", "directories", "files_and_directories"] as const)("shows only active configured rules in %s mode", (mode: SourceProfileConfig["scanner"]["exercise"]["exerciseMode"]) => {
    const profile = structuredClone(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
    profile.scanner.exercise = { ...profile.scanner.exercise, exerciseMode: mode, numberLocation: "after_text", marker: "Vraag" };
    const resource = profile.exerciseResources[0];
    resource.label = "Antwoord";
    resource.recognition.file = { target: "after_exercise_number", operator: "starts_with", value: "-antwoord", caseSensitive: false };
    resource.recognition.directory = { target: "file_name", operator: "ends_with", value: "model", caseSensitive: true };
    resource.recognition.fileExtensions = ["pdf"];
    resource.location = { scope: "subdirectory", subdirectory: "Antwoorden" };
    profile.exerciseResources.push({ ...structuredClone(resource), id: "directory-only", label: "Alleen mappen", order: 99, recognition: { ...resource.recognition, file: null } });
    const markup = renderInfo(profile);
    expect(markup).toContain("Antwoord");
    expect(markup).toContain("Nummer staat na tekst “Vraag”");
    expect(markup).toContain("Bestandstypes</dt><dd>PDF</dd>");
    expect(markup).toContain("Antwoorden”</dd>");
    expect(markup).toContain("Locatie</dt>");
    if (mode !== "directories") {
      expect(markup).toContain("Tekst na opgavenummer begint met “-antwoord”");
      expect(markup).toContain("Niet hoofdlettergevoelig");
    } else expect(markup).not.toContain("-antwoord");
    if (mode !== "files") {
      expect(markup).toContain("Bestandsnaam eindigt op “model”");
      expect(markup).toContain("Hoofdlettergevoelig");
      expect(markup).toContain("Alleen mappen");
    } else {
      expect(markup).not.toContain("“model”");
      expect(markup).not.toContain("Alleen mappen");
    }
    expect(markup).not.toMatch(/\bsuffix\b|\bprefix\b|\bmarker\b|\bregex\b|\bscanner\b|after_exercise_number|starts_with/);
    expect(exerciseResourceRuleLabel(profile.exerciseResources[0].recognition.file!, "opgave")).toBe("Tekst na opgavenummer begint met “-antwoord”");
  });

  it("merges equal case metadata and renders duplicate labels without duplicate React keys", () => {
    const profile = structuredClone(BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG);
    const duplicateKeyWarning = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const equalMarkup = renderInfo(profile);
      expect((equalMarkup.match(/>Hoofdletters<\/dt>/g) ?? [])).toHaveLength(1);
      expect(duplicateKeyWarning).not.toHaveBeenCalled();

      profile.exerciseResources[1].recognition.directory!.caseSensitive = true;
      const differentMarkup = renderInfo(profile);
      expect(differentMarkup).toContain("Hoofdletters (bestand)");
      expect(differentMarkup).toContain("Hoofdletters (map)");
      expect(duplicateKeyWarning).not.toHaveBeenCalled();
    } finally {
      duplicateKeyWarning.mockRestore();
    }
  });
});

describe("portfolio sections info", () => {
  it("shows the supported folder code shape and the existing removal lifecycle", () => {
    const markup = renderToStaticMarkup(<PortfolioStructureInfo portfolioId="portfolio-1" kind="sections" collectionLabel="bundel" exerciseLabelSingular="opgave" exerciseLabelPlural="opgaven" sourceProfile={BUILT_IN_DEFAULT_SOURCE_PROFILE_CONFIG} />);
    expect(markup).toContain(`class="${styles.ruleItem}"`);
    expect(markup).toContain("Mapnaam begint met een cijfercode");
    expect(markup).toContain("1.2");
    expect(markup).toContain("De tekst na de code vormt de naam.");
    expect(markup).toContain("Mappen die niet meer in de bron staan, verdwijnen na synchronisatie uit de actuele structuur.");
  });
});

function renderInfo(sourceProfile: SourceProfileConfig) {
  return renderToStaticMarkup(<PortfolioStructureInfo portfolioId="portfolio /1" kind="exercises" collectionLabel="bundel" exerciseLabelSingular="opgave" exerciseLabelPlural="opgaven" sourceProfile={sourceProfile} />);
}
