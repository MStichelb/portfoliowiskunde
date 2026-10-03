"use client";

import { Archive, ArrowDown, ArrowUp, Crown, GripVertical, Pencil, UserRound } from "lucide-react";
import Link from "next/link";
import { useState, type DragEvent } from "react";

import type { AdminLearningSpaceCardData } from "@/lib/admin-learning-space-overview";
import { cardColorStyle, DEFAULT_LEARNING_SPACE_COLOR } from "@/lib/ui-colors";

export interface LearningSpaceOrderItem {
  id: string;
  shortLabel: string;
  displayName: string;
}

export function AdminLearningSpaceOverview({ cards, orderItems, orderAction }: {
  cards: AdminLearningSpaceCardData[];
  orderItems?: LearningSpaceOrderItem[];
  orderAction?: (formData: FormData) => void | Promise<void>;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [editingOrder, setEditingOrder] = useState(false);

  const reorderableItems = orderItems ?? cards.filter((card) => !card.isArchived);
  if (editingOrder && orderAction) {
    return <AdminLearningSpaceOrderEditor cards={reorderableItems} action={orderAction} onCancel={() => setEditingOrder(false)} />;
  }

  return <section className="admin-learning-space-overview" aria-label="Leeromgevingen">
    <div className="admin-learning-space-controls">
      <OverviewSwitch checked={showDetails} label="Toon details" onChange={setShowDetails} />
      <OverviewSwitch checked={showArchive} label="Toon archief" onChange={setShowArchive} />
      {orderAction && reorderableItems.length ? <button className="secondary-button compact-button" type="button" onClick={() => setEditingOrder(true)}>Volgorde aanpassen</button> : null}
    </div>
    <AdminLearningSpaceCardGrid cards={cards} showArchive={showArchive} showDetails={showDetails} />
  </section>;
}

export function AdminLearningSpaceOrderEditor({ cards, action, onCancel }: {
  cards: LearningSpaceOrderItem[];
  action: (formData: FormData) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const [orderedCards, setOrderedCards] = useState(cards);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const moveByOffset = (id: string, offset: -1 | 1) => setOrderedCards((current) => moveLearningSpaceCardByOffset(current, id, offset));
  const dropAt = (event: DragEvent<HTMLLIElement>, targetId: string) => {
    event.preventDefault();
    if (draggedId && draggedId !== targetId) setOrderedCards((current) => moveLearningSpaceCardTo(current, draggedId, targetId));
    setDraggedId(null);
  };
  const saveAndClose = async (formData: FormData) => {
    await action(formData);
    onCancel?.();
  };

  return <section className="admin-learning-space-overview learning-space-order-editor" aria-labelledby="learning-space-order-heading">
    <div className="card-heading learning-space-order-heading">
      <div><h2 id="learning-space-order-heading">Volgorde aanpassen</h2><p>Deze volgorde geldt alleen voor jou.</p></div>
    </div>
    <form action={saveAndClose}>
      <ol className="learning-space-order-list">
        {orderedCards.map((card, index) => <li
          className={`learning-space-order-row${draggedId === card.id ? " is-dragging" : ""}`}
          key={card.id}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => dropAt(event, card.id)}
        >
          <input type="hidden" name="learningSpaceId" value={card.id} />
          <button
            className="learning-space-drag-handle"
            type="button"
            draggable
            aria-label={`${card.displayName} verslepen`}
            title={`${card.displayName} verslepen`}
            onDragStart={(event) => {
              setDraggedId(card.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", card.id);
            }}
            onDragEnd={() => setDraggedId(null)}
          ><GripVertical size={19} aria-hidden /></button>
          <span className="learning-space-order-label"><strong>{card.shortLabel}</strong><span>{card.displayName}</span></span>
          <div className="order-controls">
            <button className="icon-button" type="button" disabled={index === 0} onClick={() => moveByOffset(card.id, -1)} aria-label="Leeromgeving omhoog verplaatsen" title="Leeromgeving omhoog verplaatsen"><ArrowUp size={16} aria-hidden /></button>
            <button className="icon-button" type="button" disabled={index === orderedCards.length - 1} onClick={() => moveByOffset(card.id, 1)} aria-label="Leeromgeving omlaag verplaatsen" title="Leeromgeving omlaag verplaatsen"><ArrowDown size={16} aria-hidden /></button>
          </div>
        </li>)}
      </ol>
      <div className="learning-space-order-actions">
        {onCancel ? <button className="secondary-button" type="button" onClick={onCancel}>Annuleren</button> : null}
        <button className="primary-button" type="submit">Volgorde opslaan</button>
      </div>
    </form>
  </section>;
}

export function moveLearningSpaceCardByOffset<T extends { id: string }>(cards: readonly T[], id: string, offset: -1 | 1): T[] {
  const sourceIndex = cards.findIndex((card) => card.id === id);
  const targetIndex = sourceIndex + offset;
  if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= cards.length) return [...cards];
  const moved = [...cards];
  const [card] = moved.splice(sourceIndex, 1);
  moved.splice(targetIndex, 0, card);
  return moved;
}

export function moveLearningSpaceCardTo<T extends { id: string }>(cards: readonly T[], draggedId: string, targetId: string): T[] {
  const sourceIndex = cards.findIndex((card) => card.id === draggedId);
  const targetIndex = cards.findIndex((card) => card.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return [...cards];
  const moved = [...cards];
  const [card] = moved.splice(sourceIndex, 1);
  moved.splice(targetIndex, 0, card);
  return moved;
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
