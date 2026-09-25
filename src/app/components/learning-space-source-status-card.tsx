import type { ReactNode } from "react";

import type {
  LearningSpaceSourceStatus,
  LearningSpaceSourceStatusSource,
  LearningSpaceSourceStatusSyncAttempt,
  LearningSpaceSourceStatusWarning,
} from "@/lib/learning-space-source-status";
import { comparePortfolioIds } from "@/lib/parser";

const DATE_FORMATTER = new Intl.DateTimeFormat("nl-BE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Brussels",
});

export function LearningSpaceSourceStatusOverview({ status }: { status: LearningSpaceSourceStatus }) {
  return <div className="source-status-grid">
    <SynchronizationSection status={status} />
    <SourceValidationSection status={status} />
    <ProfileAlignmentSection status={status} />
    <MissingContentSection status={status} />
    <ScannerWarningReference status={status} />
  </div>;
}

function SynchronizationSection({ status }: { status: LearningSpaceSourceStatus }) {
  const latestAttempt = status.synchronization.latestAttempt;
  const latestSuccess = status.synchronization.latestSuccessful;
  const failedWithUsableIndex = latestAttempt?.result === "failed" && status.synchronization.usableIndex.available;

  return <StatusSection title="Synchronisatie">
    <dl className="source-status-details">
      <DetailRow label="Laatste poging" value={latestAttempt ? <AttemptLabel attempt={latestAttempt} /> : "Geen poging geregistreerd"} />
      <DetailRow label="Laatste succes" value={latestSuccess ? <StatusTime value={attemptTime(latestSuccess)} /> : "Geen geslaagde synchronisatie beschikbaar"} />
      <DetailRow label="Bruikbare inhoud" value={usableIndexLabel(status)} />
    </dl>
    {failedWithUsableIndex ? <p className="source-status-note source-status-note-warning">De laatste synchronisatie is mislukt. De eerder gesynchroniseerde inhoud blijft beschikbaar.</p> : null}
    {!status.synchronization.usableIndex.available ? <p className="source-status-note source-status-note-error">Er is nog geen bruikbare gesynchroniseerde inhoud beschikbaar.</p> : null}
    {status.synchronization.inProgress.state === "inferred_running" ? <p className="source-status-note">Er zijn aanwijzingen dat een synchronisatie bezig is. Dit is een voorzichtige afleiding uit de opgeslagen status.</p> : null}
  </StatusSection>;
}

function SourceValidationSection({ status }: { status: LearningSpaceSourceStatus }) {
  const primary = status.sources.find((source) => source.role === "primary") ?? null;
  const mirror = status.sources.find((source) => source.role === "mirror") ?? null;

  return <StatusSection title="Broncontrole">
    <p className="source-status-explanation source-status-details-intro">Dit is de laatst bekende validatie, geen live bereikbaarheidscontrole.</p>
    <dl className="source-status-details">
      <DetailRow label="Primaire bron" value={primary ? validationLabel(primary) : "Geen primaire bron bekend"} />
      {mirror ? <DetailRow label="Mirror" value={validationLabel(mirror)} /> : null}
    </dl>
  </StatusSection>;
}

function ProfileAlignmentSection({ status }: { status: LearningSpaceSourceStatus }) {
  const alignment = status.synchronization.profileIndexAlignment;
  const hasUsableIndex = status.synchronization.usableIndex.available;
  return <StatusSection title="Index en bronconfiguratie">
    {!hasUsableIndex
      ? <p className="source-status-note source-status-note-warning">Er is nog geen bruikbare gesynchroniseerde index beschikbaar. Gebruik de synchronisatieactie in de beheerheader om een index op te bouwen.</p>
      : alignment.state === "confirmed_current"
        ? <p className="source-status-alignment-confirmed">Volgens de opgeslagen gegevens is de index afgestemd op de huidige bronconfiguratie.</p>
        : <div className="source-status-note source-status-note-warning"><p>De bronconfiguratie is mogelijk gewijzigd sinds de laatste geslaagde synchronisatie.</p><p>Synchroniseer opnieuw om de index bij te werken volgens de huidige bronconfiguratie.</p></div>}
  </StatusSection>;
}

function MissingContentSection({ status }: { status: LearningSpaceSourceStatus }) {
  const missing = status.missingContent;
  return <StatusSection title="Ontbrekende inhoud">
    {missing.state === "unknown" ? <p>Onbekend: er is geen bruikbare index om deze aantallen betrouwbaar te bepalen.</p> : <>
      <dl className="source-status-details">
        <DetailRow label="Portfolio's" value={String(missing.portfolios)} />
        <DetailRow label="Secties" value={String(missing.sections)} />
        <DetailRow label="Oefeningen" value={String(missing.exercises)} />
        <DetailRow label="Bestanden en resources" value={String(missing.totalFilesAndResources)} />
      </dl>
      {missing.totalFilesAndResources > 0 ? <p className="source-status-explanation">Verdwenen bestanden beheer je via de opschoonmelding op de portfolio-beheerpagina.</p> : null}
    </>}
  </StatusSection>;
}

function ScannerWarningReference({ status }: { status: LearningSpaceSourceStatus }) {
  const warnings = status.warnings;
  if (warnings.state === "unknown") {
    return <StatusSection title="Scannerwaarschuwingen" wide><p>Nog geen scannerwaarschuwingen beschikbaar.</p></StatusSection>;
  }
  if (warnings.count === 0) {
    return <StatusSection title="Scannerwaarschuwingen" wide><p>Geen scannerwaarschuwingen vastgesteld bij de laatste geslaagde synchronisatie.</p></StatusSection>;
  }

  const groups = warningGroups(warnings.items);
  return <StatusSection title="Scannerwaarschuwingen" wide>
    <p>{warnings.count} scannerwaarschuwing{warnings.count === 1 ? "" : "en"} uit de laatste geslaagde synchronisatie. De waarschuwingen staan ook bij de betrokken portfolio&apos;s.</p>
    <details className="source-status-warning-details">
      <summary>Waarschuwingen bekijken</summary>
      <div className="source-status-warning-groups">
        {groups.map((group) => <section key={group.key} className="source-status-warning-group">
          <h4>{group.title}</h4>
          <ul>{group.items.map((warning, index) => <li key={`${warning.relativePath}-${warning.message}-${index}`}>
            <span>{warning.message}</span>
            <span className="file-reference">{warning.relativePath}</span>
          </li>)}</ul>
        </section>)}
      </div>
      {warnings.items.length < warnings.count ? <p className="source-status-explanation">Niet alle {warnings.count} opgeslagen waarschuwingen konden in dit overzicht worden weergegeven.</p> : null}
    </details>
  </StatusSection>;
}

interface WarningGroup {
  key: string;
  title: string;
  code: string | null;
  items: LearningSpaceSourceStatusWarning[];
}

function warningGroups(items: LearningSpaceSourceStatusWarning[]): WarningGroup[] {
  const portfolioGroups = new Map<string, WarningGroup>();
  const general: LearningSpaceSourceStatusWarning[] = [];
  for (const warning of items) {
    if (!warning.portfolio) {
      general.push(warning);
      continue;
    }
    const existing = portfolioGroups.get(warning.portfolio.id);
    if (existing) {
      existing.items.push(warning);
      continue;
    }
    portfolioGroups.set(warning.portfolio.id, {
      key: warning.portfolio.id,
      title: `Portfolio ${warning.portfolio.code} — ${warning.portfolio.title}`,
      code: warning.portfolio.code,
      items: [warning],
    });
  }
  const groups = [...portfolioGroups.values()].sort((left, right) => comparePortfolioIds(left.code!, right.code!));
  if (general.length > 0) groups.push({ key: "general", title: "Algemene waarschuwingen", code: null, items: general });
  return groups;
}

function StatusSection({ title, children, wide = false }: { title: string; children: ReactNode; wide?: boolean }) {
  return <section className={`settings-card source-status-section${wide ? " source-status-section-wide" : ""}`}><h3>{title}</h3>{children}</section>;
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function AttemptLabel({ attempt }: { attempt: LearningSpaceSourceStatusSyncAttempt }) {
  const result = attempt.result === "succeeded" ? "Geslaagd"
    : attempt.result === "failed" ? "Mislukt"
    : attempt.result === "running" ? "Geregistreerd als lopend"
    : "Resultaat onbekend";
  return <>{result} · <StatusTime value={attemptTime(attempt)} /></>;
}

function StatusTime({ value }: { value: string }) {
  return <time dateTime={value}>{DATE_FORMATTER.format(new Date(value))}</time>;
}

function validationLabel(source: LearningSpaceSourceStatusSource): ReactNode {
  if (source.lastKnownValidation.state === "unknown") return "Nog niet gecontroleerd";
  const label = source.lastKnownValidation.state === "valid" ? "Geldig bij laatste controle" : "Probleem bij laatste controle";
  return source.lastKnownValidation.checkedAt
    ? <>{label} op <StatusTime value={source.lastKnownValidation.checkedAt} /></>
    : `Laatst bekende status: ${label.toLocaleLowerCase("nl-BE")}`;
}

function usableIndexLabel(status: LearningSpaceSourceStatus): string {
  const state = status.synchronization.usableIndex.state;
  if (state === "unavailable") return "Niet beschikbaar";
  if (state === "available_from_previous_success") return "Beschikbaar uit een eerdere geslaagde synchronisatie";
  if (state === "available_while_syncing") return "Beschikbaar terwijl mogelijk een synchronisatie loopt";
  if (state === "available_without_sync_history") return "Beschikbaar; synchronisatiehistoriek ontbreekt";
  return "Beschikbaar uit de laatste geslaagde synchronisatie";
}

function attemptTime(attempt: LearningSpaceSourceStatusSyncAttempt): string {
  return attempt.finishedAt ?? attempt.startedAt;
}
