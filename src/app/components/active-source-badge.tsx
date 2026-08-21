import type { LearningSpace, StorageSourceType } from "@/lib/repositories";

export function ActiveSourceBadge({ space, compact = false }: { space: LearningSpace; compact?: boolean }) {
  const active = space.sources.find((source) => source.isActive);
  const mirrorActive = active?.role === "mirror";
  const Tag = compact ? "small" : "span";
  return <Tag className={mirrorActive ? (compact ? "mirror-active-text" : "mirror-active-badge") : (compact ? undefined : "source-role-badge")}>
    {active ? `${mirrorActive ? "Mirror actief" : "Primary"} · ${providerLabel(active.providerType)}` : "Geen actieve bron"}
  </Tag>;
}

function providerLabel(provider: StorageSourceType): string {
  if (provider === "onedrive") return "OneDrive";
  if (provider === "google_drive") return "Google Drive";
  return "Lokale bestanden (test)";
}
