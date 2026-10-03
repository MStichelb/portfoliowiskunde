<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Database portability

Local development and the default test suite use SQLite/libSQL, while production uses PostgreSQL. Every shared migration and runtime query must be valid in both databases. Do not use SQLite-only SQL in shared code, and do not rely on untyped nullable placeholders such as `? IS NULL` or parameter-to-parameter comparisons; branch to a typed SQL statement instead. Any database-sensitive change requires validation with the normal database/migration tests and `corepack pnpm test:postgres` against a dedicated PostgreSQL test database.
