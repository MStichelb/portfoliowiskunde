import { Info, X } from "lucide-react";
import type { ReactNode } from "react";

import type { GlobalResourceIcon } from "@/lib/source-profile-config";
import { ConfiguredResourceIcon } from "./configured-resource-icon";
import styles from "./portfolio-resource-admin.module.css";

export function PortfolioInfoButton({ dialogId, label }: { dialogId: string; label: string }) {
  return <div className={styles.adminHeaderActions}>
    <a className={styles.infoButton} href={`#${dialogId}`} aria-label={label} title="Herkenningsregels"><Info size={17} aria-hidden /></a>
  </div>;
}

export function PortfolioInfoDialog({ dialogId, title = "Herkenningsregels", children }: { dialogId: string; title?: string; children: ReactNode }) {
  return <div id={dialogId} className={styles.modalTarget} role="dialog" aria-modal="true" aria-labelledby={`${dialogId}-title`}>
    <a href="#" className={styles.modalBackdrop} aria-label="Herkenningsregels sluiten" />
    <section className={styles.modalPanel}>
      <div className={styles.modalHeading}>
        <div>
          <h3 id={`${dialogId}-title`} className={styles.modalTitle}><Info size={18} aria-hidden />{title}</h3>
          <p className={styles.modalSubtitle}>Deze regels komen uit het actieve bronprofiel van de leeromgeving.</p>
        </div>
        <a href="#" className="icon-button" aria-label="Sluiten" title="Sluiten"><X size={18} aria-hidden /></a>
      </div>
      {children}
    </section>
  </div>;
}

export function RecognitionRuleCard({ title, icon, iconNode, rows }: {
  title: string;
  icon?: GlobalResourceIcon;
  iconNode?: ReactNode;
  rows: readonly { id: string; label: string; value: ReactNode }[];
}) {
  return <article className={styles.ruleItem}>
    <h4 className={styles.ruleTitle}>{iconNode ?? (icon ? <ConfiguredResourceIcon icon={icon} /> : null)}{title}</h4>
    <dl className={styles.ruleRows}>
      {rows.map((row) => <div className={styles.ruleRow} key={row.id}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
    </dl>
  </article>;
}
