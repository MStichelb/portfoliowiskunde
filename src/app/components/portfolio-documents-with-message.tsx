import type { PortfolioCustomTextPosition } from "@/lib/portfolio-custom-message";

import { PortfolioDocumentLinks } from "./portfolio-document-links";

export function PortfolioDocumentsWithMessage({
  portfolioId,
  spaceSlug,
  hasHints,
  customText,
  customTextPosition,
}: {
  portfolioId: string;
  spaceSlug: string;
  hasHints: boolean;
  customText: string | null;
  customTextPosition: PortfolioCustomTextPosition;
}) {
  const message = customText?.trim()
    ? <div className="portfolio-custom-message">{customText}</div>
    : null;

  return <>
    {customTextPosition === "above_documents" ? message : null}
    <PortfolioDocumentLinks portfolioId={portfolioId} spaceSlug={spaceSlug} hasHints={hasHints} />
    {customTextPosition === "below_documents" ? message : null}
  </>;
}
