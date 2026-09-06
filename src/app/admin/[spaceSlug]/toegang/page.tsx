import { Crown, Eye, Pencil } from "lucide-react";
import { notFound } from "next/navigation";

import { AdminSpaceHeader } from "@/app/components/admin-space-header";
import { requireAdminUser } from "@/lib/auth";
import { canManageLearningSpace } from "@/lib/authorization";
import { getAdminLearningSpaceBySlug } from "@/lib/repositories";
import { listLearningSpaceTeachers, type LearningSpaceTeacher } from "@/lib/user-management";

export const dynamic = "force-dynamic";

export default async function LearningSpaceAccessPage({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const user = await requireAdminUser();
  const { spaceSlug } = await params;
  const space = await getAdminLearningSpaceBySlug(spaceSlug);
  if (!space || !await canManageLearningSpace(user, space.id)) notFound();
  const teachers = await listLearningSpaceTeachers(space.id);

  return <main className="page-shell admin-page admin-space-page learning-space-access-page">
    <AdminSpaceHeader current={space} section="access" user={user} />
    <section className="admin-card" aria-labelledby="teachers-heading">
      <div className="card-heading"><div><h2 id="teachers-heading">Leraren</h2><p>Beheer de leraren die deze leeromgeving kunnen bekijken of bewerken.</p></div></div>
      {teachers.length ? <div className="admin-summary-table" role="region" aria-label="Leraren met toegang" tabIndex={0}><table><thead><tr><th>Naam</th><th>Voornaam</th><th>Rol</th></tr></thead><tbody>{teachers.map((teacher) => <tr key={teacher.userId}><td>{teacher.lastName ?? "-"}</td><td>{teacher.firstName ?? "-"}</td><td><TeacherRoleBadge role={teacher.role} /></td></tr>)}</tbody></table></div> : <p className="empty-state compact-empty">Nog geen leraren met toegang.</p>}
    </section>
    <section className="admin-card" aria-labelledby="groups-users-heading"><h2 id="groups-users-heading">Groepen en gebruikers koppelen</h2><p>Koppel Smartschoolgroepen of individuele leerlingen aan deze leeromgeving.</p></section>
    <section className="admin-card" aria-labelledby="users-heading"><h2 id="users-heading">Gebruikers</h2><p>Bekijk de leerlingen die toegang hebben tot deze leeromgeving.</p></section>
  </main>;
}

function TeacherRoleBadge({ role }: { role: LearningSpaceTeacher["role"] }) {
  const label = role === "owner" ? "Eigenaar" : role === "editor" ? "Bewerker" : "Kijker";
  return <div className="management-badges"><span>{role === "owner" ? <Crown size={14} aria-hidden /> : role === "editor" ? <Pencil size={14} aria-hidden /> : <Eye size={14} aria-hidden />}{label}</span></div>;
}
