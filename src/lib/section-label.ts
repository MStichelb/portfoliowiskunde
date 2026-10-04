export function formatSectionLabel(code: string, title: string): string {
  return code.includes(".") ? `${code} ${title}` : `${code}. ${title}`;
}
