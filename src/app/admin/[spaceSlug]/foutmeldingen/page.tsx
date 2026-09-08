import { notFound } from "next/navigation";

import { AdminSpaceHeader } from "@/app/components/admin-space-header";
import { GroupedErrorReportInbox } from "@/app/components/error-report-groups";
import { requireAdminUser } from "@/lib/auth";
import { canManageLearningSpace } from "@/lib/authorization";
import { getAdminLearningSpaceBySlug, getGroupedErrorReportIssues, listErrorReportsForIssues } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function SpaceReportsPage({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const user = await requireAdminUser();
  const { spaceSlug } = await params;
  const space = await getAdminLearningSpaceBySlug(spaceSlug);
  if (!space || !await canManageLearningSpace(user, space.id)) notFound();
  const issues = await getGroupedErrorReportIssues(space.id);
  const reports = await listErrorReportsForIssues(issues.map((issue) => issue.id), space.id);
  const reportsByIssue = Object.fromEntries(issues.map((issue) => [issue.id, reports.filter((report) => report.issueId === issue.id)]));
  return <main className="page-shell admin-page admin-space-page reports-page">
    <AdminSpaceHeader current={space} section="reports" user={user} />
    <GroupedErrorReportInbox issues={issues} reportsByIssue={reportsByIssue} spaceSlug={space.slug} />
  </main>;
}
