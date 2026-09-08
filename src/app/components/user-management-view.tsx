import { Check, Crown, Eye, GraduationCap, KeyRound, Pencil, ShieldCheck, Star, Trash2, X } from "lucide-react";
import Link from "next/link";

import {
  resetAllStudentsAction,
  resetClassStudentsAction,
  resetUserAction,
  updateTeacherGroupAction,
  updateUserClassAction,
  updateUserRoleAction,
  updateUserStatusAction,
} from "@/app/admin/gebruikers/actions";
import type { LearningSpace } from "@/lib/repositories";
import type {
  KnownExternalGroup,
  ManagedGroupUser,
  ManagedMembership,
  ManagedStorageConnection,
  ManagedUser,
  ManagedUserAccess,
} from "@/lib/user-management";

import { AutoSubmitSelect } from "./auto-submit-select";
import { ConfirmActionButton } from "./confirm-action-button";
import { StudentResetControls } from "./student-reset-controls";
import { UserProfileButton, type UserProfileData } from "./user-profile-dialog";
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
  teacherSpace?: string;
  teacherConnectionFirst?: string;
}

export function UserManagementView({
  users,
  spaces,
  memberships,
  access,
  storageConnections,
  groupUsers = [],
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
  groupUsers?: ManagedGroupUser[];
  classGroups: KnownExternalGroup[];
  teacherGroups: KnownExternalGroup[];
  teacherGroupId: string | null;
  params: UserListSearchParams;
}) {
  const administrators = users.filter((user) => user.role === "superadmin");
  const teachers = users.filter((user) => user.role === "teacher");
  const students = users.filter((user) => user.role === "student");
  const teacherFiltered = filterTeachers(teachers, params, memberships, access, storageConnections);
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
      <div className="card-heading"><div><h2 id="teachers-heading" className="heading-with-icon"><Star size={20} aria-hidden />Leraren</h2><p>Beheerrechten, kijkrechten en verbindingen worden afzonderlijk weergegeven.</p></div><strong className="list-count">{countLabel(teacherFiltered.length, teachers.length, "leraren")}</strong></div>
      <div className="teacher-detection-setting"><div><strong><ShieldCheck size={16} aria-hidden />Automatische lerarenherkenning</strong><small>Bepaalt alleen de startrol bij de eerste Smartschoolregistratie.</small></div><AutoSubmitSelect action={updateTeacherGroupAction} fields={{ returnTo: "/admin/gebruikers" }} name="groupId" value={teacherGroupId ?? ""} ariaLabel="Groep voor automatische lerarenherkenning" className="teacher-group-setting" options={[{ value: "", label: "Geen automatische herkenning" }, ...teacherGroups.map((group) => ({ value: group.externalGroupId, label: group.externalGroupName ?? group.externalGroupId }))]} /></div>
      <TeacherListFilters params={params} spaces={spaces.map((space) => ({ id: space.id, label: space.shortLabel || space.name }))} />
      <UserTableRegion label="Leraren"><table className="managed-user-table"><thead><tr><th>Naam</th><th>Voornaam</th><th>Beheerrechten</th><th>Kijkrechten</th><th>Verbinding</th><th>Status</th><th>Acties</th></tr></thead><tbody>{teacherFiltered.map((user) => { const userMemberships = memberships.filter((item) => item.userId === user.id); return <tr key={user.id}><NameCells user={user} /><td><ManagementBadges memberships={userMemberships} spaces={spaces} /></td><td><ViewAccessBadges userId={user.id} memberships={userMemberships} access={access} spaces={spaces} /></td><td><StorageBadges connections={storageConnections.filter((item) => item.userId === user.id)} /></td><td><StatusToggle user={user} /></td><td><div className="user-row-actions"><UserProfileButton profile={buildUserProfile(user, spaces, userMemberships, access, storageConnections, groupUsers)} /><ConfirmActionButton action={updateUserRoleAction} fields={{ userId: user.id, role: "student" }} label={<GraduationCap size={17} aria-hidden />} confirmTitle="Maak deze leraar leerling?" confirmText="De rol wordt alleen gewijzigd als deze leraar geen beheerrechten of gekoppelde bronverbindingen meer heeft." confirmLabel="Rol wijzigen" confirmClassName="primary-button" /><ConfirmActionButton action={resetUserAction} fields={{ userId: user.id }} label={<Trash2 size={17} aria-hidden />} confirmTitle={`Verwijder ${user.displayName}?`} confirmText="Deze leraar wordt intern verwijderd en bij een volgende Smartschool-login opnieuw geregistreerd. Eigenaars en leraren met een gebruikte bronverbinding worden geweigerd." /></div></td></tr>; })}</tbody></table></UserTableRegion>
    </section>

    <section className="admin-card user-role-card" aria-labelledby="students-heading">
      <div className="card-heading"><div><h2 id="students-heading" className="heading-with-icon"><GraduationCap size={20} aria-hidden />Leerlingen</h2><p>Zoek, filter en beheer klas, toegang en accountstatus.</p></div><strong className="list-count">{countLabel(studentFiltered.length, students.length, "leerlingen")}</strong></div>
      <StudentListFilters params={params} classes={classGroups.map((group) => ({ id: group.externalGroupId, label: group.externalGroupName ?? group.externalGroupId }))} />
      <StudentResetControls classes={resettableClasses} totalStudents={students.length} resetClassAction={resetClassStudentsAction} resetAllAction={resetAllStudentsAction} />
      <UserTableRegion label="Leerlingen"><table className="managed-user-table student-user-table"><thead><tr><th>Naam</th><th>Voornaam</th><th>Klas</th><th>Kijkrechten</th><th>Status</th><th>Acties</th></tr></thead><tbody>{shownStudents.map((user) => <tr key={user.id}><NameCells user={user} /><td><AutoSubmitSelect action={updateUserClassAction} fields={{ userId: user.id }} name="classGroupId" value={user.classGroupOverrideId ?? ""} ariaLabel={`Klas van ${user.displayName}`} options={[{ value: "", label: user.automaticClassName ? `Automatisch (${user.automaticClassName})` : "Automatisch (Smartschool)" }, ...classGroups.map((group) => ({ value: group.externalGroupId, label: group.externalGroupName ?? group.externalGroupId }))]} /></td><td><StudentViewAccessBadges userId={user.id} access={access} spaces={spaces} /></td><td><StatusToggle user={user} /></td><td><div className="user-row-actions"><UserProfileButton profile={buildUserProfile(user, spaces, [], access, storageConnections, groupUsers)} /><ConfirmActionButton action={updateUserRoleAction} fields={{ userId: user.id, role: "teacher" }} label={<Star size={17} aria-hidden />} confirmTitle="Maak deze leerling leraar?" confirmText="De lokale rol wordt leraar. Beheerrechten worden niet automatisch toegekend." confirmLabel="Rol wijzigen" confirmClassName="primary-button" /><ConfirmActionButton action={resetUserAction} fields={{ userId: user.id }} label={<Trash2 size={17} aria-hidden />} confirmTitle={`Verwijder ${user.displayName}?`} confirmText="Deze leerling en de lokale Smartschool-, klas- en toegangsgegevens worden intern verwijderd. Bij een volgende Smartschool-login wordt de leerling opnieuw geregistreerd." /></div></td></tr>)}</tbody></table></UserTableRegion>
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

export function filterTeachers(
  users: ManagedUser[],
  params: UserListSearchParams,
  memberships: ManagedMembership[],
  access: ManagedUserAccess[],
  storageConnections: ManagedStorageConnection[],
): ManagedUser[] {
  const selectedSpaceId = params.teacherSpace;
  const connectedUserIds = new Set(storageConnections.map((connection) => connection.userId));
  const compareUsers = userComparator("last-asc");

  return users.filter((user) => {
    if (params.teacherStatus === "disabled" && user.status !== "disabled") return false;
    if (selectedSpaceId) {
      const hasManagementAccess = memberships.some((item) => item.userId === user.id && item.learningSpaceId === selectedSpaceId);
      const hasIndividualViewAccess = access.some((item) => item.userId === user.id && item.learningSpaceId === selectedSpaceId && item.individual);
      if (!hasManagementAccess && !hasIndividualViewAccess) return false;
    }
    return true;
  }).sort((left, right) => {
    if (params.teacherConnectionFirst === "1") {
      const connectionOrder = Number(connectedUserIds.has(right.id)) - Number(connectedUserIds.has(left.id));
      if (connectionOrder) return connectionOrder;
    }
    return compareUsers(left, right);
  });
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
  const ordered = [...memberships].sort((left, right) => {
    const roleOrder = Number(left.role === "editor") - Number(right.role === "editor");
    return roleOrder || compareSpaceOrder(left.learningSpaceId, right.learningSpaceId, spaces);
  });
  return <SpaceBadges items={ordered.map((membership) => {
    const space = spaces.find((item) => item.id === membership.learningSpaceId);
    const label = membership.role === "owner" ? "Eigenaar" : "Bewerker";
    return {
      id: membership.learningSpaceId,
      className: `teacher-role-badge teacher-role-badge-${membership.role}`,
      label: space?.shortLabel ?? space?.name ?? membership.learningSpaceId,
      title: `${label} van ${space?.name ?? membership.learningSpaceId}`,
      icon: membership.role === "owner" ? <KeyRound size={14} aria-hidden /> : <Pencil size={14} aria-hidden />,
      screenReaderLabel: label,
    };
  })} />;
}

function ViewAccessBadges({ userId, memberships, access, spaces }: { userId: string; memberships: ManagedMembership[]; access: ManagedUserAccess[]; spaces: LearningSpace[] }) {
  const managedSpaceIds = new Set(memberships.map((membership) => membership.learningSpaceId));
  const items = access
    .filter((item) => item.userId === userId && item.individual && !managedSpaceIds.has(item.learningSpaceId))
    .sort((left, right) => compareSpaceOrder(left.learningSpaceId, right.learningSpaceId, spaces))
    .map((item) => {
      const space = spaces.find((candidate) => candidate.id === item.learningSpaceId);
      return {
        id: item.learningSpaceId,
        className: "teacher-role-badge teacher-role-badge-viewer",
        label: space?.shortLabel ?? space?.name ?? item.learningSpaceId,
        title: `Kijker van ${space?.name ?? item.learningSpaceId}`,
        icon: <Eye size={14} aria-hidden />,
        screenReaderLabel: "Kijker",
      };
    });
  return <SpaceBadges items={items} />;
}
function StudentViewAccessBadges({ userId, access, spaces }: { userId: string; access: ManagedUserAccess[]; spaces: LearningSpace[] }) {
  const spaceIds = new Set(access
    .filter((item) => item.userId === userId && (item.individual || item.groupDerived))
    .map((item) => item.learningSpaceId));
  const items = [...spaceIds]
    .sort((left, right) => compareSpaceOrder(left, right, spaces))
    .map((spaceId) => {
      const space = spaces.find((candidate) => candidate.id === spaceId);
      return {
        id: spaceId,
        className: "teacher-role-badge teacher-role-badge-viewer",
        label: space?.shortLabel ?? space?.name ?? spaceId,
        title: `Kijkrecht voor ${space?.name ?? spaceId}`,
        icon: <Eye size={14} aria-hidden />,
        screenReaderLabel: "Kijkrecht",
      };
    });
  return <SpaceBadges items={items} />;
}

function SpaceBadges({ items }: { items: Array<{ id: string; className: string; label: string; title: string; icon: React.ReactNode; screenReaderLabel: string }> }) {
  if (!items.length) return <span className="muted-value">-</span>;
  const visible = items.slice(0, 3);
  const remaining = items.length - visible.length;
  return <div className="management-badges">{visible.map((item) => <span key={item.id} className={item.className} title={item.title}>{item.icon}{item.label}<span className="sr-only">, {item.screenReaderLabel}</span></span>)}{remaining > 0 ? <span className="management-space-badge-overflow" title={`${remaining} extra leeromgevingen`}>+ {remaining}</span> : null}</div>;
}

function compareSpaceOrder(leftId: string, rightId: string, spaces: LearningSpace[]): number {
  const leftIndex = spaces.findIndex((space) => space.id === leftId);
  const rightIndex = spaces.findIndex((space) => space.id === rightId);
  if (leftIndex !== rightIndex) return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex);
  return leftId.localeCompare(rightId, "nl-BE", { sensitivity: "base" });
}
function StorageBadges({ connections }: { connections: ManagedStorageConnection[] }) {
  const active = connections.filter((connection) => connection.status === "active");
  if (!active.length) return <span className="connection-badge connection-none"><X size={14} aria-hidden />Geen verbinding</span>;
  return <div className="connection-badges">{active.map((connection, index) => <span className={`connection-badge connection-${connection.provider}`} key={`${connection.provider}-${index}`}><Check size={14} aria-hidden />{connection.provider === "onedrive" ? "OneDrive" : "Google Drive"}</span>)}</div>;
}

export function buildUserProfile(
  user: ManagedUser,
  spaces: LearningSpace[],
  memberships: ManagedMembership[],
  access: ManagedUserAccess[],
  storageConnections: ManagedStorageConnection[],
  groupUsers: ManagedGroupUser[],
): UserProfileData {
  const managedSpaceIds = new Set(memberships.map((membership) => membership.learningSpaceId));
  const viewerSpaceIds = new Set(access
    .filter((item) => item.userId === user.id
      && (user.role === "teacher" ? item.individual && !managedSpaceIds.has(item.learningSpaceId) : item.individual || item.groupDerived))
    .map((item) => item.learningSpaceId));
  const profileSpaces = (ids: string[]) => ids
    .sort((left, right) => compareSpaceOrder(left, right, spaces))
    .map((id) => spaces.find((space) => space.id === id))
    .filter((space): space is LearningSpace => Boolean(space))
    .map((space) => ({ id: space.id, name: space.name, shortLabel: space.shortLabel }));
  const groups = new Map(groupUsers
    .filter((group) => group.userId === user.id && group.provider === "smartschool")
    .map((group) => [group.externalGroupId, group.externalGroupName ?? group.externalGroupId]));

  return {
    userId: user.id,
    role: user.role === "teacher" ? "teacher" : "student",
    firstName: user.firstName,
    lastName: user.lastName,
    className: user.effectiveClassName,
    groups: [...groups.values()].sort((left, right) => left.localeCompare(right, "nl-BE", { sensitivity: "base" })),
    connections: storageConnections.filter((connection) => connection.userId === user.id),
    ownerSpaces: profileSpaces(memberships.filter((membership) => membership.role === "owner").map((membership) => membership.learningSpaceId)),
    editorSpaces: profileSpaces(memberships.filter((membership) => membership.role === "editor").map((membership) => membership.learningSpaceId)),
    viewerSpaces: profileSpaces([...viewerSpaceIds]),
  };
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
