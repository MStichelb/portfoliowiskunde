import { FileText } from "lucide-react";

export function PortfolioDocumentLinks({
  portfolioId,
  spaceSlug,
  hasHints,
  admin = false,
}: {
  portfolioId: string;
  spaceSlug?: string;
  hasHints: boolean;
  admin?: boolean;
}) {
  const base = `${admin ? "/api/admin" : "/api"}/portfolio-assets/${encodeURIComponent(portfolioId)}`;
  const query = spaceSlug ? `?space=${encodeURIComponent(spaceSlug)}` : "";
  const documents = [
    { kind: "assignment", label: admin ? "Opgaven-PDF" : "Opgaven" },
    ...(hasHints ? [{ kind: "hints", label: admin ? "Hints-PDF" : "Hints" }] : []),
    { kind: "final-solutions", label: admin ? "Eindoplossingen-PDF" : "Eindoplossingen" },
  ];

  return <div className={`document-actions${admin ? "" : " document-actions-prominent"}`}>
    {documents.map((document) => <a className={`document-button${admin ? " admin-document-button" : ""}`} href={`${base}/${document.kind}${query}`} target="_blank" rel="noreferrer" key={document.kind}>
      {admin ? <FileText size={17} aria-hidden /> : null}{document.label}
    </a>)}
  </div>;
}
