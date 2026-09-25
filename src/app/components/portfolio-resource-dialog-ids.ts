function safeFragmentPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function portfolioExternalLinkDialogId(portfolioId: string, resourceId: string): string {
  return `portfolio-external-link-${safeFragmentPart(portfolioId)}-${safeFragmentPart(resourceId)}`;
}

export function portfolioResourceRulesDialogId(portfolioId: string): string {
  return `portfolio-resource-rules-${safeFragmentPart(portfolioId)}`;
}
