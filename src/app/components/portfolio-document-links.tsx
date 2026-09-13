import { Info, X } from "lucide-react";

import type { GlobalResourceFileRecognition } from "@/lib/source-profile-config";
import type { PortfolioGlobalResource } from "@/lib/repositories";

import { ConfiguredResourceIcon } from "./configured-resource-icon";
import styles from "./portfolio-resource-admin.module.css";
import scannerStyles from "./portfolio-resource-scanner-v2.module.css";
import { portfolioExternalLinkDialogId, portfolioResourceRulesDialogId } from "./portfolio-resource-dialog-ids";

const operatorLabels: Record<GlobalResourceFileRecognition["operator"], string> = {
  starts_with: "Bestandsnaam begint met",
  contains: "Bestandsnaam bevat",
  ends_with: "Bestandsnaam eindigt op",
};

export function PortfolioDocumentLinks({
  portfolioId,
  spaceSlug,
  resources,
  admin = false,
}: {
  portfolioId: string;
  spaceSlug?: string;
  resources: readonly PortfolioGlobalResource[];
  admin?: boolean;
}) {
  const portfolioBase = `${admin ? "/api/admin" : "/api"}/portfolio-assets/${encodeURIComponent(portfolioId)}`;
  const resourceBase = `${admin ? "/api/admin" : "/api"}/resource-assets`;
  const query = spaceSlug ? `?space=${encodeURIComponent(spaceSlug)}` : "";
  const sourceHref = (resource: PortfolioGlobalResource) => {
    if (resource.kind !== "source_file" || !resource.available) return null;
    if (resource.documentKind) return `${portfolioBase}/${resource.documentKind}${query}`;
    if (resource.assetId) return `${resourceBase}/${encodeURIComponent(resource.assetId)}${query}`;
    return null;
  };

  if (admin) {
    const rulesDialogId = portfolioResourceRulesDialogId(portfolioId);
    const sourceResources = resources.filter((resource) => resource.kind === "source_file");

    return <>
      <div className={styles.adminHeaderActions}>
        <a className={styles.infoButton} href={`#${rulesDialogId}`} aria-label="Herkenningsregels voor documenten bekijken" title="Herkenningsregels">
          <Info size={17} aria-hidden />
        </a>
      </div>

      <div className="document-actions">
        {resources.map((resource) => {
          if (resource.kind === "external_link") {
            const stateClass = resource.available ? "" : ` ${styles.missingResource}`;
            return <div className={scannerStyles.resourceAction} key={resource.id}>
              <small className={scannerStyles.resourceKindLabel}>Link</small>
              <a
                className={`document-button admin-document-button ${styles.externalResource}${stateClass}`}
                href={`#${portfolioExternalLinkDialogId(portfolioId, resource.id)}`}
                data-resource-state={resource.available ? "available" : "missing"}
                aria-label={resource.available ? `${resource.label} beheren` : `${resource.label} instellen`}
              >
                <ConfiguredResourceIcon icon={resource.icon} />
                {resource.label}
              </a>
            </div>;
          }

          const href = sourceHref(resource);
          if (href) {
            return <div className={scannerStyles.resourceAction} key={resource.id}>
              <small className={scannerStyles.resourceKindLabel}>Bestand</small>
              <a
                className="document-button admin-document-button"
                href={href}
                target="_blank"
                rel="noreferrer"
                data-resource-state="available"
              >
                <ConfiguredResourceIcon icon={resource.icon} />
                {resource.label}
              </a>
            </div>;
          }

          return <div className={scannerStyles.resourceAction} key={resource.id}>
            <small className={scannerStyles.resourceKindLabel}>Bestand</small>
            <span
              className={`document-button admin-document-button ${styles.missingResource} ${styles.missingSourceResource}`}
              data-resource-state="missing"
              aria-disabled="true"
              title="Bestand niet gevonden volgens de ingestelde herkenningsregel"
            >
              <ConfiguredResourceIcon icon={resource.icon} />
              {resource.label}
            </span>
          </div>;
        })}
      </div>

      <div id={rulesDialogId} className={styles.modalTarget} role="dialog" aria-modal="true" aria-labelledby={`${rulesDialogId}-title`}>
        <a href="#" className={styles.modalBackdrop} aria-label="Herkenningsregels sluiten" />
        <section className={styles.modalPanel}>
          <div className={styles.modalHeading}>
            <div>
              <h3 id={`${rulesDialogId}-title`} className={styles.modalTitle}><Info size={18} aria-hidden />Herkenningsregels</h3>
              <p className={styles.modalSubtitle}>Deze regels komen uit het actieve bronprofiel van de leeromgeving.</p>
            </div>
            <a href="#" className="icon-button" aria-label="Sluiten" title="Sluiten"><X size={18} aria-hidden /></a>
          </div>

          {sourceResources.length === 0
            ? <p>In het actieve bronprofiel zijn geen globale bronbestanden ingesteld.</p>
            : <dl className={styles.rulesList}>
              {sourceResources.map((resource) => <div className={styles.ruleItem} key={resource.id}>
                <dt><ConfiguredResourceIcon icon={resource.icon} />{resource.label}</dt>
                <dd>{recognitionSummary(resource.recognition)}</dd>
              </div>)}
            </dl>}
        </section>
      </div>
    </>;
  }

  const visibleResources = resources.flatMap((resource) => {
    if (!resource.available) return [];
    if (resource.kind === "external_link") return resource.url ? [{ resource, href: resource.url }] : [];
    const href = sourceHref(resource);
    return href ? [{ resource, href }] : [];
  });

  if (visibleResources.length === 0) return null;

  return <div className="document-actions document-actions-prominent">
    {visibleResources.map(({ resource, href }) => <a
      className="document-button"
      href={href}
      target="_blank"
      rel="noreferrer"
      key={resource.id}
    >
      <ConfiguredResourceIcon icon={resource.icon} />
      {resource.label}
    </a>)}
  </div>;
}

function recognitionSummary(recognition: GlobalResourceFileRecognition | null | undefined): string {
  if (!recognition) return "Herkenningsregel nog niet beschikbaar.";
  const extensions = recognition.fileExtensions.map((extension) => extension.toUpperCase()).join(", ");
  const caseMode = recognition.caseSensitive ? "hoofdlettergevoelig" : "niet hoofdlettergevoelig";
  return `${operatorLabels[recognition.operator]} “${recognition.value}” · ${extensions} · ${caseMode}`;
}
