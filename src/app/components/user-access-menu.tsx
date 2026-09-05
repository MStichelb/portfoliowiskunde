"use client";

import { GraduationCap, KeyRound, Star, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { Ref } from "react";

export interface UserAccessSpace {
  id: string;
  name: string;
  shortLabel: string;
  groupDerived: boolean;
  individual: boolean;
  managementRole: "owner" | "editor" | null;
}

interface UserAccessProps {
  userId: string;
  userName: string;
  userRole: "teacher" | "student";
  spaces: UserAccessSpace[];
  action: (formData: FormData) => void | Promise<void>;
}

export function UserAccessMenu({ userId, userName, userRole, spaces, action }: UserAccessProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const individualCount = spaces.filter((space) => space.individual).length;
  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [close, open]);

  return <>
    <button ref={triggerRef} className="user-access-trigger" type="button" onClick={() => setOpen(true)} aria-label={`Toegang van ${userName} beheren`}>
      <KeyRound size={16} aria-hidden />Toegang{individualCount ? <span>{individualCount}</span> : null}
    </button>
    {open ? <div className="confirm-backdrop" role="presentation">
      <UserAccessDialogContent
        userId={userId}
        userName={userName}
        userRole={userRole}
        spaces={spaces}
        action={action}
        titleId={titleId}
        closeButtonRef={closeRef}
        onClose={close}
      />
    </div> : null}
  </>;
}

export function UserAccessDialogContent({
  userId,
  userName,
  userRole,
  spaces,
  action,
  titleId,
  closeButtonRef,
  onClose = () => undefined,
}: UserAccessProps & {
  titleId: string;
  closeButtonRef?: Ref<HTMLButtonElement>;
  onClose?: () => void;
}) {
  return <div className="user-access-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
    <div className="user-access-dialog-heading">
      <h2 id={titleId}>
        {userRole === "teacher" ? <Star size={20} aria-hidden /> : <GraduationCap size={20} aria-hidden />}
        Kijkrechten instellen voor {userName}
      </h2>
      <button ref={closeButtonRef} className="icon-button" type="button" onClick={onClose} aria-label="Sluiten" title="Sluiten"><X size={18} aria-hidden /></button>
    </div>
    <div className="user-access-list">
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
  </div>;
}
