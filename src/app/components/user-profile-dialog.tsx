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
      <div className="user-profile-basics">
        <ProfileValue label="Naam" value={profile.lastName} />
        <ProfileValue label="Voornaam" value={profile.firstName} />
        {profile.role === "student" ? <ProfileValue label="Klas" value={profile.className} /> : null}
      </div>
      <ProfileSection title="Groepen">
        <ProfileList empty={profile.groups.length === 0} emptyLabel="Geen opgeslagen Smartschoolgroepen"><NeutralBadges values={profile.groups} /></ProfileList>
      </ProfileSection>
      {profile.role === "teacher" ? <ProfileSection title="Verbindingen">
        <ProfileList empty={profile.connections.length === 0} emptyLabel="Geen persoonlijke verbindingen"><ConnectionBadges connections={profile.connections} /></ProfileList>
      </ProfileSection> : null}
      {profile.role === "teacher" ? <ProfileSection title="Rechten">
        <div className="user-profile-rights">
          <ProfileList label="Eigenaar van" empty={profile.ownerSpaces.length === 0} emptyLabel="Geen leeromgevingen"><SpaceBadges spaces={profile.ownerSpaces} role="owner" /></ProfileList>
          <ProfileList label="Bewerker van" empty={profile.editorSpaces.length === 0} emptyLabel="Geen leeromgevingen"><SpaceBadges spaces={profile.editorSpaces} role="editor" /></ProfileList>
          <ProfileList label="Kijker van" empty={profile.viewerSpaces.length === 0} emptyLabel="Geen leeromgevingen"><SpaceBadges spaces={profile.viewerSpaces} role="viewer" /></ProfileList>
        </div>
      </ProfileSection> : <ProfileSection title="Kijkrechten">
        <ProfileList empty={profile.viewerSpaces.length === 0} emptyLabel="Geen leeromgevingen"><SpaceBadges spaces={profile.viewerSpaces} role="viewer" /></ProfileList>
      </ProfileSection>}
    </div>
  </div>;
}

function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="user-profile-section"><h3>{title}</h3>{children}</section>;
}

function ProfileValue({ label, value }: { label: string; value: string | null }) {
  return <div className="user-profile-field"><strong>{label}</strong><span>{value || "Niet bekend"}</span></div>;
}

function ProfileList({ label, empty, emptyLabel, children }: { label?: string; empty: boolean; emptyLabel: string; children: React.ReactNode }) {
  return <div className="user-profile-list">{label ? <strong>{label}</strong> : null}{empty ? <span className="muted-value">{emptyLabel}</span> : children}</div>;
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
