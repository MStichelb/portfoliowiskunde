"use client";

import { useState } from "react";
import type { ChangelogEntry } from "@/data/changelog";
import { ChangelogEntries } from "./changelog-entries";

export function ChangelogHistory({ entries, canFilter }: { entries: ChangelogEntry[]; canFilter: boolean }) {
  const [filter, setFilter] = useState<"all" | "public" | "admin">("all");
  // entries are already authorized on the server, including for the Beheer filter.
  const visible = entries.filter((entry) => filter === "all" || (filter === "public"
    ? entry.audiences.includes("student")
    : entry.audiences.some((audience) => audience === "teacher" || audience === "superadmin")));
  return <>
    {canFilter ? <div className="changelog-filters" role="group" aria-label="Wijzigingen filteren">{([ ["all", "Alles"], ["public", "Publiek"], ["admin", "Beheer"] ] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div> : null}
    <ChangelogEntries entries={visible} />
  </>;
}
