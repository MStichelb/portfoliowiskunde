import type { PortfolioCustomTextPosition } from "@/lib/portfolio-custom-message";
import type { PortfolioGlobalResource } from "@/lib/repositories";

import { PortfolioDocumentLinks } from "./portfolio-document-links";

export function PortfolioDocumentsWithMessage({
  portfolioId,
  spaceSlug,
  resources,
  customText,
  customTextPosition,
}: {
  portfolioId: string;
  spaceSlug: string;
  resources: readonly PortfolioGlobalResource[];
  customText: string | null;
  customTextPosition: PortfolioCustomTextPosition;
}) {
  const message = customText?.trim()
    ? <div className="portfolio-custom-message">{customText}</div>
    : null;

  return <>
    {customTextPosition === "above_documents" ? message : null}
    <PortfolioDocumentLinks portfolioId={portfolioId} spaceSlug={spaceSlug} resources={resources} />
    {customTextPosition === "below_documents" ? message : null}
  </>;
}
