"use client";

import { Check, CircleUserRound, Eye, KeyRound, Pencil, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { Ref } from "react";

export interface UserProfileSpace {
  id: string;
  name: string;
  shortLabel: string;
}

export interface UserProfileData {
  userId: string;
  role: "teacher" | "student";
  firstName: string | null;
  lastName: string | null;
  className: string | null;
  groups: string[];
  connections: Array<{ provider: "onedrive" | "google_drive"; status: "active" | "disconnected" }>;
  ownerSpaces: UserProfileSpace[];
  editorSpaces: UserProfileSpace[];
  viewerSpaces: UserProfileSpace[];
}

export function UserProfileButton({ profile }: { profile: UserProfileData }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "gebruiker";
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
    <button ref={triggerRef} className="icon-button" type="button" onClick={() => setOpen(true)} aria-label={`Profiel van ${displayName}`} title="Profiel bekijken"><CircleUserRound size={17} aria-hidden /></button>
    {open ? <div className="confirm-backdrop" role="presentation"><UserProfileDialogContent profile={profile} titleId={titleId} closeButtonRef={closeRef} onClose={close} /></div> : null}
  </>;
}

export function UserProfileDialogContent({ profile, titleId, closeButtonRef, onClose = () => undefined }: { profile: UserProfileData; titleId: string; closeButtonRef?: Ref<HTMLButtonElement>; onClose?: () => void }) {
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "Onbekende gebruiker";
  const identityDetail = profile.role === "teacher" ? "Leraar" : profile.className ? `Leerling · ${profile.className}` : "Leerling";

  return <div className="user-profile-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
    <div className="user-profile-dialog-heading">
      <h2 id={titleId}>{profile.role === "teacher" ? "Leraarprofiel" : "Leerlingprofiel"}</h2>
      <button ref={closeButtonRef} className="icon-button" type="button" onClick={onClose} aria-label="Sluiten" title="Sluiten"><X size={18} aria-hidden /></button>
    </div>
    <div className="user-profile-content">
      <div className="user-profile-identity">
        <strong>{fullName}</strong>
        <span>{identityDetail}</span>
      </div>
      <dl className="user-profile-grid">
        <ProfileRow label="Groepen" empty={profile.groups.length === 0} emptyLabel="Geen opgeslagen Smartschoolgroepen"><NeutralBadges values={profile.groups} /></ProfileRow>
        {profile.role === "teacher" ? <ProfileRow label="Verbindingen" empty={profile.connections.length === 0} emptyLabel="Geen persoonlijke verbindingen"><ConnectionBadges connections={profile.connections} /></ProfileRow> : null}
        {profile.role === "teacher" ? <ProfileRow label="Eigenaar van" empty={profile.ownerSpaces.length === 0} emptyLabel="Geen leeromgevingen"><SpaceBadges spaces={profile.ownerSpaces} role="owner" /></ProfileRow> : null}
        {profile.role === "teacher" ? <ProfileRow label="Bewerker van" empty={profile.editorSpaces.length === 0} emptyLabel="Geen leeromgevingen"><SpaceBadges spaces={profile.editorSpaces} role="editor" /></ProfileRow> : null}
        <ProfileRow label={profile.role === "teacher" ? "Kijker van" : "Kijkrechten"} empty={profile.viewerSpaces.length === 0} emptyLabel="Geen leeromgevingen"><SpaceBadges spaces={profile.viewerSpaces} role="viewer" /></ProfileRow>
      </dl>
    </div>
  </div>;
}

function ProfileRow({ label, empty, emptyLabel, children }: { label: string; empty: boolean; emptyLabel: string; children: React.ReactNode }) {
  return <><dt>{label}</dt><dd>{empty ? <span className="muted-value">{emptyLabel}</span> : children}</dd></>;
}

function NeutralBadges({ values }: { values: string[] }) {
  if (!values.length) return null;
  return <div className="management-badges">{values.map((value) => <span key={value}>{value}</span>)}</div>;
}

function ConnectionBadges({ connections }: { connections: UserProfileData["connections"] }) {
  if (!connections.length) return null;
  return <div className="connection-badges">{connections.map((connection) => <span className={`connection-badge connection-${connection.status === "active" ? connection.provider : "none"}`} key={connection.provider}>{connection.status === "active" ? <Check size={14} aria-hidden /> : <X size={14} aria-hidden />}{connection.provider === "onedrive" ? "OneDrive" : "Google Drive"} · {connection.status === "active" ? "Verbonden" : "Niet verbonden"}</span>)}</div>;
}

function SpaceBadges({ spaces, role }: { spaces: UserProfileSpace[]; role: "owner" | "editor" | "viewer" }) {
  if (!spaces.length) return null;
  const Icon = role === "owner" ? KeyRound : role === "editor" ? Pencil : Eye;
  return <div className="management-badges">{spaces.map((space) => <span className={`teacher-role-badge teacher-role-badge-${role}`} key={space.id} title={space.name}><Icon size={14} aria-hidden />{space.shortLabel || space.name}</span>)}</div>;
}
