import { randomUUID } from "node:crypto";

import type { DatabaseClient } from "@/lib/database";
import type { IndexedPortfolio, IndexedSourceTheme } from "@/lib/domain";
import { getSourceEntityBindings } from "@/lib/source-bindings";
import { SourceConfigurationError } from "@/lib/source-errors";
import { supportsStableNativeIdentity, type SourceEntityBinding, type StorageIdentityContext } from "@/lib/source-identity";

interface ReconciliationSource {
  id: string;
  learningSpaceId: string;
  providerType: string;
}

export interface ThemeReconciliation {
  id: string;
  source: IndexedSourceTheme;
  scope: string;
  sortOrder: number;
  match: "source-reference" | "new";
  sourceChanged: boolean;
}

export interface PortfolioReconciliation {
  id: string;
  incoming: IndexedPortfolio;
  match: "native" | "logical-code" | "new";
  codeChanged: boolean;
  sourceChanged: boolean;
  themeChanged: boolean;
  themeId: string | null;
}

export interface SourceReconciliationPlan {
  themes: ThemeReconciliation[];
  portfolios: PortfolioReconciliation[];
}

function conflict(detail: string): never {
  throw new SourceConfigurationError(`Conflict in de bronidentiteit: ${detail}. De bestaande index is behouden; automatische koppeling is niet uitgevoerd.`);
}

function inContext(binding: SourceEntityBinding, source: ReconciliationSource, identity: StorageIdentityContext): boolean {
  return binding.learningSpaceId === source.learningSpaceId && binding.configuredSourceId === source.id
    && binding.providerType === identity.providerType && binding.providerNamespace === identity.providerNamespace;
}

/** Read-only: resolve theme/portfolio identity before any publication statements execute.
 * Children keep their existing matching inside the resolved portfolio ID.
 */
export async function planSourceReconciliation(
  database: DatabaseClient,
  input: {
    learningSpaceId: string;
    providerType: string;
    source: ReconciliationSource | null;
    portfolios: readonly IndexedPortfolio[];
    synchronizesThemes: boolean;
    newPortfolioId: (code: string) => string;
  },
): Promise<SourceReconciliationPlan> {
  const { learningSpaceId, providerType, source, portfolios, synchronizesThemes } = input;
  if (source && source.learningSpaceId !== learningSpaceId) conflict("de broncontext hoort niet bij deze leeromgeving");
  const [storedPortfolios, storedThemes, bindings] = await Promise.all([
    database.execute({ sql: "SELECT id, portfolio_code, title, relative_path, theme_id FROM portfolios WHERE learning_space_id = ?", args: [learningSpaceId] }),
    database.execute({ sql: "SELECT id, sort_order, source_scope, source_id, source_folder_name, source_relative_path FROM themes WHERE learning_space_id = ?", args: [learningSpaceId] }),
    getSourceEntityBindings(database, learningSpaceId),
  ]);
  const existingById = new Map(storedPortfolios.rows.map((row) => [String(row.id), row]));
  const existingByCode = new Map<string, typeof storedPortfolios.rows[number]>();
  for (const row of storedPortfolios.rows) {
    const code = String(row.portfolio_code);
    if (existingByCode.has(code)) conflict(`portfoliocode ${code} heeft meerdere bestaande entiteiten`);
    existingByCode.set(code, row);
  }
  let scanIdentity: StorageIdentityContext | undefined;
  const incomingNativeIds = new Set<string>();
  const codeCounts = new Map<string, number>();
  for (const portfolio of portfolios) {
    codeCounts.set(portfolio.code, (codeCounts.get(portfolio.code) ?? 0) + 1);
    const identity = portfolio.sourceIdentityContext;
    if (!identity) continue;
    if (!source || source.providerType !== providerType || identity.providerType !== providerType || !identity.providerNamespace.trim()
      || (identity.providerType === "local" ? identity.identityKind !== "path" : identity.identityKind !== "native")) conflict("de providercontext is ongeldig");
    if (scanIdentity && (scanIdentity.providerType !== identity.providerType || scanIdentity.providerNamespace !== identity.providerNamespace
      || scanIdentity.identityKind !== identity.identityKind)) conflict("één scan bevat verschillende providernamespaces");
    scanIdentity = identity;
    if (supportsStableNativeIdentity(identity) && portfolio.sourceId) {
      if (incomingNativeIds.has(portfolio.sourceId)) conflict("één native portfoliomap claimt meerdere portfolio's");
      incomingNativeIds.add(portfolio.sourceId);
    }
  }
  // Preserve legacy duplicate-code warnings, but never partially publish an ambiguous native scan.
  if (scanIdentity && supportsStableNativeIdentity(scanIdentity) && [...codeCounts.values()].some((count) => count > 1)) conflict("meerdere native portfoliomappen gebruiken dezelfde code");
  const scopedBindings = source && scanIdentity ? bindings.filter((binding) => inContext(binding, source, scanIdentity!)) : [];
  const bindingsByNativeId = new Map(scopedBindings.map((binding) => [binding.nativeItemId, binding]));
  const portfolioBindingsById = new Map(scopedBindings.filter((binding) => binding.entityType === "portfolio").map((binding) => [binding.entityId, binding]));
  const storedThemeReferences = new Set(storedThemes.rows.filter((row) => source && row.source_scope === source.id).map((row) => String(row.source_id)));
  const incomingThemeReferences = new Set(portfolios.flatMap((portfolio) => portfolio.sourceTheme ? [portfolio.sourceTheme.sourceId] : []));
  if (scanIdentity && supportsStableNativeIdentity(scanIdentity)) {
    for (const portfolio of portfolios) {
      if (portfolio.sourceId && storedThemeReferences.has(portfolio.sourceId)) conflict("een bestaande themamap wordt als portfolio geclaimd");
      for (const section of portfolio.sections) {
        if (section.sourceId && (storedThemeReferences.has(section.sourceId)
          || incomingThemeReferences.has(section.sourceId))) conflict("een themamap wordt als onderdeel geclaimd");
      }
    }
  }

  const themes: ThemeReconciliation[] = [];
  const themeIds = new Map<string, string>();
  if (synchronizesThemes) {
    if (!source) conflict("de synchronisatiebron voor thema's ontbreekt");
    const scopedThemes = storedThemes.rows.filter((row) => row.source_scope === source.id);
    // The existing theme schema stores configured-source scope, not provider namespace.
    // Refuse to reinterpret its references after a known context change.
    if (scopedThemes.length && scanIdentity && bindings.some((binding) => binding.configuredSourceId === source.id && !inContext(binding, source, scanIdentity!))) conflict("de opgeslagen themacontext wijkt af van de huidige providernamespace");
    const themesByReference = new Map(scopedThemes.map((row) => [String(row.source_id), row]));
    if (themesByReference.size !== scopedThemes.length) conflict("één bronreferentie hoort bij meerdere bestaande thema's");
    const incomingThemes = new Map<string, IndexedSourceTheme>();
    let sortOrder = Math.max(0, ...storedThemes.rows.map((row) => Number(row.sort_order)));
    for (const portfolio of portfolios) {
      const incoming = portfolio.sourceTheme;
      if (!incoming) continue;
      if (!incoming.sourceId.trim()) conflict("een thema heeft geen bronreferentie");
      const previous = incomingThemes.get(incoming.sourceId);
      if (previous) {
        if (previous.name !== incoming.name || previous.relativePath !== incoming.relativePath) conflict("één bronreferentie claimt verschillende thema's");
        continue;
      }
      if (scanIdentity && supportsStableNativeIdentity(scanIdentity)
        && (incomingNativeIds.has(incoming.sourceId) || bindingsByNativeId.has(incoming.sourceId))) conflict("een themamap wordt ook als portfolio of onderdeel geclaimd");
      incomingThemes.set(incoming.sourceId, incoming);
      const existing = themesByReference.get(incoming.sourceId);
      const id = existing ? String(existing.id) : randomUUID();
      if (!existing) sortOrder += 10;
      themeIds.set(incoming.sourceId, id);
      themes.push({ id, source: incoming, scope: source.id, sortOrder: existing ? Number(existing.sort_order) : sortOrder,
        match: existing ? "source-reference" : "new",
        sourceChanged: !existing || existing.source_folder_name !== incoming.name || existing.source_relative_path !== incoming.relativePath });
    }
  }

  const resolutions: PortfolioReconciliation[] = [];
  const claimedIds = new Set<string>();
  for (const incoming of portfolios) {
    if (codeCounts.get(incoming.code) !== 1) continue;
    const identity = incoming.sourceIdentityContext;
    const native = identity && supportsStableNativeIdentity(identity);
    const binding = native && incoming.sourceId ? bindingsByNativeId.get(incoming.sourceId) : undefined;
    if (binding && (binding.entityType !== "portfolio" || binding.identityKind !== "native")) conflict("de native portfolioreferentie heeft een ander entiteittype");
    const logical = existingByCode.get(incoming.code);
    if (logical && !identity && source && bindings.some((candidate) => candidate.configuredSourceId === source.id
      && candidate.entityType === "portfolio" && candidate.entityId === String(logical.id) && candidate.identityKind === "native")) conflict("een gebonden portfolio mist de actuele native providercontext");
    const exact = binding ? existingById.get(binding.entityId) : undefined;
    if (binding && !exact) conflict("de native binding mist haar portfolio in deze leeromgeving");
    if (exact && logical && exact.id !== logical.id) conflict(`de nieuwe portfoliocode ${incoming.code} is al bezet`);
    if (!exact && logical && native) {
      const previous = portfolioBindingsById.get(String(logical.id));
      if (previous && previous.nativeItemId !== incoming.sourceId) conflict(`portfoliocode ${incoming.code} hoort bij een andere native map`);
    }
    const existing = exact ?? logical;
    let id = existing ? String(existing.id) : input.newPortfolioId(incoming.code);
    // A retained portfolio may have renamed away from the code used to generate its ID.
    if (!existing && existingById.has(id)) id = randomUUID();
    if (claimedIds.has(id)) conflict("twee nieuwe kandidaten claimen dezelfde bestaande portfolio");
    claimedIds.add(id);
    const themeId = synchronizesThemes ? (incoming.sourceTheme ? themeIds.get(incoming.sourceTheme.sourceId)! : null)
      : existing?.theme_id == null ? null : String(existing.theme_id);
    resolutions.push({ id, incoming, match: exact ? "native" : logical ? "logical-code" : "new",
      codeChanged: !!existing && existing.portfolio_code !== incoming.code,
      sourceChanged: !existing || existing.title !== incoming.title || existing.relative_path !== incoming.relativePath,
      themeChanged: !!existing && (existing.theme_id ?? null) !== themeId, themeId });
  }
  return { themes, portfolios: resolutions };
}
