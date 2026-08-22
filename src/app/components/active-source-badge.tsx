import type { LearningSpace, LearningSpaceSource, StorageSourceType } from "@/lib/repositories";

export function ActiveSourceBadge({ space, compact = false }: { space: LearningSpace; compact?: boolean }) {
  const active = space.sources.find((source) => source.isActive);
  const mirrorActive = active?.role === "mirror";
  const Tag = compact ? "small" : "span";
  return <Tag className={mirrorActive ? (compact ? "mirror-active-text" : "mirror-active-badge") : (compact ? undefined : "source-role-badge")}>
    {active ? `${mirrorActive ? "Mirror actief" : "Bron"} • ${providerLabel(active.providerType)} • ${sourceLabel(active)}` : "Geen actieve bron"}
  </Tag>;
}

export function LearningSpaceSourceSummary({ space }: { space: LearningSpace }) {
  const active = space.sources.find((source) => source.isActive) ?? null;
  return <>
    <ActiveSourceBadge space={space} />
    {!space.primarySource && !active ? <SourceLine label="Bron" source={null} fallback={space} /> : null}
    {space.primarySource && space.primarySource.id !== active?.id ? <SourceLine label="Bron" source={space.primarySource} /> : null}
    {space.mirrorSource && space.mirrorSource.id !== active?.id ? <SourceLine label="Mirror" source={space.mirrorSource} /> : null}
  </>;
}

function SourceLine({ label, source, fallback }: { label: string; source: LearningSpaceSource | null; fallback?: LearningSpace }) {
  const provider = source?.providerType ?? fallback?.sourceType;
  if (!provider) return null;
  return <span><strong>{label}</strong> • {providerLabel(provider)}{source ? ` • ${sourceLabel(source)}` : ""}</span>;
}

function sourceLabel(source: LearningSpaceSource): string {
  if (source.providerType === "local") return source.localSourcePath || "Bronmap nog instellen";
  if (source.providerType === "google_drive") return source.googleDriveFolderLabel || "Map-ID ingesteld";
  return source.oneDriveFolderPath || "Drive- en map-ID ingesteld";
}

function providerLabel(provider: StorageSourceType): string {
  if (provider === "onedrive") return "OneDrive";
  if (provider === "google_drive") return "Google Drive";
  return "Lokale bestanden (test)";
}
