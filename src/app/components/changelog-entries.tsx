import type { ChangelogEntry } from "@/data/changelog";

const categories = { new: "Nieuw", improved: "Verbeterd", fixed: "Opgelost", changed: "Gewijzigd" };

export function ChangelogEntries({ entries }: { entries: ChangelogEntry[] }) {
  return entries.length ? <ol className="changelog-entries">{entries.map((entry) => <li key={entry.id}>
    <article>
      <div className="changelog-meta"><time dateTime={entry.date}>{new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${entry.date}T00:00:00Z`))}</time><span className={`changelog-category changelog-category-${entry.category}`}>{categories[entry.category]}</span></div>
      <h2>{entry.title}</h2><p>{entry.description}</p>
    </article>
  </li>)}</ol> : <p>Er zijn nog geen wijzigingen voor jou.</p>;
}
