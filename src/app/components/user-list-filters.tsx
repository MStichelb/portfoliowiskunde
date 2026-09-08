"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { UserListSearchParams } from "./user-management-view";

interface ClassOption {
  id: string;
  label: string;
}

interface LearningSpaceOption {
  id: string;
  label: string;
}

export type FilterUpdate = Record<string, string | string[] | null>;

export function TeacherListFilters({ params, spaces }: { params: UserListSearchParams; spaces: LearningSpaceOption[] }) {
  const update = useImmediateFilters();
  return <div className="user-filter-bar teacher-filter-bar" aria-label="Leraren filteren">
    <label className="filter-control teacher-space-filter"><select value={params.teacherSpace ?? ""} onChange={(event) => update({ teacherSpace: event.target.value || null })}><option value="">Alle leeromgevingen</option>{spaces.map((space) => <option key={space.id} value={space.id}>{space.label}</option>)}</select></label>
    <label className="user-filter-checkbox"><input type="checkbox" checked={params.teacherStatus === "disabled"} onChange={(event) => update({ teacherStatus: event.target.checked ? "disabled" : null })} />Uitgeschakeld</label>
    <label className="user-filter-checkbox"><input type="checkbox" checked={params.teacherConnectionFirst === "1"} onChange={(event) => update({ teacherConnectionFirst: event.target.checked ? "1" : null })} />Verbinding eerst</label>
  </div>;
}

export function StudentListFilters({ params, classes }: { params: UserListSearchParams; classes: ClassOption[] }) {
  const selectedClasses = stringValues(params.class);
  return <StudentListFilterFields key={JSON.stringify([params.q ?? "", selectedClasses])} params={params} classes={classes} />;
}

function StudentListFilterFields({ params, classes }: { params: UserListSearchParams; classes: ClassOption[] }) {
  const update = useImmediateFilters();
  const [query, setQuery] = useState(params.q ?? "");
  const [selectedClasses, setSelectedClasses] = useState(stringValues(params.class));

  useEffect(() => {
    if (query === (params.q ?? "")) return;
    const timeout = window.setTimeout(() => update({ q: query.trim() || null }), 400);
    return () => window.clearTimeout(timeout);
  }, [params.q, query, update]);

  function updateClass(classId: string, checked: boolean) {
    const next = new Set(selectedClasses);
    if (checked) next.add(classId);
    else next.delete(classId);
    const values = [...next];
    setSelectedClasses(values);
    update({ class: values, q: query.trim() || null });
  }

  return <div className="student-filter-panel" aria-label="Leerlingen filteren">
    <label className="filter-control filter-sort">Sortering<select value={params.sort ?? "last-asc"} onChange={(event) => update({ sort: event.target.value, q: query.trim() || null })}><option value="last-asc">Naam A-Z</option><option value="last-desc">Naam Z-A</option><option value="first-asc">Voornaam A-Z</option><option value="first-desc">Voornaam Z-A</option></select></label>
    <label className="user-search-field"><Search size={17} aria-hidden /><span className="sr-only">Zoeken op naam of voornaam</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Zoek op naam of voornaam" /></label>
    <details className="class-filter"><summary>Klassen{selectedClasses.length ? ` (${selectedClasses.length})` : ""}</summary><div>{classes.map((item) => <label key={item.id}><input type="checkbox" checked={selectedClasses.includes(item.id)} onChange={(event) => updateClass(item.id, event.target.checked)} />{item.label}</label>)}</div></details>
    <label className="user-filter-checkbox"><input type="checkbox" checked={params.status === "disabled"} onChange={(event) => update({ status: event.target.checked ? "disabled" : null, q: query.trim() || null })} />Uitgeschakeld</label>
    <label className="user-filter-checkbox"><input type="checkbox" checked={params.access === "with"} onChange={(event) => update({ access: event.target.checked ? "with" : null, q: query.trim() || null })} />Individuele toegang</label>
    <label className="filter-control filter-page-size">Per pagina<select value={params.size ?? "25"} onChange={(event) => update({ size: event.target.value, q: query.trim() || null })}><option value="25">25</option><option value="50">50</option><option value="100">100</option><option value="all">Alle</option></select></label>
  </div>;
}

function useImmediateFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = useRef(new URLSearchParams(searchParams.toString()));

  useEffect(() => {
    current.current = new URLSearchParams(searchParams.toString());
  }, [searchParams]);

  return useCallback((updates: FilterUpdate) => {
    const next = updateUserFilterParams(current.current, updates);
    current.current = next;
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router]);
}

export function updateUserFilterParams(current: URLSearchParams, updates: FilterUpdate): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(updates)) {
    next.delete(key);
    if (Array.isArray(value)) value.forEach((item) => next.append(key, item));
    else if (value) next.set(key, value);
  }
  next.delete("page");
  return next;
}

function stringValues(value: string | string[] | undefined): string[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}
