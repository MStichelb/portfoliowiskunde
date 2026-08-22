import { CalendarDays, Notebook } from "lucide-react";

import type { ErrorReportSort } from "@/lib/error-report-sort";

export function ErrorReportSortControls({ sort }: { sort: ErrorReportSort }) {
  return <form className="report-sort" method="get" aria-label="Foutmeldingen sorteren">
    <button type="submit" name="sort" value="date" aria-pressed={sort === "date"} className={sort === "date" ? "primary-button" : "secondary-button"}>
      <CalendarDays size={17} aria-hidden />Sorteer op datum
    </button>
    <button type="submit" name="sort" value="portfolio" aria-pressed={sort === "portfolio"} className={sort === "portfolio" ? "primary-button" : "secondary-button"}>
      <Notebook size={17} aria-hidden />Sorteer op portfolio
    </button>
  </form>;
}
