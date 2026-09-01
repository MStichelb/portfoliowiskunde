import { Trash2 } from "lucide-react";
import { notFound } from "next/navigation";

import { AdminSpaceHeader } from "@/app/components/admin-space-header";
import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import { ErrorReportCards, ErrorReportOpenGroups } from "@/app/components/error-report-groups";
import { requireAdminUser } from "@/lib/auth";
import { canManageLearningSpace } from "@/lib/authorization";
import { getAdminErrorReports, getAdminLearningSpaceBySlug, getOldDoneErrorReportCount } from "@/lib/repositories";

import { deleteOldDoneErrorReportsAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function SpaceReportsPage({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const user = await requireAdminUser();
  const { spaceSlug } = await params;
  const space = await getAdminLearningSpaceBySlug(spaceSlug);
  if (!space || !await canManageLearningSpace(user, space.id)) notFound();
  const [reports, oldDone] = await Promise.all([getAdminErrorReports(space.id), getOldDoneErrorReportCount(undefined, space.id)]);
  const open = reports.filter((report) => report.status === "TODO");
  const done = reports.filter((report) => report.status === "DONE");
  return <main className="page-shell admin-page admin-space-page reports-page">
    <AdminSpaceHeader current={space} section="reports" />
    <ErrorReportOpenGroups reports={open} spaceSlug={space.slug} learningSpaceId={space.id} />
    <details className="report-group done-group"><summary><h2>DONE <span>{done.length}</span></h2></summary>{oldDone > 0 ? <div className="done-group-actions"><ConfirmActionButton action={deleteOldDoneErrorReportsAction} fields={{ learningSpaceId: space.id }} className="danger-button" label={<><Trash2 size={16} aria-hidden />Verwijder DONE ouder dan 2 weken</>} confirmTitle="Afgewerkte meldingen verwijderen" confirmText={`${oldDone} afgewerkte meldingen worden verwijderd.`} /></div> : null}<ErrorReportCards reports={done} spaceSlug={space.slug} learningSpaceId={space.id} /></details>
  </main>;
}
