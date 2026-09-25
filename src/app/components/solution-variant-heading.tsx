import { NotebookPen, Shapes } from "lucide-react";

import { ConfiguredResourceIcon } from "@/app/components/configured-resource-icon";
import type { GlobalResourceIcon } from "@/lib/source-profile-config";

export function SolutionVariantHeading({
  kind,
  label,
  icon,
}: {
  kind: "standard" | "alternative";
  label?: string;
  icon?: GlobalResourceIcon;
}) {
  const fallbackLabel = kind === "standard" ? "Uitwerking" : "Alternatieve uitwerking";
  if (icon) {
    return <h2 className="variant-heading"><ConfiguredResourceIcon icon={icon} size={20} />{label ?? fallbackLabel}</h2>;
  }

  const Icon = kind === "standard" ? NotebookPen : Shapes;
  return <h2 className="variant-heading"><Icon size={20} aria-hidden />{label ?? fallbackLabel}</h2>;
}
