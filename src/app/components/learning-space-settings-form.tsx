"use client";

import { useActionState, useState } from "react";
import { CircleHelp } from "lucide-react";
import Link from "next/link";

import type { AdminActionState } from "@/app/admin/actions";
import type { LearningSpace, LearningSpaceSource, StorageSourceType } from "@/lib/repositories";
import { LearningSpaceLifecycleActions } from "./learning-space-lifecycle-actions";

export function LearningSpaceSettingsForm({
  space,
  canPermanentlyDelete,
  action,
}: {
  space: LearningSpace;
  canPermanentlyDelete: boolean;
  action: (previousState: AdminActionState, formData: FormData) => AdminActionState | Promise<AdminActionState>;
}) {
  const primary = space.primarySource ?? legacyPrimarySource(space);
  const [primaryProvider, setPrimaryProvider] = useState<StorageSourceType>(primary.providerType);
  const [mirrorEnabled, setMirrorEnabled] = useState(Boolean(space.mirrorSource));
  const [mirrorProvider, setMirrorProvider] = useState<StorageSourceType>(space.mirrorSource?.providerType ?? "google_drive");
  const [state, actionState] = useActionState(action, { error: null });
  const [cardColor, setCardColor] = useState(space.cardColor);

  return <form action={actionState} className="learning-space-settings-form">
    <input type="hidden" name="id" value={space.id} />

    <section className="settings-card" aria-labelledby="general-settings-heading">
      <h2 id="general-settings-heading">Algemeen</h2>
      <div className="settings-grid">
        <label>Weergavenaam<input name="name" defaultValue={space.name} required maxLength={100} /><small>Met deze naam verschijnt de leeromgeving bij de leerlingen.</small></label>
        <label>URL<input name="slug" defaultValue={space.slug} required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /><small>Dit wordt gebruikt in het webadres van deze leeromgeving.</small></label>
        <label>Kort label<input name="shortLabel" defaultValue={space.shortLabel} required maxLength={6} /><small>Compacte naam voor de navigatie, maximaal 6 tekens.</small></label>
        <label>Sortering<input name="sortOrder" type="number" defaultValue={space.sortOrder} required /><small>Dit bepaalt de volgorde van leeromgevingen in de navigatie.</small></label>
        <label className="field-full">Beschrijving<textarea name="description" defaultValue={space.description} maxLength={240} rows={3} /><small>Korte beschrijving die op het kaartje voor leerlingen verschijnt.</small></label>
        <label className="color-field">Kleur<span><input name="cardColor" type="color" value={cardColor} onChange={(event) => setCardColor(event.target.value.toUpperCase())} /><code>{cardColor.toUpperCase()}</code></span><small>Accentkleur van het kaartje.</small></label>
        <label className="field-full delegated-access-setting"><span><input name="editorsCanManageAccess" type="checkbox" value="true" defaultChecked={space.editorsCanManageAccess} />Bewerkers kunnen toegang beheren</span><small>Bewerkers mogen Smartschoolgroepen en individuele leerlingen aan deze leeromgeving koppelen.</small></label>
      </div>
      <div className="settings-card-actions settings-card-lifecycle-actions">
        <LearningSpaceLifecycleActions
          space={space}
          showManage={false}
          showDelete={canPermanentlyDelete}
          embeddedInForm
          deleteLabel="Leeromgeving verwijderen"
          deleteConfirmTitle="Leeromgeving permanent verwijderen?"
          deleteConfirmText="Deze actie kan niet ongedaan worden gemaakt. De leeromgeving en bijhorende configuratie worden permanent verwijderd."
        />
        <button className="primary-button settings-save-button" type="submit">Instellingen opslaan</button>
      </div>
    </section>

    <section className="settings-card source-settings-card" aria-labelledby="source-settings-heading">
      <div className="source-settings-heading">
        <div><h2 id="source-settings-heading">Bronnen</h2><p>Stel een primaire bron in waaruit de portfolio&apos;s worden gehaald. Daarnaast kan je een mirror instellen in geval van problemen met de primaire bron.</p></div>
        <Link className="icon-button source-help-link" href="/admin/help/bronnen" aria-label="Hulp bij bronnen instellen" title="Hulp bij bronnen instellen"><CircleHelp size={18} aria-hidden /></Link>
        {space.mirrorSource?.isActive ? <span className="mirror-active-badge">Mirror actief</span> : null}
      </div>
      <div className="source-role-grid">
        <fieldset className={`source-role-card${primary.isActive ? " active-source-card" : ""}`}>
          <legend>Primaire bron</legend>
          <SourceStatus source={primary} />
          <label>Provider<select name="primaryProviderType" value={primaryProvider} onChange={(event) => setPrimaryProvider(parseSourceType(event.target.value))}><ProviderOptions /></select></label>
          <SourceFields prefix="primary" provider={primaryProvider} source={primary} />
        </fieldset>

        <fieldset className={`source-role-card${space.mirrorSource?.isActive ? " active-source-card" : ""}`}>
          <legend>Mirror</legend>
          <label className="source-enabled-control"><input type="checkbox" name="mirrorEnabled" value="true" checked={mirrorEnabled} disabled={space.mirrorSource?.isActive} onChange={(event) => setMirrorEnabled(event.target.checked)} />Mirror configureren</label>
          {space.mirrorSource?.isActive ? <input type="hidden" name="mirrorEnabled" value="true" /> : null}
          {mirrorEnabled ? <>
            <SourceStatus source={space.mirrorSource} />
            <label>Provider<select name="mirrorProviderType" value={mirrorProvider} onChange={(event) => setMirrorProvider(parseSourceType(event.target.value))}><ProviderOptions /></select></label>
            <SourceFields prefix="mirror" provider={mirrorProvider} source={space.mirrorSource} />
          </> : <p className="source-connection-status">Nog geen mirror geconfigureerd.</p>}
        </fieldset>
      </div>
      <div className="settings-card-actions">
        <button className="primary-button settings-save-button" type="submit">Instellingen opslaan</button>
      </div>
    </section>

    {state.error ? <p className="form-message" role="alert">{state.error}</p> : null}
  </form>;
}

function SourceFields({ prefix, provider, source }: { prefix: "primary" | "mirror"; provider: StorageSourceType; source: LearningSpaceSource | null }) {
  if (provider === "local") return <label className="source-path">Lokale bronmap<input name={`${prefix}LocalSourcePath`} defaultValue={source?.localSourcePath ?? ""} placeholder="C:\\..." /></label>;
  if (provider === "onedrive") return <div className="settings-grid one-drive-fields">
    <label>OneDrive drive-ID<input name={`${prefix}OneDriveDriveId`} defaultValue={source?.oneDriveDriveId ?? ""} required /></label>
    <label>OneDrive map-ID<input name={`${prefix}OneDriveFolderId`} defaultValue={source?.oneDriveFolderId ?? ""} required /></label>
    <label className="field-full">OneDrive mapnaam of pad<input name={`${prefix}OneDriveFolderPath`} defaultValue={source?.oneDriveFolderPath ?? ""} /></label>
    <p className="source-context-help">Een nieuwe OneDrive-bron gebruikt jouw persoonlijke verbinding. Controleer die eerst bij <Link href="/admin/verbindingen">Mijn verbindingen</Link>.</p>
  </div>;
  return <div className="settings-grid google-drive-fields">
    <label>Google Drive folder-ID<input name={`${prefix}GoogleDriveFolderId`} defaultValue={source?.googleDriveFolderId ?? ""} required pattern="[A-Za-z0-9_-]+" /></label>
    <label>Herkenbaar label of pad<input name={`${prefix}GoogleDriveFolderLabel`} defaultValue={source?.googleDriveFolderLabel ?? ""} maxLength={240} placeholder="Mirror leeromgeving" /></label>
    <p className="source-connection-status">De map moet gedeeld zijn met het geconfigureerde service account als Viewer.</p>
  </div>;
}

function SourceStatus({ source }: { source: LearningSpaceSource | null }) {
  if (!source) return null;
  const status = source.lastValidationStatus === "valid" ? "Bron getest" : source.lastValidationStatus === "invalid" ? "Controle mislukt" : "Geconfigureerd";
  return <div className="source-status-line"><span className={source.isActive ? "active-source-badge" : "source-role-badge"}>{source.isActive ? "Actieve bron" : "Stand-by"}</span><span>{providerLabel(source.providerType)} · {status}</span></div>;
}

function ProviderOptions() {
  return <><option value="onedrive">OneDrive</option><option value="google_drive">Google Drive</option><option value="local">Lokale bestanden (test)</option></>;
}

function legacyPrimarySource(space: LearningSpace): LearningSpaceSource {
  return {
    id: `${space.id}:primary`, learningSpaceId: space.id, role: "primary", providerType: space.sourceType, storageConnectionId: null, isActive: true,
    localSourcePath: space.localSourcePath, oneDriveDriveId: space.oneDriveDriveId, oneDriveFolderId: space.oneDriveFolderId,
    oneDriveFolderPath: space.oneDriveFolderPath, googleDriveFolderId: space.googleDriveFolderId,
    googleDriveFolderLabel: space.googleDriveFolderLabel, lastValidatedAt: null, lastValidationStatus: null,
    lastValidationMessage: null, mirrorCompletedAt: null,
  };
}

function parseSourceType(value: string): StorageSourceType {
  if (value === "onedrive" || value === "google_drive") return value;
  return "local";
}

function providerLabel(provider: StorageSourceType): string {
  if (provider === "onedrive") return "OneDrive";
  if (provider === "google_drive") return "Google Drive";
  return "Lokale bestanden (test)";
}
