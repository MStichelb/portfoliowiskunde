import type { CSSProperties } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { PortfolioDocumentsWithMessage } from "@/app/components/portfolio-documents-with-message";
import { PortfolioErrorReportForm } from "@/app/components/portfolio-error-report-form";
import { ExerciseLevelBadge } from "@/app/components/exercise-level-badge";
import { listErrorReportExerciseIdentities } from "@/lib/error-report-exercise-code";
import { isNextPrefetchRequest, preparePublicIndex } from "@/lib/public-index";
import { requirePublicLearningSpaceAccess } from "@/lib/learning-space-access";
import { getLearningSpaceBySlug, getStudentPortfolio, type ErrorReportDocumentKind } from "@/lib/repositories";
import { DEFAULT_EXERCISE_LABEL_SHORT, formatExerciseShortLabel, formatTerminologyLabel } from "@/lib/collection-terminology";

export const dynamic = "force-dynamic";

export default async function LearningSpacePortfolioPage({ params }: { params: Promise<{ spaceSlug: string; id: string }> }) {
  const { spaceSlug, id } = await params;
  const space = await getLearningSpaceBySlug(spaceSlug);
  if (!space || !space.isActive) notFound();
  const user = await requirePublicLearningSpaceAccess(space.id, `/${encodeURIComponent(space.slug)}/portfolio/${encodeURIComponent(id)}`);
  await preparePublicIndex(space.id, { isPrefetch: isNextPrefetchRequest(await headers()) });
  const portfolio = await getStudentPortfolio(id, space.id);
  if (!portfolio) notFound();
  const documents: ErrorReportDocumentKind[] = portfolio.globalResources.flatMap((resource) => {
    if (resource.kind !== "source_file" || !resource.available || !resource.documentKind) return [];
    return [resource.documentKind === "final-solutions" ? "final_solutions" : resource.documentKind];
  });
  const reportExercises = listErrorReportExerciseIdentities(portfolio.sections);
  const themePrefix = portfolio.themeName ? `${portfolio.themeName} • ` : "";
  const collectionLabel = formatTerminologyLabel(space.collectionLabelSingular, "standalone");
  const allExercises = portfolio.sections.flatMap((section) => section.exercises);
  const maxExerciseCodeLength = Math.max(1, ...allExercises.map((exercise) => Array.from(exercise.code).length));
  const maxSymbolCount = space.levelPresentation
    ? Math.max(0, ...Object.values(space.levelPresentation).map((item) => item.count))
    : 0;
  const exerciseLabelShort = space.exerciseLabelShort ?? DEFAULT_EXERCISE_LABEL_SHORT;
  const shortLabelLength = Array.from(exerciseLabelShort.trim()).length;
  const estimatedCardWidthCh = Math.ceil(4 + shortLabelLength + maxExerciseCodeLength + (maxSymbolCount * 1.75));
  const exerciseCardWidthCh = Math.min(26, Math.max(11, estimatedCardWidthCh));
  const exerciseGridStyle = { "--exercise-card-width": `${exerciseCardWidthCh}ch` } as CSSProperties;
  return <main className="page-shell student-page"><header className="page-header"><p className="eyebrow">{themePrefix}{collectionLabel} {portfolio.code}</p><h1>{portfolio.title}</h1><PortfolioDocumentsWithMessage portfolioId={portfolio.id} spaceSlug={space.slug} resources={portfolio.globalResources} customText={portfolio.customText} customTextPosition={portfolio.customTextPosition} /></header>{portfolio.sections.map((section) => <section className="section" key={section.id}><h2>{section.order}. {section.title}</h2><ol className="exercise-grid" style={exerciseGridStyle}>{section.exercises.map((exercise) => { const compactExerciseLabel = formatExerciseShortLabel(exerciseLabelShort, exercise.code); return <li key={exercise.id}>{exercise.visible ? <Link href={`/${encodeURIComponent(space.slug)}/oefening/${encodeURIComponent(exercise.id)}`} className="exercise-link">{exercise.effectiveLevel ? <ExerciseLevelBadge level={exercise.effectiveLevel} presentation={space.levelPresentation} context="public" /> : null}<span>{compactExerciseLabel}</span></Link> : <span className="exercise-hidden">{compactExerciseLabel}<small>Niet beschikbaar</small></span>}</li>; })}</ol></section>)}{user ? <PortfolioErrorReportForm portfolioId={portfolio.id} documents={documents} exercises={reportExercises} exerciseLabelSingular={space.exerciseLabelSingular} /> : null}</main>;
}
