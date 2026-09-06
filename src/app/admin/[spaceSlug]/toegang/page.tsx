import { notFound } from "next/navigation";

import { AdminSpaceHeader } from "@/app/components/admin-space-header";
import { requireAdminUser } from "@/lib/auth";
import { canManageLearningSpace } from "@/lib/authorization";
import { getAdminLearningSpaceBySlug } from "@/lib/repositories";

export const dynamic = "force-dynamic";

export default async function LearningSpaceAccessPage({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const user = await requireAdminUser();
  const { spaceSlug } = await params;
  const space = await getAdminLearningSpaceBySlug(spaceSlug);
  if (!space || !await canManageLearningSpace(user, space.id)) notFound();

  return <main className="page-shell admin-page admin-space-page learning-space-access-page">
    <AdminSpaceHeader current={space} section="access" user={user} />
    <header className="page-header"><h2>Toegang</h2></header>
    <section className="admin-card" aria-labelledby="teachers-heading"><h3 id="teachers-heading">Leraren</h3><p>Beheer de leraren die deze leeromgeving kunnen bekijken of bewerken.</p></section>
    <section className="admin-card" aria-labelledby="groups-users-heading"><h3 id="groups-users-heading">Groepen en gebruikers koppelen</h3><p>Koppel Smartschoolgroepen of individuele leerlingen aan deze leeromgeving.</p></section>
    <section className="admin-card" aria-labelledby="users-heading"><h3 id="users-heading">Gebruikers</h3><p>Bekijk de leerlingen die toegang hebben tot deze leeromgeving.</p></section>
  </main>;
}
