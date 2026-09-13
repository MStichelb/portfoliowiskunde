import type { PortfolioGlobalResource } from "@/lib/repositories";
import { X } from "lucide-react";

import { ConfiguredResourceIcon } from "./configured-resource-icon";
import styles from "./portfolio-resource-admin.module.css";
import { portfolioExternalLinkDialogId } from "./portfolio-resource-dialog-ids";

type ServerAction = (formData: FormData) => void | Promise<void>;

export function PortfolioExternalLinksForm({
  portfolioId,
  resources,
  action,
}: {
  portfolioId: string;
  resources: readonly PortfolioGlobalResource[];
  action: ServerAction;
}) {
  const links = resources.filter((resource) => resource.kind === "external_link");
  if (links.length === 0) return null;

  return <>
    {links.map((resource) => {
      const dialogId = portfolioExternalLinkDialogId(portfolioId, resource.id);
      return <div id={dialogId} className={styles.modalTarget} role="dialog" aria-modal="true" aria-labelledby={`${dialogId}-title`} key={resource.id}>
        <a href="#" className={styles.modalBackdrop} aria-label={`${resource.label} sluiten`} />
        <section className={styles.modalPanel}>
          <div className={styles.modalHeading}>
            <div>
              <h3 id={`${dialogId}-title`} className={styles.modalTitle}><ConfiguredResourceIcon icon={resource.icon} />{resource.label}</h3>
              <p className={styles.modalSubtitle}>{resource.url ? "Deze externe link is ingesteld voor dit portfolio." : "Nog geen externe link ingesteld voor dit portfolio."}</p>
            </div>
            <a href="#" className="icon-button" aria-label="Sluiten" title="Sluiten">
              <X size={18} aria-hidden />
            </a>
          </div>

          <form action={action} className={styles.linkForm}>
            <input type="hidden" name="portfolioId" value={portfolioId} />
            {links.filter((link) => link.id !== resource.id).map((link) => <input
              type="hidden"
              name={`externalLink:${link.id}`}
              value={link.url ?? ""}
              key={link.id}
            />)}
            <label>
              URL
              <input
                type="url"
                name={`externalLink:${resource.id}`}
                defaultValue={resource.url ?? ""}
                placeholder="https://…"
                maxLength={2048}
                inputMode="url"
                autoComplete="off"
              />
            </label>
            <p className={styles.linkHelp}>Laat het veld leeg en sla op om de link voor dit portfolio te verwijderen.</p>
            <div className={styles.modalActions}>
              <button type="submit" className="secondary-button">Opslaan</button>
              {resource.url ? <a className="secondary-button" href={resource.url} target="_blank" rel="noreferrer">Link openen</a> : null}
              <a className="secondary-button" href="#">Annuleren</a>
            </div>
          </form>
        </section>
      </div>;
    })}
  </>;
}
