import type { PortfolioGlobalResource } from "@/lib/repositories";

import { ConfiguredResourceIcon } from "./configured-resource-icon";
import { PortfolioInfoButton, PortfolioInfoDialog, RecognitionRuleCard } from "./portfolio-info-dialog";
import styles from "./portfolio-resource-admin.module.css";
import scannerStyles from "./portfolio-resource-scanner-v2.module.css";
import { portfolioExternalLinkDialogId, portfolioResourceRulesDialogId } from "./portfolio-resource-dialog-ids";
import { globalResourceCaseLabel, globalResourceRuleLabel } from "@/lib/source-profile-recognition-labels";

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
    if (resource.assetId) return `${resourceBase}/${encodeURIComponent(resource.assetId)}${query}`;
    if (resource.documentKind) return `${portfolioBase}/${resource.documentKind}${query}`;
    return null;
  };

  if (admin) {
    const rulesDialogId = portfolioResourceRulesDialogId(portfolioId);
    const sourceResources = resources.filter((resource) => resource.kind === "source_file" && resource.recognition);

    return <>
      <PortfolioInfoButton dialogId={rulesDialogId} label="Herkenningsregels voor documenten bekijken" />

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

      <PortfolioInfoDialog dialogId={rulesDialogId}>
          {sourceResources.length === 0
            ? <p>In het actieve bronprofiel zijn geen globale bronbestanden ingesteld.</p>
            : <div className={styles.rulesList}>
              {sourceResources.map((resource) => {
                const recognition = resource.recognition;
                if (!recognition) return null;
                return <RecognitionRuleCard key={resource.id} title={resource.label} icon={resource.icon} rows={[
                  { id: "recognition", label: "Herkenning", value: globalResourceRuleLabel(recognition) },
                  ...(recognition.fileExtensions.length ? [{ id: "file-types", label: "Bestandstypes", value: recognition.fileExtensions.map((extension) => extension.toUpperCase()).join(" · ") }] : []),
                  { id: "case-sensitivity", label: "Hoofdletters", value: globalResourceCaseLabel(recognition.caseSensitive) },
                ]} />;
              })}
            </div>}
      </PortfolioInfoDialog>
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
