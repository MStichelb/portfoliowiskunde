import { Eye, EyeOff, Hourglass, Link2 } from "lucide-react";

import type { EffectivePublication } from "@/lib/publication";

export function PublicationStatus({ status }: { status: EffectivePublication }) {
  if (status.state === "visible") return <span className="status-badge published"><Eye size={15} aria-hidden />Zichtbaar</span>;
  if (status.state === "hidden") return <span className="status-badge hidden" title={status.reason === "expired" ? "Publicatieperiode is afgelopen" : "Expliciet verborgen"}><EyeOff size={15} aria-hidden />Verborgen</span>;
  return <span className="status-badge pending" title={status.reason === "scheduled" ? "Wacht op publicatietijdstip" : "Wacht op bovenliggend niveau"}>{status.reason === "scheduled" ? <Hourglass size={15} aria-hidden /> : <Link2 size={15} aria-hidden />}Wordt zichtbaar</span>;
}
