import { NotebookPen, Shapes } from "lucide-react";

export function SolutionVariantHeading({ kind }: { kind: "standard" | "alternative" }) {
  const Icon = kind === "standard" ? NotebookPen : Shapes;
  return <h2 className="variant-heading"><Icon size={20} aria-hidden />{kind === "standard" ? "Uitwerking" : "Alternatieve uitwerking"}</h2>;
}
