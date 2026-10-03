import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { DEFAULT_COLLECTION_LABEL_SINGULAR, formatTerminologyLabel } from "@/lib/collection-terminology";

export function AdminExercisePreviewToolbar({ portfolioHref, collectionLabelSingular = DEFAULT_COLLECTION_LABEL_SINGULAR }: { portfolioHref: string; collectionLabelSingular?: string }) {
  return <div className="admin-preview-toolbar">
    <Link href={portfolioHref} className="secondary-button compact-back-button admin-preview-back-button"><ArrowLeft size={17} aria-hidden />Terug naar {formatTerminologyLabel(collectionLabelSingular, "inline")}</Link>
    <aside className="admin-preview-banner" role="note"><strong>Adminweergave</strong><span>Deze inhoud kan voor leerlingen verborgen zijn.</span></aside>
  </div>;
}
