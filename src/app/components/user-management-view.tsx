import { Check, Crown, GraduationCap, KeyRound, Pencil, ShieldCheck, Star, Trash2, X } from "lucide-react";
import Link from "next/link";

import {
  resetAllStudentsAction,
  resetClassStudentsAction,
  resetUserAction,
  updateTeacherGroupAction,
  updateIndividualAccessAction,
  updateUserClassAction,
  updateUserRoleAction,
  updateUserStatusAction,
} from "@/app/admin/gebruikers/actions";
import type { LearningSpace } from "@/lib/repositories";
import type {
  KnownExternalGroup,
  ManagedMembership,
  ManagedStorageConnection,
  ManagedUser,
  ManagedUserAccess,
} from "@/lib/user-management";

import { AutoSubmitSelect } from "./auto-submit-select";
import { ConfirmActionButton } from "./confirm-action-button";
import { StudentResetControls } from "./student-reset-controls";
import { UserAccessMenu } from "./user-access-menu";
import { StudentListFilters, TeacherListFilters } from "./user-list-filters";

export interface UserListSearchParams {
  q?: string;
  class?: string | string[];
  status?: string;
  access?: string;
  sort?: string;
  page?: string;
  size?: string;
  teacherStatus?: string;
  teacherAccess?: string;
}

export function UserManagementView({
  users,
  spaces,
  memberships,
  access,
  storageConnections,
  classGroups,
  teacherGroups,
  teacherGroupId,
  params,
}: {
  users: ManagedUser[];
  spaces: LearningSpace[];
  memberships: ManagedMembership[];
  access: ManagedUserAccess[];
  storageConnections: ManagedStorageConnection[];
  classGroups: KnownExternalGroup[];
  teacherGroups: KnownExternalGroup[];
  teacherGroupId: string | null;
  params: UserListSearchParams;
}) {
  const administrators = users.filter((user) => user.role === "superadmin");
  const teachers = users.filter((user) => user.role === "teacher");
  const students = users.filter((user) => user.role === "student");
  const teacherFiltered = filterTeachers(teachers, params);
  const studentFiltered = filterStudents(students, params);
  const size = parsePageSize(params.size);
  const totalPages = size === Infinity ? 1 : Math.max(1, Math.ceil(studentFiltered.length / size));
  const page = Math.min(Math.max(Number(params.page) || 1, 1), totalPages);
  const shownStudents = size === Infinity ? studentFiltered : studentFiltered.slice((page - 1) * size, page * size);
  const resettableClasses = classGroups.map((group) => ({ id: group.externalGroupId, label: group.externalGroupName ?? group.externalGroupId, studentCount: students.filter((student) => student.effectiveClassGroupId === group.externalGroupId).length })).filter((group) => group.studentCount > 0);

  return <div className="user-role-sections">
    <section className="admin-card user-role-card" aria-labelledby="administrators-heading">
      <div className="card-heading"><div><h2 id="administrators-heading" className="heading-with-icon"><Crown size={20} aria-hidden />Beheerders</h2><p>Hoofdbeheerders hebben volledige applicatietoegang.</p></div><strong className="list-count">{administrators.length} beheerders</strong></div>
      <UserTableRegion label="Beheerders"><table className="managed-user-table"><thead><tr><th>Naam</th><th>Voornaam</th><th>Status</th></tr></thead><tbody>{administrators.map((user) => <tr key={user.id}><NameCells user={user} /><td><span className={`account-status-label ${user.status}`}>{user.status === "active" ? "Actief" : "Uitgeschakeld"}</span></td></tr>)}</tbody></table></UserTableRegion>
    </section>

    <section className="admin-card user-role-card" aria-labelledby="teachers-heading">
      <div className="card-heading"><div><h2 id="teachers-heading" className="heading-with-icon"><Star size={20} aria-hidden />Leraren</h2><p>Publieke toegang en beheerrechten worden afzonderlijk weergegeven.</p></div><strong className="list-count">{countLabel(teacherFiltered.length, teachers.length, "leraren")}</strong></div>
      <div className="teacher-detection-setting"><div><strong><ShieldCheck size={16} aria-hidden />Automatische lerarenherkenning</strong><small>Bepaalt alleen de startrol bij de eerste Smartschoolregistratie.</small></div><AutoSubmitSelect action={updateTeacherGroupAction} fields={{ returnTo: "/admin/gebruikers" }} name="groupId" value={teacherGroupId ?? ""} ariaLabel="Groep voor automatische lerarenherkenning" className="teacher-group-setting" options={[{ value: "", label: "Geen automatische herkenning" }, ...teacherGroups.map((group) => ({ value: group.externalGroupId, label: group.externalGroupName ?? group.externalGroupId }))]} /></div>
      <TeacherListFilters params={params} />
      <UserTableRegion label="Leraren"><table className="managed-user-table"><thead><tr><th>Naam</th><th>Voornaam</th><th>Beheerrechten</th><th>Verbinding</th><th>Publieke toegang</th><th>Status</th><th aria-label="Acties" /></tr></thead><tbody>{teacherFiltered.map((user) => <tr key={user.id}><NameCells user={user} /><td><ManagementBadges memberships={memberships.filter((item) => item.userId === user.id)} spaces={spaces} /></td><td><StorageBadges connections={storageConnections.filter((item) => item.userId === user.id)} /></td><td><AccessMenu user={user} spaces={spaces} access={access} /></td><td><StatusToggle user={user} /></td><td><div className="user-row-actions"><ConfirmActionButton action={updateUserRoleAction} fields={{ userId: user.id, role: "student" }} label={<GraduationCap size={17} aria-hidden />} confirmTitle="Maak deze leraar leerling?" confirmText="De rol wordt alleen gewijzigd als deze leraar geen beheerrechten of gekoppelde bronverbindingen meer heeft." confirmLabel="Rol wijzigen" confirmClassName="primary-button" /><ConfirmActionButton action={resetUserAction} fields={{ userId: user.id }} label={<Trash2 size={17} aria-hidden />} confirmTitle={`Verwijder ${user.displayName}?`} confirmText="Deze leraar wordt intern verwijderd en bij een volgende Smartschool-login opnieuw geregistreerd. Eigenaars en leraren met een gebruikte bronverbinding worden geweigerd." /></div></td></tr>)}</tbody></table></UserTableRegion>
    </section>

    <section className="admin-card user-role-card" aria-labelledby="students-heading">
      <div className="card-heading"><div><h2 id="students-heading" className="heading-with-icon"><GraduationCap size={20} aria-hidden />Leerlingen</h2><p>Zoek, filter en beheer klas, toegang en accountstatus.</p></div><strong className="list-count">{countLabel(studentFiltered.length, students.length, "leerlingen")}</strong></div>
      <StudentListFilters params={params} classes={classGroups.map((group) => ({ id: group.externalGroupId, label: group.externalGroupName ?? group.externalGroupId }))} />
      <StudentResetControls classes={resettableClasses} totalStudents={students.length} resetClassAction={resetClassStudentsAction} resetAllAction={resetAllStudentsAction} />
      <UserTableRegion label="Leerlingen"><table className="managed-user-table student-user-table"><thead><tr><th>Naam</th><th>Voornaam</th><th>Klas</th><th>Publieke toegang</th><th>Status</th><th aria-label="Acties" /></tr></thead><tbody>{shownStudents.map((user) => <tr key={user.id}><NameCells user={user} /><td><AutoSubmitSelect action={updateUserClassAction} fields={{ userId: user.id }} name="classGroupId" value={user.classGroupOverrideId ?? ""} ariaLabel={`Klas van ${user.displayName}`} options={[{ value: "", label: user.automaticClassName ? `Automatisch (${user.automaticClassName})` : "Automatisch (Smartschool)" }, ...classGroups.map((group) => ({ value: group.externalGroupId, label: group.externalGroupName ?? group.externalGroupId }))]} /></td><td><AccessMenu user={user} spaces={spaces} access={access} /></td><td><StatusToggle user={user} /></td><td><div className="user-row-actions"><ConfirmActionButton action={updateUserRoleAction} fields={{ userId: user.id, role: "teacher" }} label={<Star size={17} aria-hidden />} confirmTitle="Maak deze leerling leraar?" confirmText="De lokale rol wordt leraar. Beheerrechten worden niet automatisch toegekend." confirmLabel="Rol wijzigen" confirmClassName="primary-button" /><ConfirmActionButton action={resetUserAction} fields={{ userId: user.id }} label={<Trash2 size={17} aria-hidden />} confirmTitle={`Verwijder ${user.displayName}?`} confirmText="Deze leerling en de lokale Smartschool-, klas- en toegangsgegevens worden intern verwijderd. Bij een volgende Smartschool-login wordt de leerling opnieuw geregistreerd." /></div></td></tr>)}</tbody></table></UserTableRegion>
      {studentFiltered.length === 0 ? <p className="empty-state compact-empty">Geen leerlingen gevonden met deze filters.</p> : null}
      <Pagination page={page} totalPages={totalPages} params={params} />
    </section>
  </div>;
}

export function filterStudents(users: ManagedUser[], params: UserListSearchParams): ManagedUser[] {
  const query = (params.q ?? "").trim().toLocaleLowerCase("nl-BE");
  const classes = new Set(stringValues(params.class));
  return [...users].filter((user) => {
    if (query && ![user.firstName, user.lastName].some((value) => value?.toLocaleLowerCase("nl-BE").includes(query))) return false;
    if (params.status === "disabled" && user.status !== "disabled") return false;
    if (params.access === "with" && !user.hasIndividualAccess) return false;
    if (classes.size && (!user.effectiveClassGroupId || !classes.has(user.effectiveClassGroupId))) return false;
    return true;
  }).sort(userComparator(params.sort));
}

function filterTeachers(users: ManagedUser[], params: UserListSearchParams): ManagedUser[] {
  return users.filter((user) => {
    if (params.teacherStatus === "disabled" && user.status !== "disabled") return false;
    if (params.teacherAccess === "with" && !user.hasIndividualAccess) return false;
    return true;
  }).sort(userComparator("last-asc"));
}

function userComparator(sort = "last-asc") {
  const first = sort.startsWith("first");
  const direction = sort.endsWith("desc") ? -1 : 1;
  return (left: ManagedUser, right: ManagedUser) => {
    const primary = compareNames(first ? left.firstName : left.lastName, first ? right.firstName : right.lastName);
    if (primary) return primary * direction;
    return compareNames(first ? left.lastName : left.firstName, first ? right.lastName : right.firstName) * direction;
  };
}

function compareNames(left: string | null, right: string | null): number {
  return (left ?? "").localeCompare(right ?? "", "nl-BE", { sensitivity: "base" });
}

function NameCells({ user }: { user: ManagedUser }) {
  return <><td><strong className="user-name-cell">{user.lastName ?? "-"}</strong>{user.email ? <small>{user.email}</small> : null}</td><td>{user.firstName ?? "-"}</td></>;
}

function StatusToggle({ user }: { user: ManagedUser }) {
  const active = user.status === "active";
  return <form action={updateUserStatusAction}><input type="hidden" name="userId" value={user.id} /><input type="hidden" name="status" value={active ? "disabled" : "active"} /><button className={`account-status-toggle ${active ? "active" : "disabled"}`} type="submit" role="switch" aria-checked={active} aria-label={`${user.displayName} ${active ? "uitschakelen" : "activeren"}`}><span aria-hidden />{active ? "Actief" : "Uitgeschakeld"}</button></form>;
}

function ManagementBadges({ memberships, spaces }: { memberships: ManagedMembership[]; spaces: LearningSpace[] }) {
  if (!memberships.length) return <span className="muted-value">-</span>;
  return <div className="management-badges">{memberships.map((membership) => {
    const space = spaces.find((item) => item.id === membership.learningSpaceId);
    const label = membership.role === "owner" ? "Eigenaar" : "Editor";
    return <span key={membership.learningSpaceId} title={`${label} van ${space?.name ?? membership.learningSpaceId}`}>{membership.role === "owner" ? <KeyRound size={14} aria-hidden /> : <Pencil size={14} aria-hidden />}{space?.shortLabel ?? space?.name ?? membership.learningSpaceId}<span className="sr-only">, {label}</span></span>;
  })}</div>;
}

function StorageBadges({ connections }: { connections: ManagedStorageConnection[] }) {
  const active = connections.filter((connection) => connection.status === "active");
  if (!active.length) return <span className="connection-badge connection-none"><X size={14} aria-hidden />Geen verbinding</span>;
  return <div className="connection-badges">{active.map((connection, index) => <span className={`connection-badge connection-${connection.provider}`} key={`${connection.provider}-${index}`}><Check size={14} aria-hidden />{connection.provider === "onedrive" ? "OneDrive" : "Google Drive"}</span>)}</div>;
}

function AccessMenu({ user, spaces, access }: { user: ManagedUser; spaces: LearningSpace[]; access: ManagedUserAccess[] }) {
  return <UserAccessMenu userId={user.id} userName={user.displayName} userRole={user.role === "teacher" ? "teacher" : "student"} action={updateIndividualAccessAction} spaces={spaces.filter((space) => space.isActive).map((space) => {
    const item = access.find((entry) => entry.userId === user.id && entry.learningSpaceId === space.id);
    return { id: space.id, name: space.name, shortLabel: space.shortLabel, groupDerived: item?.groupDerived ?? false, individual: item?.individual ?? false, managementRole: item?.managementRole ?? null };
  })} />;
}

function UserTableRegion({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="admin-summary-table managed-user-table-region" role="region" aria-label={label} tabIndex={0}>{children}</div>;
}

function Pagination({ page, totalPages, params }: { page: number; totalPages: number; params: UserListSearchParams }) {
  if (totalPages <= 1) return null;
  return <nav className="pagination" aria-label="Pagina's leerlingen"><Link className={page <= 1 ? "disabled" : ""} aria-disabled={page <= 1} href={pageHref(params, page - 1)}>Vorige</Link><span>Pagina {page} van {totalPages}</span><Link className={page >= totalPages ? "disabled" : ""} aria-disabled={page >= totalPages} href={pageHref(params, page + 1)}>Volgende</Link></nav>;
}

function pageHref(params: UserListSearchParams, page: number): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "page" || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) search.append(key, item);
  }
  search.set("page", String(Math.max(1, page)));
  return `/admin/gebruikers?${search.toString()}`;
}

function parsePageSize(value: string | undefined): number {
  if (value === "all") return Infinity;
  const parsed = Number(value);
  return parsed === 50 || parsed === 100 ? parsed : 25;
}

function stringValues(value: string | string[] | undefined): string[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function countLabel(filtered: number, total: number, noun: string): string {
  return filtered === total ? `${total} ${noun}` : `${filtered} ${noun} gefilterd (op ${total} totaal)`;
}
