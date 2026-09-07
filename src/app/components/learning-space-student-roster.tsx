"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import type { LearningSpaceStudentRosterEntry } from "@/lib/learning-space-student-roster";

export function LearningSpaceStudentRoster({ students }: { students: LearningSpaceStudentRosterEntry[] }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const groupOptions = useMemo(() => rosterGroupOptions(students), [students]);
  const visibleStudents = useMemo(
    () => filterLearningSpaceStudentRoster(students, query, group),
    [group, query, students],
  );

  if (students.length === 0) {
    return <p className="empty-state compact-empty">Nog geen leerlingen met toegang tot deze leeromgeving.</p>;
  }

  return <>
    <div className="learning-space-roster-filters" aria-label="Leerlingenrooster filteren">
      <label className="user-search-field">
        <Search size={17} aria-hidden />
        <span className="sr-only">Zoeken op naam, voornaam of klas/groep</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Zoek op naam, voornaam of klas/groep" />
      </label>
      <label className="filter-control learning-space-roster-group-filter">
        <span className="sr-only">Klas/groep</span>
        <select value={group} onChange={(event) => setGroup(event.target.value)}>
          <option value="">Alle</option>
          {groupOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
    </div>
    {visibleStudents.length ? <div className="admin-summary-table" role="region" aria-label="Leerlingen met toegang" tabIndex={0}>
      <table>
        <thead><tr><th>Naam</th><th>Voornaam</th><th>Klas/groep</th><th>Toegang</th></tr></thead>
        <tbody>{visibleStudents.map((student) => <tr key={student.userId}>
          <td>
            <span className="roster-student-name">
              {student.lastName ?? student.displayName}
              {student.status === "disabled" ? <span className="account-status-label disabled">Uitgeschakeld</span> : null}
            </span>
          </td>
          <td>{student.firstName ?? "-"}</td>
          <td>{formatRosterGroupNames(student) || "-"}</td>
          <td><div className="management-badges">
            {student.groupDerivedAccess ? <span className="roster-access-badge-group">Groep</span> : null}
            {student.individualAccess ? <span className="roster-access-badge-individual">Individueel</span> : null}
          </div></td>
        </tr>)}</tbody>
      </table>
    </div> : <p className="empty-state compact-empty">Geen leerlingen gevonden.</p>}
  </>;
}

export function filterLearningSpaceStudentRoster(
  students: LearningSpaceStudentRosterEntry[],
  query: string,
  group: string,
): LearningSpaceStudentRosterEntry[] {
  const needle = normalized(query);
  const selectedGroup = normalized(group);
  return students.filter((student) => {
    const groupNames = rosterGroupNames(student);
    const matchesGroup = !selectedGroup || groupNames.some((name) => normalized(name) === selectedGroup);
    const searchable = normalized([
      student.displayName,
      student.firstName,
      student.lastName,
      ...groupNames,
    ].filter(Boolean).join(" "));
    return matchesGroup && (!needle || searchable.includes(needle));
  });
}

export function formatRosterGroupNames(student: LearningSpaceStudentRosterEntry): string {
  return rosterGroupNames(student).join(" • ");
}

function rosterGroupOptions(students: LearningSpaceStudentRosterEntry[]): string[] {
  const options = new Map<string, string>();
  for (const student of students) {
    for (const name of rosterGroupNames(student)) options.set(normalized(name), name);
  }
  return [...options.values()].sort((left, right) => naturalText.compare(left, right));
}

function rosterGroupNames(student: LearningSpaceStudentRosterEntry): string[] {
  const names = new Map<string, string>();
  if (student.className?.trim()) names.set(normalized(student.className), student.className.trim());
  for (const groupName of student.relevantGroupNames) {
    if (groupName.trim()) names.set(normalized(groupName), groupName.trim());
  }
  return [...names.values()];
}

function normalized(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("nl-BE");
}

const naturalText = new Intl.Collator("nl-BE", { numeric: true, sensitivity: "base" });
