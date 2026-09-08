"use client";

import { Archive, Crown, Pencil, UserRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { AdminLearningSpaceCardData } from "@/lib/admin-learning-space-overview";
import { cardColorStyle, DEFAULT_LEARNING_SPACE_COLOR } from "@/lib/ui-colors";

export function AdminLearningSpaceOverview({ cards }: { cards: AdminLearningSpaceCardData[] }) {
  const [showDetails, setShowDetails] = useState(false);
  const [showArchive, setShowArchive] = useState(false);

  return <section className="admin-learning-space-overview" aria-label="Leeromgevingen">
    <div className="admin-learning-space-controls">
      <OverviewSwitch checked={showDetails} label="Toon details" onChange={setShowDetails} />
      <OverviewSwitch checked={showArchive} label="Toon archief" onChange={setShowArchive} />
    </div>
    <AdminLearningSpaceCardGrid cards={cards} showArchive={showArchive} showDetails={showDetails} />
  </section>;
}

export function AdminLearningSpaceCardGrid({ cards, showArchive, showDetails }: { cards: AdminLearningSpaceCardData[]; showArchive: boolean; showDetails: boolean }) {
  const visibleCards = cards.filter((card) => card.isArchived === showArchive);
  if (!visibleCards.length) return <p className="empty-state">{showArchive ? "Er zijn geen gearchiveerde leeromgevingen." : "Er zijn momenteel geen actieve leeromgevingen."}</p>;
  return <div className="portfolio-cards learning-space-cards">
    {visibleCards.map((card) => <AdminLearningSpaceCard key={card.id} card={card} showDetails={showDetails} />)}
  </div>;
}

export function AdminLearningSpaceCard({ card, showDetails }: { card: AdminLearningSpaceCardData; showDetails: boolean }) {
  return <Link
    className={`portfolio-card color-card admin-space-card${card.isArchived ? " is-archived" : ""}`}
    style={cardColorStyle(card.cardColor, DEFAULT_LEARNING_SPACE_COLOR)}
    href={`/admin/${encodeURIComponent(card.slug)}`}
  >
    <span className="admin-space-card-heading">
      <span className="admin-space-short-label">{card.shortLabel}{card.isArchived ? <span className="admin-space-archive-icon" role="img" aria-label="Gearchiveerd" title="Gearchiveerd"><Archive size={16} aria-hidden /></span> : null}</span>
      <ExplicitRoleIcon role={card.currentUserRole} />
    </span>
    <strong>{card.displayName}</strong>
    <span className="admin-space-owner"><UserRound size={15} aria-hidden /><span>{card.ownerNames.length ? card.ownerNames.join(", ") : "-"}</span></span>
    {showDetails ? <dl className="admin-space-details">
      {card.editorNames.length ? <Detail label="Bewerkers" value={card.editorNames.join(", ")} /> : null}
      {card.classGroups.length ? <Detail label="Klassen" value={card.classGroups.join(", ")} /> : null}
      {card.extraGroups.length ? <Detail label="Extra" value={card.extraGroups.join(", ")} /> : null}
      <Detail label="Bron" value={card.primarySource} />
      {card.mirrorSource ? <Detail label="Mirror" value={card.mirrorSource} /> : null}
    </dl> : null}
  </Link>;
}

function OverviewSwitch({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <button className={`editor-permissions-toggle admin-overview-switch${checked ? " is-enabled" : ""}`} type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
    <span className="editor-permissions-track" aria-hidden><span /></span>
    <span>{label}</span>
  </button>;
}

function ExplicitRoleIcon({ role }: { role: AdminLearningSpaceCardData["currentUserRole"] }) {
  if (role === "owner") return <span className="admin-space-role-icon" role="img" aria-label="Eigenaar" title="Eigenaar"><Crown size={17} aria-hidden /></span>;
  if (role === "editor") return <span className="admin-space-role-icon" role="img" aria-label="Bewerker" title="Bewerker"><Pencil size={16} aria-hidden /></span>;
  return null;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}
