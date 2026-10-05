import { Folder } from "lucide-react";

import { PortfolioInfoButton, PortfolioInfoDialog, RecognitionRuleCard } from "./portfolio-info-dialog";
import { portfolioStructureRulesDialogId } from "./portfolio-resource-dialog-ids";
import { DEFAULT_SECTION_LABEL_PLURAL, DEFAULT_SECTION_LABEL_SINGULAR, formatTerminologyLabel } from "@/lib/collection-terminology";
import { exerciseModeContextLabel, exerciseNumberRuleLabel, exerciseResourceLocationLabel, exerciseResourceRuleLabel } from "@/lib/source-profile-recognition-labels";
import type { SourceProfileConfig } from "@/lib/source-profile-config";
import styles from "./portfolio-resource-admin.module.css";

export function PortfolioStructureInfo({ portfolioId, kind, collectionLabel, exerciseLabelSingular, exerciseLabelPlural, sectionLabelSingular = DEFAULT_SECTION_LABEL_SINGULAR, sectionLabelPlural = DEFAULT_SECTION_LABEL_PLURAL, sourceProfile }: {
  portfolioId: string;
  kind: "sections" | "exercises";
  collectionLabel: string;
  exerciseLabelSingular: string;
  exerciseLabelPlural: string;
  sectionLabelSingular?: string;
  sectionLabelPlural?: string;
  sourceProfile: SourceProfileConfig;
}) {
  const dialogId = portfolioStructureRulesDialogId(portfolioId, kind);
  const sectionLabel = formatTerminologyLabel(sectionLabelSingular, "inline");
  const label = kind === "sections" ? formatTerminologyLabel(sectionLabelPlural, "inline") : exerciseLabelPlural;
  return <>
    <PortfolioInfoButton dialogId={dialogId} label={`Herkenningsregels voor ${label} bekijken`} />
    <PortfolioInfoDialog dialogId={dialogId} title={`Herkenning van ${label}`}>
      {kind === "sections" ? <>
        <div className={styles.rulesList}>
          <RecognitionRuleCard title={formatTerminologyLabel(sectionLabelSingular, "standalone")} iconNode={<Folder size={17} aria-hidden />} rows={[
            { id: "code", label: "Code", value: "Mapnaam begint met een cijfercode (bijvoorbeeld 1, 1.2 of 1.10)" },
            { id: "name", label: "Naam", value: "De tekst na de code vormt de naam." },
            { id: "context", label: "Herkenning in", value: "Map" },
          ]} />
        </div>
        <p>Mappen die niet meer in de bron staan, verdwijnen na synchronisatie uit de actuele structuur.</p>
      </> : <>
        <ExerciseRecognitionCards profile={sourceProfile} exerciseLabel={exerciseLabelSingular} />
        <p>Een {exerciseLabelSingular} kan rechtstreeks in een {collectionLabel} staan of in een {sectionLabel}.</p>
        <p>Alle bestanden van één {exerciseLabelSingular} moeten samen binnen één {collectionLabel} of één {sectionLabel} staan.</p>
      </>}
    </PortfolioInfoDialog>
  </>;
}

function ExerciseRecognitionCards({ profile, exerciseLabel }: { profile: SourceProfileConfig; exerciseLabel: string }) {
  const identity = profile.scanner.exercise;
  const files = identity.exerciseMode !== "directories";
  const directories = identity.exerciseMode !== "files";
  const resources = [...profile.exerciseResources].sort((a, b) => a.order - b.order)
    .filter((resource) => (files && resource.recognition.file) || (directories && resource.recognition.directory));
  return <div className={styles.rulesList}>
    <RecognitionRuleCard title={formatTerminologyLabel(exerciseLabel, "standalone")} rows={[
      { id: "number", label: "Nummer", value: exerciseNumberRuleLabel(identity) },
      { id: "context", label: "Herkenning in", value: exerciseModeContextLabel(identity.exerciseMode) },
    ]} />
    {resources.map((resource) => {
      const fileRule = files ? resource.recognition.file : null;
      const directoryRule = directories ? resource.recognition.directory : null;
      const fileCase = fileRule && fileRule.target !== "fallback" ? fileRule.caseSensitive : undefined;
      const directoryCase = directoryRule && directoryRule.target !== "fallback" ? directoryRule.caseSensitive : undefined;
      const caseRows = fileCase !== undefined && directoryCase !== undefined
        ? fileCase === directoryCase
          ? [{ id: "case-sensitivity", label: "Hoofdletters", value: caseLabel(fileCase) }]
          : [{ id: "file-case-sensitivity", label: "Hoofdletters (bestand)", value: caseLabel(fileCase) }, { id: "directory-case-sensitivity", label: "Hoofdletters (map)", value: caseLabel(directoryCase) }]
        : fileCase !== undefined || directoryCase !== undefined
          ? [{ id: "case-sensitivity", label: "Hoofdletters", value: caseLabel(fileCase ?? directoryCase!) }]
          : [];
      return <RecognitionRuleCard key={resource.id} title={resource.label} icon={resource.icon} rows={[
        ...(fileRule ? [{ id: "file-rule", label: "Bestand", value: exerciseResourceRuleLabel(fileRule, exerciseLabel) }] : []),
        ...(directoryRule ? [{ id: "directory-rule", label: "Map", value: exerciseResourceRuleLabel(directoryRule, exerciseLabel) }] : []),
        ...caseRows,
        ...(resource.recognition.fileExtensions.length ? [{ id: "file-types", label: "Bestandstypes", value: resource.recognition.fileExtensions.map((extension) => extension.toUpperCase()).join(" · ") }] : []),
        { id: "location", label: "Locatie", value: exerciseResourceLocationLabel(resource.location, identity.exerciseMode, exerciseLabel) },
      ]} />;
    })}
  </div>;
}

function caseLabel(caseSensitive: boolean): string {
  return caseSensitive ? "Hoofdlettergevoelig" : "Niet hoofdlettergevoelig";
}
