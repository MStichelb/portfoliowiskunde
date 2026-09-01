import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ReactNode } from "react";
import Link from "next/link";

import { requireAdminUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SourceHelpPage() {
  await requireAdminUser();
  const markdown = await readFile(path.join(process.cwd(), "docs", "BRONNEN-INSTELLEN.md"), "utf8");
  return <main className="page-shell admin-page help-page">
    <header className="page-header"><p className="eyebrow">Beheer</p><h1>Hulp bij bronnen instellen</h1><p>Praktische stappen voor primaire bronnen, mirrors en gecontroleerd omschakelen.</p></header>
    <article className="admin-card help-article">{renderMarkdown(markdown)}</article>
    <Link className="secondary-button compact-back-button" href="/admin">Terug naar beheer</Link>
  </main>;
}

export function renderMarkdown(markdown: string): ReactNode[] {
  const output: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>);
    output.push(list.ordered ? <ol key={`list-${output.length}`}>{items}</ol> : <ul key={`list-${output.length}`}>{items}</ul>);
    list = null;
  };
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) { flushList(); continue; }
    const bullet = /^-\s+(.+)$/.exec(line);
    const numbered = /^\d+\.\s+(.+)$/.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    flushList();
    if (line.startsWith("# ")) continue;
    else if (line.startsWith("## ")) output.push(<h2 key={`line-${output.length}`}>{line.slice(3)}</h2>);
    else output.push(<p key={`line-${output.length}`}>{line}</p>);
  }
  flushList();
  return output;
}
