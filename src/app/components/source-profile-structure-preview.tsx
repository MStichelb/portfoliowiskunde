"use client";

import { useState, type CSSProperties } from "react";
import { useSourceProfileTerminology } from "./source-profile-presentation";

import { FileText, Folder, Info } from "lucide-react";

import styles from "./portfolio-resource-scanner-v2.module.css";
import type { GlobalResourceConfig, ExerciseLevelRecognitionConfig, ExerciseResourceConfig, ExerciseScannerConfig, PortfolioScannerConfig } from "@/lib/source-profile-config";
import {
  buildSourceStructurePreview,
  type SourceStructurePreviewNode,
} from "@/lib/source-profile-structure-preview";

export function SourceProfileStructurePreview({
  scanner,
  portfolioScanner,
  resources,
  globalResources = [],
  levelRecognition,
  headingId = "source-structure-preview-heading",
}: {
  scanner: ExerciseScannerConfig;
  portfolioScanner: PortfolioScannerConfig;
  resources: readonly ExerciseResourceConfig[];
  globalResources?: readonly GlobalResourceConfig[];
  levelRecognition: ExerciseLevelRecognitionConfig;
  headingId?: string;
}) {
  const [showInterpretation, setShowInterpretation] = useState(false);
  const terminology = useSourceProfileTerminology();
  const preview = buildSourceStructurePreview(scanner, resources, levelRecognition, portfolioScanner, terminology, globalResources);

  return <section className={styles.structurePreview} aria-labelledby={headingId}>
    <div className={styles.structurePreviewHeading}>
      <h3 id={headingId}>Voorbeeld van je bronmap</h3>
      <p>Een voorbeeld op basis van je instellingen.</p>
      <button className={`editor-permissions-toggle admin-overview-switch ${styles.interpretationToggle}${showInterpretation ? " is-enabled" : ""}`} type="button" role="switch" aria-checked={showInterpretation} onClick={() => setShowInterpretation(!showInterpretation)}>
        <span className="editor-permissions-track" aria-hidden><span /></span>
        <span>Interpretatie tonen</span>
      </button>
    </div>
    <div className={styles.structurePreviewBody}>
      <div className={styles.structurePreviewIntro}>
        <div className={styles.structurePreviewIntroIcon}><Info size={17} aria-hidden /></div>
        <div>
          <strong>{preview.modeLabel}</strong>
          <p>{preview.explanation}</p>
          <p className={styles.structurePreviewMuted}>Dit is één geldig, gegenereerd voorbeeld, geen analyse van je echte bronmap. Je eigen namen mogen verschillen zolang ze voldoen aan de herkenningsregels die je hierboven instelt.</p>
        </div>
      </div>

      <div className={`${styles.structureTree}${showInterpretation ? ` ${styles.structureTreeWithInterpretation}` : ""}`} role="group" aria-label="Voorbeeld van de mapstructuur">
        {showInterpretation ? <div className={styles.structureTreeColumnHeadings}><strong>Bronstructuur</strong><strong>Interpretatie</strong></div> : null}
        <PreviewTreeNode node={preview.root} depth={0} showInterpretation={showInterpretation} />
      </div>

      {preview.notes.length > 0 ? <div className={styles.structurePreviewNotes}>
        {preview.notes.map((note) => <p key={note}><Info size={14} aria-hidden />{note}</p>)}
      </div> : null}
    </div>
  </section>;
}

function PreviewTreeNode({ node, depth, showInterpretation }: { node: SourceStructurePreviewNode; depth: number; showInterpretation: boolean }) {
  const Icon = node.kind === "folder" ? Folder : FileText;
  return <div className={styles.structureTreeNode}>
    <div className={styles.structureTreeRow} style={{ "--source-tree-indent": `${depth * 1.25}rem` } as CSSProperties}>
      <div className={styles.structureTreeSource}><Icon size={16} aria-hidden /><span>{node.name}</span></div>
      {showInterpretation && node.interpretation?.length ? <small className={styles.structureInterpretation}>{node.interpretation.join(" · ")}</small> : null}
    </div>
    {node.children?.map((child, index) => <PreviewTreeNode key={`${child.kind}:${child.name}:${index}`} node={child} depth={depth + 1} showInterpretation={showInterpretation} />)}
  </div>;
}
