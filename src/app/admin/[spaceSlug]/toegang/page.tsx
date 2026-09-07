import { Crown, Eye, Pencil, Trash2 } from "lucide-react";
import { notFound } from "next/navigation";

import { AdminSpaceHeader } from "@/app/components/admin-space-header";
import { ConfirmActionButton } from "@/app/components/confirm-action-button";
import { LearningSpaceGroupMappingForm } from "@/app/components/learning-space-group-mapping-form";
import { LearningSpaceStudentAccessModal } from "@/app/components/learning-space-student-access-modal";
import { LearningSpaceStudentRoster } from "@/app/components/learning-space-student-roster";
import { requireAdminUser } from "@/lib/auth";
import { canManageLearningSpace, canManageLearningSpaceStudentAccess, canManageLearningSpaceTeacherAccess } from "@/lib/authorization";
import { listLearningSpaceStudentRoster } from "@/lib/learning-space-student-roster";
import { getAdminLearningSpaceBySlug } from "@/lib/repositories";
import {
  isClassGroupName,
  listKnownExternalGroups,
  listLearningSpaceGroupMappings,
  listLearningSpaceIndividualStudentAccess,
  listLearningSpaceIndividualStudentCandidates,
  listLearningSpaceTeacherCandidates,
  listLearningSpaceTeachers,
  type LearningSpaceIndividualStudent,
  type LearningSpaceTeacher,
  type LearningSpaceTeacherCandidate,
  type ManagedGroupMapping,
} from "@/lib/user-management";

import {
  removeLearningSpaceGroupMappingAction,
  removeLearningSpaceIndividualStudentAccessAction,
  removeLearningSpaceTeacherAccessAction,
  saveLearningSpaceGroupMappingAction,
  saveLearningSpaceIndividualStudentAccessAction,
  saveLearningSpaceTeacherAccessAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function LearningSpaceAccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ spaceSlug: string }>;
  searchParams?: Promise<{ accessSaved?: string; accessError?: string; groupSaved?: string; groupError?: string; studentSaved?: string; studentError?: string }>;
}) {
  const user = await requireAdminUser();
  const { spaceSlug } = await params;
  const space = await getAdminLearningSpaceBySlug(spaceSlug);
  if (!space || !await canManageLearningSpace(user, space.id)) notFound();
  const [canManageTeacherAccess, canManageStudentAccess] = await Promise.all([
    canManageLearningSpaceTeacherAccess(user, space.id),
    canManageLearningSpaceStudentAccess(user, space.id),
  ]);
  const emptyQuery: { accessSaved?: string; accessError?: string; groupSaved?: string; groupError?: string; studentSaved?: string; studentError?: string } = {};
  const [teachers, candidates, groupMappings, knownGroups, individualStudents, studentCandidates, roster, query] = await Promise.all([
    listLearningSpaceTeachers(space.id),
    canManageTeacherAccess ? listLearningSpaceTeacherCandidates(space.id) : Promise.resolve([]),
    listLearningSpaceGroupMappings(space.id),
    canManageStudentAccess ? listKnownExternalGroups() : Promise.resolve([]),
    listLearningSpaceIndividualStudentAccess(space.id),
    canManageStudentAccess ? listLearningSpaceIndividualStudentCandidates(space.id) : Promise.resolve([]),
    listLearningSpaceStudentRoster(space.id),
    searchParams ?? Promise.resolve(emptyQuery),
  ]);
  const mappedGroupIds = new Set(groupMappings
    .filter((mapping) => mapping.provider === "smartschool")
    .map((mapping) => mapping.externalGroupId));
  const availableGroups = knownGroups.filter((group) =>
    group.provider === "smartschool" && !mappedGroupIds.has(group.externalGroupId));
  const classGroups = availableGroups.filter((group) =>
    Boolean(group.externalGroupName && isClassGroupName(group.externalGroupName)));
  const otherGroups = availableGroups.filter((group) =>
    !group.externalGroupName || !isClassGroupName(group.externalGroupName));

  return <main className="page-shell admin-page admin-space-page learning-space-access-page">
    <AdminSpaceHeader current={space} section="access" user={user} />
    {query.accessSaved === "1" ? <p className="success-message save-feedback" role="status">Lerarentoegang bijgewerkt.</p> : null}
    {query.accessError ? <p className="form-message" role="alert">{query.accessError}</p> : null}
    <section className="admin-card" aria-labelledby="teachers-heading">
      <div className="card-heading"><div><h2 id="teachers-heading">Leraren</h2><p>Beheer de leraren die deze leeromgeving kunnen bekijken of bewerken.</p></div></div>
      {canManageTeacherAccess ? <TeacherAccessForm learningSpaceId={space.id} candidates={candidates} /> : null}
      {teachers.length
        ? <TeacherAccessTable learningSpaceId={space.id} teachers={teachers} canChange={canManageTeacherAccess} />
        : <p className="empty-state compact-empty">Nog geen leraren met toegang.</p>}
    </section>
    <section className="admin-card" aria-labelledby="groups-users-heading">
      <div className="card-heading"><div><h2 id="groups-users-heading">Leerlingen koppelen</h2></div></div>
      <div className="student-linking-group">
        <h3>Groepen</h3>
        <p>Koppel Smartschoolgroepen aan deze leeromgeving om leerlingen automatisch kijktoegang te geven.</p>
        {query.groupSaved === "1" ? <p className="success-message save-feedback" role="status">Groepskoppeling bijgewerkt.</p> : null}
        {query.groupError ? <p className="form-message" role="alert">{query.groupError}</p> : null}
        {canManageStudentAccess ? <div className="learning-space-group-forms">
          <LearningSpaceGroupMappingForm learningSpaceId={space.id} label="Klasgroep" groups={classGroups} action={saveLearningSpaceGroupMappingAction} />
          <LearningSpaceGroupMappingForm learningSpaceId={space.id} label="Andere groep" groups={otherGroups} action={saveLearningSpaceGroupMappingAction} />
        </div> : null}
        <GroupMappingList learningSpaceId={space.id} mappings={groupMappings} canChange={canManageStudentAccess} />
      </div>
      <div className="individual-student-access">
        <div className="card-heading">
          <div><h3>Individuele leerlingen</h3><p>Geef een leerling rechtstreeks kijktoegang tot deze leeromgeving.</p></div>
          {canManageStudentAccess ? <LearningSpaceStudentAccessModal learningSpaceId={space.id} candidates={studentCandidates} action={saveLearningSpaceIndividualStudentAccessAction} /> : null}
        </div>
        {query.studentSaved === "1" ? <p className="success-message save-feedback compact-save-feedback" role="status">Individuele toegang bijgewerkt.</p> : null}
        {query.studentError ? <p className="form-message" role="alert">{query.studentError}</p> : null}
        <IndividualStudentAccessList learningSpaceId={space.id} students={individualStudents} canChange={canManageStudentAccess} />
      </div>
    </section>
    <section className="admin-card" aria-labelledby="users-heading">
      <div className="card-heading">
        <div><h2 id="users-heading">Gebruikers</h2><p>Bekijk de leerlingen die toegang hebben tot deze leeromgeving.</p></div>
        <strong className="list-count">{roster.length} {roster.length === 1 ? "leerling" : "leerlingen"}</strong>
      </div>
      <LearningSpaceStudentRoster students={roster} />
    </section>
  </main>;
}

function GroupMappingList({ learningSpaceId, mappings, canChange }: { learningSpaceId: string; mappings: ManagedGroupMapping[]; canChange: boolean }) {
  if (mappings.length === 0) return <p className="empty-state compact-empty">Nog geen Smartschoolgroepen gekoppeld.</p>;
  return <ul className="management-list learning-space-group-list">{mappings.map((mapping) => {
    const isClassGroup = Boolean(mapping.externalGroupName && isClassGroupName(mapping.externalGroupName));
    return <li key={mapping.id}>
      <span><strong>{mapping.externalGroupName ?? mapping.externalGroupId}</strong></span>
      <span className="group-type-badge">{isClassGroup ? "Klasgroep" : "Andere groep"}</span>
      {canChange ? <ConfirmActionButton
        action={removeLearningSpaceGroupMappingAction}
        fields={{ learningSpaceId, mappingId: mapping.id }}
        label={<Trash2 size={16} aria-hidden />}
        confirmTitle="Groepskoppeling verwijderen?"
        confirmText="De automatische kijktoegang via deze Smartschoolgroep valt weg. Individuele en beheerrechten blijven behouden."
      /> : null}
    </li>;
  })}</ul>;
}

function IndividualStudentAccessList({ learningSpaceId, students, canChange }: { learningSpaceId: string; students: LearningSpaceIndividualStudent[]; canChange: boolean }) {
  if (students.length === 0) return <p className="empty-state compact-empty">Nog geen leerlingen individueel gekoppeld.</p>;
  return <div className="admin-summary-table" role="region" aria-label="Individueel gekoppelde leerlingen" tabIndex={0}><table><thead><tr><th>Naam</th><th>Voornaam</th><th>Klas</th>{canChange ? <th><span className="sr-only">Beheren</span></th> : null}</tr></thead><tbody>{students.map((student) => <tr key={student.userId}><td>{student.lastName ?? student.displayName}</td><td>{student.firstName ?? "-"}</td><td>{student.className ?? "-"}</td>{canChange ? <td><ConfirmActionButton
    action={removeLearningSpaceIndividualStudentAccessAction}
    fields={{ learningSpaceId, userId: student.userId }}
    label={<Trash2 size={16} aria-hidden />}
    confirmTitle="Individuele leerlingtoegang verwijderen?"
    confirmText={`${student.displayName} verliest de rechtstreekse kijktoegang. Toegang via een gekoppelde Smartschoolgroep blijft behouden.`}
  /></td> : null}</tr>)}</tbody></table></div>;
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
  return <div className="admin-summary-table" role="region" aria-label="Leraren met toegang" tabIndex={0}><table><thead><tr><th>Naam</th><th>Voornaam</th><th>Rol</th>{canChange ? <th><span className="sr-only">Beheren</span></th> : null}</tr></thead><tbody>{teachers.map((teacher) => <tr key={teacher.userId}><td><span className="teacher-name-cell">{teacher.lastName ?? "-"}{teacher.isSuperadmin ? <span className="teacher-admin-indicator" title="Beheerder"><Crown size={14} aria-hidden /><span className="sr-only">Beheerder</span></span> : null}</span></td><td>{teacher.firstName ?? "-"}</td><td><TeacherRoleBadge role={teacher.role} /></td>{canChange ? <td>{teacher.role === "owner" ? null : <TeacherAccessActions learningSpaceId={learningSpaceId} teacher={teacher} />}</td> : null}</tr>)}</tbody></table></div>;
}

function TeacherAccessActions({ learningSpaceId, teacher }: { learningSpaceId: string; teacher: LearningSpaceTeacher }) {
  const name = [teacher.firstName, teacher.lastName].filter(Boolean).join(" ") || "Deze leraar";
  const targetRole = teacher.role === "editor" ? "viewer" : "editor";
  const actionLabel = targetRole === "viewer" ? "Maak kijker" : "Maak bewerker";
  return <div className="teacher-access-row-actions">
    <form action={saveLearningSpaceTeacherAccessAction}>
      <input type="hidden" name="learningSpaceId" value={learningSpaceId} />
      <input type="hidden" name="userId" value={teacher.userId} />
      <input type="hidden" name="role" value={targetRole} />
      <button className="secondary-button teacher-role-action" type="submit">
        {targetRole === "viewer" ? <Eye size={16} aria-hidden /> : <Pencil size={16} aria-hidden />}
        {actionLabel}
      </button>
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

  return (
    <div className="management-badges">
      <span className={`teacher-role-badge teacher-role-badge-${role}`}>
        {role === "owner"
          ? <Crown size={14} aria-hidden />
          : role === "editor"
            ? <Pencil size={14} aria-hidden />
            : <Eye size={14} aria-hidden />}
        {label}
      </span>
    </div>
  );
}
