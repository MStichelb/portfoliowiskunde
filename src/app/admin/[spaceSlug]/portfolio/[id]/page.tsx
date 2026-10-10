import { ExerciseNoteFeedback } from "@/app/components/flash-toast";
import { notFound } from "next/navigation";

import { AdminSpaceHeader } from "@/app/components/admin-space-header";
import { ExerciseBulkTable } from "@/app/components/exercise-bulk-table";
import { PortfolioDocumentLinks } from "@/app/components/portfolio-document-links";
import { PortfolioExternalLinksForm } from "@/app/components/portfolio-external-links-form";
import { PortfolioPublicationForm } from "@/app/components/portfolio-publication-form";
import { PortfolioStructureInfo } from "@/app/components/portfolio-structure-info";
import { PublicationStatus } from "@/app/components/publication-status";
import { SectionPublicationForm } from "@/app/components/section-publication-form";
import { requireAdminUser } from "@/lib/auth";
import { canManageLearningSpace } from "@/lib/authorization";
import { formatTerminologyLabel, getLearningSpaceTerminology, learningSpaceTerminologyLabel, miscellaneousCollectionLabel } from "@/lib/collection-terminology";
import { formatBrusselsDateTimeInput } from "@/lib/publication";
import { getAdminLearningSpaceBySlug, getAdminPortfolio, getPortfolioWarnings, getThemes } from "@/lib/repositories";
import { formatSectionLabel } from "@/lib/section-label";
import { getActiveSourceProfileConfigForLearningSpace } from "@/lib/source-profiles";

import { savePortfolioAction, savePortfolioExternalLinksAction, saveSectionPublicationAction } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function LearningSpacePortfolioAdminPage({ params }: { params: Promise<{ spaceSlug: string; id: string }> }) {
  const user = await requireAdminUser();
  const { spaceSlug, id } = await params;
  const space = await getAdminLearningSpaceBySlug(spaceSlug);
  if (!space || !await canManageLearningSpace(user, space.id)) notFound();
  const [portfolio, warnings, themes, sourceProfile] = await Promise.all([getAdminPortfolio(id, space.id), getPortfolioWarnings(id, space.id), getThemes(space.id), getActiveSourceProfileConfigForLearningSpace(space.id)]);
  if (!portfolio) notFound();
  const terminology = getLearningSpaceTerminology(space);
  const collectionLabel = formatTerminologyLabel(space.collectionLabelSingular, "standalone");
  const exerciseLabelPlural = formatTerminologyLabel(space.exerciseLabelPlural, "standalone");
  const structureInfo = (kind: "sections" | "exercises") => <PortfolioStructureInfo portfolioId={portfolio.id} kind={kind} collectionLabel={formatTerminologyLabel(space.collectionLabelSingular, "inline")} exerciseLabelSingular={formatTerminologyLabel(space.exerciseLabelSingular, "inline")} exerciseLabelPlural={formatTerminologyLabel(space.exerciseLabelPlural, "inline")} sectionLabelSingular={terminology.section.singular} sectionLabelPlural={terminology.section.plural} sourceProfile={sourceProfile} />;
  const exerciseRow = (exercise: NonNullable<typeof portfolio.exercises>[number]) => ({ id: exercise.id, code: exercise.code, levelSource: exercise.levelSource, levelOverrideMode: exercise.levelOverrideMode, levelOverride: exercise.levelOverride, effectiveLevel: exercise.effectiveLevel, configuredVisible: exercise.visibilityMode === "visible", status: exercise.effectiveStatus, standardAssets: exercise.standardAssets, alternativeAssets: exercise.alternativeAssets, missingAssets: exercise.missingAssets, showAlternativeToStudents: exercise.showAlternativeToStudents, isIndexed: exercise.isIndexed, noteLabel: exercise.noteLabel, customNote: exercise.customNote, notePosition: exercise.notePosition });
  return <main className="page-shell admin-page admin-space-page portfolio-admin-page">
    <ExerciseNoteFeedback /><AdminSpaceHeader current={space} section="portfolios" user={user} />
    <header className="portfolio-detail-heading"><p className="eyebrow">{collectionLabel} {portfolio.code}</p><h2>{portfolio.title}</h2><p className="file-reference">Naam van de map: {portfolio.detectedTitle}</p></header>
    <section className="admin-card"><div className="card-heading"><h2>Instellingen {collectionLabel.toLocaleLowerCase("nl-BE")}</h2><PublicationStatus status={portfolio.effectiveStatus} /></div><PortfolioPublicationForm id={portfolio.id} title={portfolio.title} cardColor={portfolio.cardColor} visible={portfolio.visible} limited={portfolio.limited} publishFrom={formatBrusselsDateTimeInput(portfolio.publishFrom)} publishUntil={formatBrusselsDateTimeInput(portfolio.publishUntil)} customText={portfolio.customText} customTextPosition={portfolio.customTextPosition} themeId={portfolio.themeId} themeMode={sourceProfile.scanner.portfolio.themeMode} collectionLabel={formatTerminologyLabel(space.collectionLabelSingular, "inline")} themeLabelSingular={terminology.theme.singular} themes={themes} miscellaneousLabel={miscellaneousCollectionLabel(space.collectionLabelPlural)} action={savePortfolioAction} /></section>
    <section className="admin-card"><h2>Documenten</h2><PortfolioDocumentLinks portfolioId={portfolio.id} spaceSlug={space.slug} resources={portfolio.globalResources} admin /><PortfolioExternalLinksForm portfolioId={portfolio.id} resources={portfolio.globalResources} action={savePortfolioExternalLinksAction} /></section>
    {portfolio.sections.length > 0 ? <section className="admin-card"><h2>{learningSpaceTerminologyLabel(space, "section", "plural")}</h2>{structureInfo("sections")}<div className="section-card-list">{portfolio.sections.map((section) => <details className="section-settings-card" key={section.id}><summary className="section-card-title"><span><strong>{formatSectionLabel(section.code, section.title)}</strong><small>{section.exercises.length} {formatTerminologyLabel(space.exerciseLabelPlural, "inline")}</small></span><PublicationStatus status={section.effectiveStatus} /></summary><SectionPublicationForm id={section.id} portfolioId={portfolio.id} visible={section.visibilityMode === "visible"} limited={section.limited} publishFrom={formatBrusselsDateTimeInput(section.publishFrom)} publishUntil={formatBrusselsDateTimeInput(section.publishUntil)} sectionLabelSingular={terminology.section.singular} action={saveSectionPublicationAction} /></details>)}</div></section> : null}
    <section className="admin-card exercises-card"><h2>{exerciseLabelPlural}</h2>{structureInfo("exercises")}<ExerciseBulkTable portfolioId={portfolio.id} learningSpaceId={space.id} levelPresentation={space.levelPresentation} spaceSlug={space.slug} exerciseLabelSingular={space.exerciseLabelSingular} exerciseLabelPlural={space.exerciseLabelPlural} sectionLabelSingular={terminology.section.singular} exercises={(portfolio.exercises ?? []).map(exerciseRow)} sections={portfolio.sections.map((section) => ({ id: section.id, code: section.code, title: section.title, exercises: section.exercises.map(exerciseRow) }))} /></section>
    <section className="admin-card portfolio-warnings" aria-labelledby="portfolio-warnings-title"><h2 id="portfolio-warnings-title">Synchronisatiewaarschuwingen ({warnings.length})</h2>{warnings.length === 0 ? <p className="empty-state">Geen waarschuwingen in de laatste geslaagde synchronisatie.</p> : <ul>{warnings.map((warning, index) => <li key={`${warning.relativePath}-${index}`}>{warning.message}<span className="file-reference">{warning.relativePath}</span></li>)}</ul>}</section>
  </main>;
}
