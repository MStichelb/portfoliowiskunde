export interface SourceProfileUsageLabelItem {
  learningSpaceShortLabel: string;
}

export function sourceProfileUsageLabel(usages: SourceProfileUsageLabelItem[], inactiveLabel = "Inactief"): string {
  if (usages.length === 0) return inactiveLabel;
  const visible = usages.slice(0, 3).map((usage) => usage.learningSpaceShortLabel).join(", ");
  return usages.length > 3 ? `${visible} +${usages.length - 3}` : visible;
}
