import { notFound } from "next/navigation";

import { AdminSpaceHeader } from "@/app/components/admin-space-header";
import { GroupedErrorReportThreadInbox } from "@/app/components/error-report-groups";
import { requireAdminUser } from "@/lib/auth";
import { canManageLearningSpace } from "@/lib/authorization";
import { getAdminLearningSpaceBySlug, getGroupedErrorReportThreads, listErrorReportIssuesForThreads } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function SpaceReportsPage({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const user = await requireAdminUser();
  const { spaceSlug } = await params;
  const space = await getAdminLearningSpaceBySlug(spaceSlug);
  if (!space || !await canManageLearningSpace(user, space.id)) notFound();
  const threads = await getGroupedErrorReportThreads(space.id);
  const issues = await listErrorReportIssuesForThreads(threads.map((thread) => thread.id), space.id);
  const issuesByThread = Object.fromEntries(threads.map((thread) => [thread.id, issues.filter((issue) => issue.threadId === thread.id)]));
  return <main className="page-shell admin-page admin-space-page reports-page">
    <AdminSpaceHeader current={space} section="reports" user={user} />
    <GroupedErrorReportThreadInbox threads={threads} issuesByThread={issuesByThread} spaceSlug={space.slug} />
  </main>;
}
