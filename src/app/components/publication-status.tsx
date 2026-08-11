import { Eye, EyeOff, Hourglass, Link2 } from "lucide-react";

import { formatPublicationLabel, type EffectivePublication } from "@/lib/publication";

export function PublicationStatus({ status }: { status: EffectivePublication }) {
  const label = formatPublicationLabel(status);
  if (status.state === "visible") return <span className="status-badge published"><Eye size={15} aria-hidden />{label}</span>;
  if (status.state === "hidden") return <span className="status-badge hidden" title="Niet toegankelijk"><EyeOff size={15} aria-hidden />{label}</span>;
  if (status.state === "will-be-visible") return <span className="status-badge pending"><Hourglass size={15} aria-hidden />{label}</span>;
  return <span className="status-badge blocking"><Link2 size={15} aria-hidden />{label}</span>;
}
