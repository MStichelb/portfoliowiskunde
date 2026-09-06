import { Crown, Eye, Pencil, Trash2 } from "lucide-react";
import { notFound } from "next/navigation";

import { AdminSpaceHeader } from "@/app/components/admin-space-header";
import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import { requireAdminUser } from "@/lib/auth";
import { canConfigureLearningSpace, canManageLearningSpace } from "@/lib/authorization";
import { getAdminLearningSpaceBySlug } from "@/lib/repositories";
import {
  listLearningSpaceTeacherCandidates,
  listLearningSpaceTeachers,
  type LearningSpaceTeacher,
  type LearningSpaceTeacherCandidate,
} from "@/lib/user-management";

import { removeLearningSpaceTeacherAccessAction, saveLearningSpaceTeacherAccessAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function LearningSpaceAccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ spaceSlug: string }>;
  searchParams?: Promise<{ accessSaved?: string; accessError?: string }>;
}) {
  const user = await requireAdminUser();
  const { spaceSlug } = await params;
  const space = await getAdminLearningSpaceBySlug(spaceSlug);
  if (!space || !await canManageLearningSpace(user, space.id)) notFound();
  const canChangeTeacherAccess = await canConfigureLearningSpace(user, space.id);
  const emptyQuery: { accessSaved?: string; accessError?: string } = {};
  const [teachers, candidates, query] = await Promise.all([
    listLearningSpaceTeachers(space.id),
    canChangeTeacherAccess ? listLearningSpaceTeacherCandidates(space.id) : Promise.resolve([]),
    searchParams ?? Promise.resolve(emptyQuery),
  ]);

  return <main className="page-shell admin-page admin-space-page learning-space-access-page">
    <AdminSpaceHeader current={space} section="access" user={user} />
    {query.accessSaved === "1" ? <p className="success-message save-feedback" role="status">Lerarentoegang bijgewerkt.</p> : null}
    {query.accessError ? <p className="form-message" role="alert">{query.accessError}</p> : null}
    <section className="admin-card" aria-labelledby="teachers-heading">
      <div className="card-heading"><div><h2 id="teachers-heading">Leraren</h2><p>Beheer de leraren die deze leeromgeving kunnen bekijken of bewerken.</p></div></div>
      {canChangeTeacherAccess ? <TeacherAccessForm learningSpaceId={space.id} candidates={candidates} /> : null}
      {teachers.length
        ? <TeacherAccessTable learningSpaceId={space.id} teachers={teachers} canChange={canChangeTeacherAccess} />
        : <p className="empty-state compact-empty">Nog geen leraren met toegang.</p>}
    </section>
    <section className="admin-card" aria-labelledby="groups-users-heading"><h2 id="groups-users-heading">Groepen en gebruikers koppelen</h2><p>Koppel Smartschoolgroepen of individuele leerlingen aan deze leeromgeving.</p></section>
    <section className="admin-card" aria-labelledby="users-heading"><h2 id="users-heading">Gebruikers</h2><p>Bekijk de leerlingen die toegang hebben tot deze leeromgeving.</p></section>
  </main>;
}

function TeacherAccessForm({ learningSpaceId, candidates }: { learningSpaceId: string; candidates: LearningSpaceTeacherCandidate[] }) {
  return <form action={saveLearningSpaceTeacherAccessAction} className="management-add-form teacher-access-add-form">
    <input type="hidden" name="learningSpaceId" value={learningSpaceId} />
    <label>Leraar<select name="userId" required defaultValue="" disabled={candidates.length === 0}><option value="" disabled>{candidates.length ? "Kies een leraar" : "Geen beschikbare leraren"}</option>{candidates.map((teacher) => <option key={teacher.userId} value={teacher.userId}>{teacher.displayName}</option>)}</select></label>
    <label>Rol<select name="role" defaultValue="viewer"><option value="viewer">Kijker</option><option value="editor">Bewerker</option></select></label>
    <button className="secondary-button" type="submit" disabled={candidates.length === 0}>Toevoegen</button>
  </form>;
}

function TeacherAccessTable({ learningSpaceId, teachers, canChange }: { learningSpaceId: string; teachers: LearningSpaceTeacher[]; canChange: boolean }) {
  return <div className="admin-summary-table" role="region" aria-label="Leraren met toegang" tabIndex={0}><table><thead><tr><th>Naam</th><th>Voornaam</th><th>Rol</th>{canChange ? <th><span className="sr-only">Beheren</span></th> : null}</tr></thead><tbody>{teachers.map((teacher) => <tr key={teacher.userId}><td>{teacher.lastName ?? "-"}</td><td>{teacher.firstName ?? "-"}</td><td><TeacherRoleBadge role={teacher.role} /></td>{canChange ? <td>{teacher.role === "owner" ? null : <TeacherAccessActions learningSpaceId={learningSpaceId} teacher={teacher} />}</td> : null}</tr>)}</tbody></table></div>;
}

function TeacherAccessActions({ learningSpaceId, teacher }: { learningSpaceId: string; teacher: LearningSpaceTeacher }) {
  const name = [teacher.firstName, teacher.lastName].filter(Boolean).join(" ") || "Deze leraar";
  return <div className="teacher-access-row-actions">
    <form action={saveLearningSpaceTeacherAccessAction} className="inline-management-form">
      <input type="hidden" name="learningSpaceId" value={learningSpaceId} />
      <input type="hidden" name="userId" value={teacher.userId} />
      <label className="sr-only" htmlFor={`teacher-role-${teacher.userId}`}>Rol van {name}</label>
      <select id={`teacher-role-${teacher.userId}`} name="role" defaultValue={teacher.role}><option value="viewer">Kijker</option><option value="editor">Bewerker</option></select>
      <button className="secondary-button" type="submit">Wijzigen</button>
    </form>
    <ConfirmActionButton
      action={removeLearningSpaceTeacherAccessAction}
      fields={{ learningSpaceId, userId: teacher.userId }}
      label={<Trash2 size={16} aria-hidden />}
      confirmTitle="Lerarentoegang verwijderen?"
      confirmText={`${name} verliest de rechtstreekse toegang tot deze leeromgeving. Toegang via een gekoppelde groep kan blijven gelden.`}
    />
  </div>;
}

function TeacherRoleBadge({ role }: { role: LearningSpaceTeacher["role"] }) {
  const label = role === "owner" ? "Eigenaar" : role === "editor" ? "Bewerker" : "Kijker";
  return <div className="management-badges"><span>{role === "owner" ? <Crown size={14} aria-hidden /> : role === "editor" ? <Pencil size={14} aria-hidden /> : <Eye size={14} aria-hidden />}{label}</span></div>;
}
