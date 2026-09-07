"use client";

import { Crown, Pencil, UserRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { AdminLearningSpaceCardData } from "@/lib/admin-learning-space-overview";
import { cardColorStyle, DEFAULT_LEARNING_SPACE_COLOR } from "@/lib/ui-colors";

export function AdminLearningSpaceOverview({ cards }: { cards: AdminLearningSpaceCardData[] }) {
  const [showDetails, setShowDetails] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const activeCards = cards.filter((card) => !card.isArchived);
  const visibleCards = showArchive ? [...activeCards, ...cards.filter((card) => card.isArchived)] : activeCards;

  return <section className="admin-learning-space-overview" aria-label="Leeromgevingen">
    <div className="admin-learning-space-controls">
      <label><input type="checkbox" checked={showDetails} onChange={(event) => setShowDetails(event.target.checked)} />Toon details</label>
      <label><input type="checkbox" checked={showArchive} onChange={(event) => setShowArchive(event.target.checked)} />Toon archief</label>
    </div>
    <div className="portfolio-cards learning-space-cards">
      {visibleCards.map((card) => <AdminLearningSpaceCard key={card.id} card={card} showDetails={showDetails} />)}
    </div>
  </section>;
}

export function AdminLearningSpaceCard({ card, showDetails }: { card: AdminLearningSpaceCardData; showDetails: boolean }) {
  return <Link
    className={`portfolio-card color-card admin-space-card${card.isArchived ? " is-archived" : ""}`}
    style={cardColorStyle(card.cardColor, DEFAULT_LEARNING_SPACE_COLOR)}
    href={`/admin/${encodeURIComponent(card.slug)}`}
  >
    <span className="admin-space-card-heading">
      <span className="admin-space-short-label">{card.shortLabel}</span>
      <ExplicitRoleIcon role={card.currentUserRole} />
    </span>
    <strong>{card.displayName}</strong>
    <span className="admin-space-owner"><UserRound size={15} aria-hidden /><span>{card.ownerNames.length ? card.ownerNames.join(", ") : "-"}</span></span>
    {card.isArchived ? <span className="archived-space-badge">Gearchiveerd</span> : null}
    {showDetails ? <dl className="admin-space-details">
      {card.editorNames.length ? <Detail label="Bewerkers" value={card.editorNames.join(", ")} /> : null}
      {card.classGroups.length ? <Detail label="Klassen" value={card.classGroups.join(", ")} /> : null}
      <Detail label="Bron" value={card.primarySource} />
      {card.mirrorSource ? <Detail label="Mirror" value={card.mirrorSource} /> : null}
    </dl> : null}
  </Link>;
}

function ExplicitRoleIcon({ role }: { role: AdminLearningSpaceCardData["currentUserRole"] }) {
  if (role === "owner") return <span className="admin-space-role-icon" role="img" aria-label="Eigenaar" title="Eigenaar"><Crown size={17} aria-hidden /></span>;
  if (role === "editor") return <span className="admin-space-role-icon" role="img" aria-label="Bewerker" title="Bewerker"><Pencil size={16} aria-hidden /></span>;
  return null;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}
