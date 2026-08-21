"use client";

import { ArrowLeftRight, CheckCircle2, TriangleAlert } from "lucide-react";
import { useActionState } from "react";

import { compareSourcesAction, switchSourceAction, type SourceSwitchActionState } from "@/app/admin/actions";
import { SubmitButton } from "@/app/components/submit-button";
import type { IndexWarning } from "@/lib/domain";
import type { LearningSpace, LearningSpaceSource, StorageSourceType } from "@/lib/repositories";

const initialState: SourceSwitchActionState = { error: null };

export function SourceSwitchPanel({ space }: { space: LearningSpace }) {
  const active = space.sources.find((source) => source.isActive) ?? null;
  const target = space.sources.find((source) => !source.isActive) ?? null;
  const [comparisonState, compareAction] = useActionState(compareSourcesAction, initialState);
  const [switchState, switchAction] = useActionState(switchSourceAction, initialState);
  if (!active || !target) return <section className="settings-card source-switch-card" aria-labelledby="active-source-heading">
    <h2 id="active-source-heading">Actieve bron</h2>
    <p><strong>{active ? sourceName(active) : "Geen actieve bron"}</strong></p>
    <p className="source-connection-status">Configureer naast de primaire bron ook een mirror om gecontroleerd te kunnen omschakelen.</p>
  </section>;

  const preview = comparisonState.preview;
  const completedAt = preview?.mirrorCompletedAt ?? (target.providerType === "google_drive" ? target.mirrorCompletedAt : null);
  const switchLabel = target.role === "mirror" ? "Overschakelen naar mirror" : "Terugschakelen naar primaire bron";

  return <section className="settings-card source-switch-card" aria-labelledby="active-source-heading">
    <div className="source-settings-heading">
      <div><h2 id="active-source-heading">Actieve bron</h2><p>De actieve index en bronconfiguratie wijzigen pas na een geslaagde controle en bevestiging.</p></div>
      {active.role === "mirror" ? <span className="mirror-active-badge">Fallbackbron actief</span> : <span className="active-source-badge">Primaire bron actief</span>}
    </div>
    <div className="active-source-summary">
      <div><span>Nu actief</span><strong>{sourceName(active)}</strong></div>
      <ArrowLeftRight size={20} aria-hidden />
      <div><span>Switchdoel</span><strong>{sourceName(target)}</strong></div>
    </div>
    {completedAt ? <p className="mirror-completed-at">Laatste volledige mirror: <strong>{formatBrussels(completedAt)}</strong></p> : null}

    <form action={compareAction} className="source-switch-actions">
      <input type="hidden" name="learningSpaceId" value={space.id} />
      <input type="hidden" name="targetSourceId" value={target.id} />
      <SubmitButton className="secondary-button" pendingLabel="Bronnen controleren...">Bronnen vergelijken</SubmitButton>
    </form>
    {comparisonState.error ? <p className="form-message" role="alert">{comparisonState.error}</p> : null}
    {preview ? <SourceComparisonView state={comparisonState} /> : null}

    {preview ? <form action={switchAction} className="source-switch-confirmation">
      <input type="hidden" name="learningSpaceId" value={space.id} />
      <input type="hidden" name="targetSourceId" value={target.id} />
      <p>{preview.comparison.hasDifferences
        ? `De bronnen verschillen op ${preview.comparison.differenceCount} punten. Controleer de lijst en bevestig alleen als deze afwijkingen aanvaardbaar zijn.`
        : "De geïndexeerde bronstructuur loopt gelijk. Bevestig om de actieve bron te wijzigen."}</p>
      <SubmitButton pendingLabel="Opnieuw controleren en omschakelen...">{switchLabel}</SubmitButton>
    </form> : null}
    {switchState.error ? <p className="form-message" role="alert">{switchState.error}</p> : null}
    {switchState.switched ? <p className="success-message" role="status">Actieve bron gewijzigd. De nieuwe index is volledig opgeslagen.</p> : null}
  </section>;
}

function SourceComparisonView({ state }: { state: SourceSwitchActionState }) {
  const comparison = state.preview!.comparison;
  return <div className="source-comparison" aria-live="polite">
    <h3>Mirrorvergelijking</h3>
    <p className="comparison-summary"><CheckCircle2 size={17} aria-hidden />{comparison.matchedFiles} bestanden gelijk</p>
    {comparison.hasDifferences ? <p className="comparison-warning"><TriangleAlert size={17} aria-hidden />{comparison.differenceCount} verschillen of waarschuwingen</p> : <p>Geen inhoudsverschillen gevonden.</p>}
    <DifferenceList title="Alleen in huidige bron" paths={comparison.onlyInCurrent.map((entry) => entry.relativePath)} />
    <DifferenceList title="Alleen in switchdoel" paths={comparison.onlyInTarget.map((entry) => entry.relativePath)} />
    <DifferenceList title="Afwijkend type" paths={comparison.changed.map((entry) => entry.relativePath)} />
    <WarningList title="Parserwaarschuwingen alleen in huidige bron" warnings={comparison.currentWarnings} />
    <WarningList title="Parserwaarschuwingen alleen in switchdoel" warnings={comparison.targetWarnings} />
  </div>;
}

function WarningList({ title, warnings }: { title: string; warnings: IndexWarning[] }) {
  if (warnings.length === 0) return null;
  return <div className="comparison-group"><h4>{title}</h4><ul>{warnings.slice(0, 20).map((warning, index) => <li key={`${warning.path}-${warning.message}-${index}`}><span>{warning.message}</span><small>{warning.path}</small></li>)}</ul>{warnings.length > 20 ? <p>En nog {warnings.length - 20} waarschuwingen.</p> : null}</div>;
}

function DifferenceList({ title, paths }: { title: string; paths: string[] }) {
  if (paths.length === 0) return null;
  return <div className="comparison-group"><h4>{title}</h4><ul>{paths.slice(0, 20).map((path) => <li key={path}>{path}</li>)}</ul>{paths.length > 20 ? <p>En nog {paths.length - 20} items.</p> : null}</div>;
}

function sourceName(source: LearningSpaceSource): string {
  return `${source.role === "primary" ? "Primaire bron" : "Mirror"} · ${providerLabel(source.providerType)}`;
}

function providerLabel(provider: StorageSourceType): string {
  if (provider === "onedrive") return "OneDrive";
  if (provider === "google_drive") return "Google Drive";
  return "Local filesystem";
}

function formatBrussels(value: string): string {
  return new Intl.DateTimeFormat("nl-BE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(value));
}
