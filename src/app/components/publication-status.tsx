import { Eye, EyeOff, Hourglass, Link2 } from "lucide-react";

import type { EffectivePublication } from "@/lib/publication";

export function PublicationStatus({ status }: { status: EffectivePublication }) {
  if (status.state === "visible") return <span className="status-badge published"><Eye size={15} aria-hidden />Zichtbaar</span>;
  if (status.state === "hidden") return <span className="status-badge hidden" title="Expliciet verborgen"><EyeOff size={15} aria-hidden />Verborgen</span>;
  if (status.state === "will-be-visible") return <span className="status-badge pending" title={status.reason === "self-scheduled" || status.reason === "parent-scheduled" ? "Wacht op publicatietijdstip" : "Wacht op bovenliggend niveau"}>{status.reason === "self-scheduled" || status.reason === "parent-scheduled" ? <Hourglass size={15} aria-hidden /> : <Link2 size={15} aria-hidden />}Wordt zichtbaar</span>;
  return <span className="status-badge blocking" title={status.reason === "expired" ? "Publicatieperiode is afgelopen" : "Een bovenliggend niveau is expliciet verborgen"}><Link2 size={15} aria-hidden />Wordt verborgen</span>;
}
