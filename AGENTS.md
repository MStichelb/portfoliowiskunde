<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Database portability

Local development and the default test suite use SQLite/libSQL, while production uses PostgreSQL. Every shared migration and runtime query must be valid in both databases. Do not use SQLite-only SQL in shared code, and do not rely on untyped nullable placeholders such as `? IS NULL` or parameter-to-parameter comparisons; branch to a typed SQL statement instead. Any database-sensitive change requires validation with the normal database/migration tests and `corepack pnpm test:postgres` against a dedicated PostgreSQL test database.

## Changelog discipline

For every code change, before finalizing, explicitly evaluate whether `src/data/changelog.ts` should be updated.

Update the changelog for meaningful user-visible features, improvements, behavioral changes, and relevant bug fixes.
Do not add entries for refactors, tests, dependency updates, migrations without visible effect, internal implementation details, or invisible backoffice work.

Audience rules:
- Audience follows user value, not technical visibility on a public page.
- `student` only when a change is noticeable or relevant to students in normal use.
- Source, structure, sync, and configuration changes are for `teacher`/`superadmin` by default.
- Teacher/admin-only changes must never include `student`.
- `notify: true` only for changes worth actively surfacing.

Write each entry from the relevant user's perspective: what can they now do or notice that they could not before?

Write entries in clear Dutch user language and describe impact, not implementation.

Before completing EVERY task, report one of:
- `Changelog: updated — <short reason>`
- `Changelog: not updated — <short reason>`

This check is mandatory even if the original task prompt does not mention the changelog.
