import { notFound } from "next/navigation";

import { AdminSpaceHeader } from "@/app/components/admin-space-header";
import { LearningSpaceSourceStatusOverview } from "@/app/components/learning-space-source-status-card";
import { requireAdminUser } from "@/lib/auth";
import { canManageLearningSpace } from "@/lib/authorization";
import { getLearningSpaceSourceStatus } from "@/lib/learning-space-source-status";
import { getAdminLearningSpaceBySlug } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function LearningSpaceStatusPage({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const user = await requireAdminUser();
  const { spaceSlug } = await params;
  const space = await getAdminLearningSpaceBySlug(spaceSlug);
  if (!space || !await canManageLearningSpace(user, space.id)) notFound();
  const status = await getLearningSpaceSourceStatus(user, space.id);

  return <main className="page-shell admin-page admin-space-page source-status-page">
    <AdminSpaceHeader current={space} section="status" user={user} sourceStatus={status} />
    <div className="page-section-heading">
      <h2>Status</h2>
      <p>Overzicht op basis van opgeslagen gegevens. Er wordt geen live broncontrole uitgevoerd.</p>
    </div>
    <LearningSpaceSourceStatusOverview status={status} />
  </main>;
}
