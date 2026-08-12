export class SourceConfigurationError extends Error {}

export class SourceAccessError extends Error {}

export function userFacingSourceError(error: unknown): string | null {
  if (error instanceof SourceConfigurationError || error instanceof SourceAccessError) return error.message;
  return null;
}
