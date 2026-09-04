"use client";

import { KeyRound, X } from "lucide-react";

export interface UserAccessSpace {
  id: string;
  name: string;
  shortLabel: string;
  groupDerived: boolean;
  individual: boolean;
  managementRole: "owner" | "editor" | null;
}

export function UserAccessMenu({
  userId,
  userName,
  spaces,
  action,
}: {
  userId: string;
  userName: string;
  spaces: UserAccessSpace[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const individualCount = spaces.filter((space) => space.individual).length;
  return <details className="user-access-menu">
    <summary aria-label={`Toegang van ${userName} beheren`}><KeyRound size={16} aria-hidden />Toegang{individualCount ? <span>{individualCount}</span> : null}</summary>
    <div className="user-access-popover">
      {spaces.map((space) => {
        const inherited = space.groupDerived || Boolean(space.managementRole);
        const source = space.groupDerived
          ? "Automatisch via Smartschoolgroep"
          : space.managementRole === "owner"
            ? "Via beheerrecht als eigenaar"
            : space.managementRole === "editor"
              ? "Via beheerrecht als editor"
              : null;
        return <div className="user-access-row" key={space.id}>
          <div><strong>{space.shortLabel || space.name}</strong>{source ? <small>{source}</small> : <small>Individuele extra toegang</small>}</div>
          {inherited ? <span className="inherited-access-control" title={source ?? undefined}><input type="checkbox" checked disabled aria-label={`${space.name}: ${source}`} />{space.individual ? <form action={action}><input type="hidden" name="userId" value={userId} /><input type="hidden" name="learningSpaceId" value={space.id} /><input type="hidden" name="enabled" value="false" /><button className="mini-icon-button" type="submit" aria-label={`Overbodige individuele toegang tot ${space.name} verwijderen`} title="Individuele extra toegang verwijderen"><X size={14} aria-hidden /></button></form> : null}</span> : <form action={action}><input type="hidden" name="userId" value={userId} /><input type="hidden" name="learningSpaceId" value={space.id} /><input type="checkbox" name="enabled" value="true" defaultChecked={space.individual} aria-label={`Individuele toegang tot ${space.name}`} onChange={(event) => event.currentTarget.form?.requestSubmit()} /></form>}
        </div>;
      })}
    </div>
  </details>;
}
