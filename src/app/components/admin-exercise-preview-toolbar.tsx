import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export function AdminExercisePreviewToolbar({ portfolioHref }: { portfolioHref: string }) {
  return <div className="admin-preview-toolbar">
    <Link href={portfolioHref} className="secondary-button compact-back-button admin-preview-back-button"><ArrowLeft size={17} aria-hidden />Terug naar portfolio</Link>
    <aside className="admin-preview-banner" role="note"><strong>Adminweergave</strong><span>Deze inhoud kan voor leerlingen verborgen zijn.</span></aside>
  </div>;
}
