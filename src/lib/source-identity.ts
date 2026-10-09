/** Native IDs are meaningful only inside this provider namespace and configured source. */
export interface StorageIdentityContext {
  readonly providerType: "local" | "onedrive" | "google_drive";
  readonly providerNamespace: string;
  /** `native` survives provider rename/move; `path` explicitly does not. */
  readonly identityKind: "native" | "path";
}

export interface SourceBindingContext extends StorageIdentityContext {
  readonly learningSpaceId: string;
  readonly configuredSourceId: string;
}

export interface SourceEntityBinding extends SourceBindingContext {
  readonly nativeItemId: string;
  readonly entityType: "portfolio" | "section";
  readonly entityId: string;
  readonly portfolioId: string;
}

/** One provider observation, optionally covering both live asset representations. */
export interface SourceAssetBinding extends SourceBindingContext {
  readonly nativeItemId: string;
  readonly resourceScope: "portfolio" | "exercise";
  readonly resourceId: string;
  readonly portfolioId: string;
  readonly exerciseId: string | null;
  readonly resourceAssetId: string | null;
  readonly solutionAssetId: string | null;
  readonly variantId: string | null;
}

export function sourceBindingContextKey(context: SourceBindingContext): string {
  return JSON.stringify([context.learningSpaceId, context.configuredSourceId, context.providerType, context.providerNamespace]);
}

export function supportsStableNativeIdentity(context: StorageIdentityContext): boolean {
  return context.identityKind === "native" && context.providerType !== "local";
}
