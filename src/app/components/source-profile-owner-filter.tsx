"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { SourceProfileOwnerOption } from "@/lib/source-profiles";

export function SourceProfileOwnerFilter({ owners, selectedOwnerId }: { owners: SourceProfileOwnerOption[]; selectedOwnerId: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  function selectOwner(ownerId: string) {
    const next = updateSourceProfileOwnerFilterParams(searchParams, ownerId);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return <div className="source-profile-owner-filter">
    <label className="filter-control">Gebruiker<select value={selectedOwnerId ?? ""} onChange={(event) => selectOwner(event.target.value)}>
      <option value="">Alle gebruikers</option>
      {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.label}</option>)}
    </select></label>
  </div>;
}

export function updateSourceProfileOwnerFilterParams(current: Pick<URLSearchParams, "toString">, ownerId: string): URLSearchParams {
  const next = new URLSearchParams(current.toString());
  next.set("tab", "editor");
  if (ownerId) next.set("owner", ownerId);
  else next.delete("owner");
  for (const key of ["profile", "copyProfile", "linkProfile", "error", "saved"]) next.delete(key);
  return next;
}
