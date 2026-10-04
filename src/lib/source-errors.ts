export class SourceConfigurationError extends Error {}

export class SourceAccessError extends Error {}

export class SourceFileNotFoundError extends SourceAccessError {}

export class SourceTransientError extends SourceAccessError {}

export class StaleSynchronizationError extends Error {}

export function userFacingSourceError(error: unknown): string | null {
  if (error instanceof SourceConfigurationError || error instanceof SourceAccessError) return error.message;
  return null;
}
