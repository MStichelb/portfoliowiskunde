"use client";

import { ChevronDown, FileText, Folder, Info } from "lucide-react";

import styles from "./portfolio-resource-scanner-v2.module.css";
import type { ExerciseResourceConfig, ExerciseScannerConfig } from "@/lib/source-profile-config";
import {
  buildSourceStructurePreview,
  type SourceStructurePreviewNode,
} from "@/lib/source-profile-structure-preview";

export function SourceProfileStructurePreview({
  scanner,
  resources,
}: {
  scanner: ExerciseScannerConfig;
  resources: readonly ExerciseResourceConfig[];
}) {
  const preview = buildSourceStructurePreview(scanner, resources);

  return <section className={styles.structurePreview} aria-labelledby="source-structure-preview-heading">
    <details open>
      <summary className={styles.structurePreviewSummary}>
        <span>
          <strong id="source-structure-preview-heading">Zo kan je Drive-map eruitzien</strong>
          <small>Een concreet voorbeeld op basis van je instellingen</small>
        </span>
        <ChevronDown size={18} aria-hidden className={styles.structurePreviewChevron} />
      </summary>

      <div className={styles.structurePreviewBody}>
        <div className={styles.structurePreviewIntro}>
          <div className={styles.structurePreviewIntroIcon}><Info size={17} aria-hidden /></div>
          <div>
            <strong>{preview.modeLabel}</strong>
            <p>{preview.explanation}</p>
            <p className={styles.structurePreviewMuted}>Dit is één geldig voorbeeld. Je eigen namen mogen verschillen zolang ze voldoen aan de herkenningsregels die je hierboven instelt.</p>
          </div>
        </div>

        <div className={styles.structureTree} role="group" aria-label="Voorbeeld van de mapstructuur">
          <PreviewTreeNode node={preview.root} depth={0} />
        </div>

        {preview.notes.length > 0 ? <div className={styles.structurePreviewNotes}>
          {preview.notes.map((note) => <p key={note}><Info size={14} aria-hidden />{note}</p>)}
        </div> : null}
      </div>
    </details>
  </section>;
}

function PreviewTreeNode({ node, depth }: { node: SourceStructurePreviewNode; depth: number }) {
  const Icon = node.kind === "folder" ? Folder : FileText;
  return <div className={styles.structureTreeNode}>
    <div className={styles.structureTreeRow} style={{ paddingInlineStart: `${depth * 1.25}rem` }}>
      <Icon size={16} aria-hidden />
      <span>{node.name}</span>
    </div>
    {node.children?.map((child, index) => <PreviewTreeNode key={`${child.kind}:${child.name}:${index}`} node={child} depth={depth + 1} />)}
  </div>;
}
