"use client";

import { useActionState, useState } from "react";

import type { LearningSpace, StorageSourceType } from "@/lib/repositories";
import type { AdminActionState } from "@/app/admin/actions";

export function LearningSpaceSettingsForm({
  space,
  action,
}: {
  space: LearningSpace;
  action: (previousState: AdminActionState, formData: FormData) => AdminActionState | Promise<AdminActionState>;
}) {
  const [sourceType, setSourceType] = useState<StorageSourceType>(space.sourceType);
  const [state, actionState] = useActionState(action, { error: null });

  return <form action={actionState} className="learning-space-settings-form">
    <input type="hidden" name="id" value={space.id} />

    <section className="settings-card" aria-labelledby="general-settings-heading">
      <h2 id="general-settings-heading">Algemeen</h2>
      <div className="settings-grid">
        <label>Naam<input name="name" defaultValue={space.name} required maxLength={100} /></label>
        <label>Publieke slug<input name="slug" defaultValue={space.slug} required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /><small>Wordt gebruikt in de URL, bijvoorbeeld /6.</small></label>
        <label>Kort label<input name="shortLabel" defaultValue={space.shortLabel} required maxLength={20} /><small>Compacte naam voor de navigatie, bijvoorbeeld 6.</small></label>
        <label>Sortering<input name="sortOrder" type="number" defaultValue={space.sortOrder} required /><small>Bepaalt de volgorde van leeromgevingen in de navigatie.</small></label>
      </div>
    </section>

    <section className="settings-card" aria-labelledby="source-settings-heading">
      <h2 id="source-settings-heading">Bronbestanden</h2>
      <label className="source-type">Brontype<select name="sourceType" value={sourceType} onChange={(event) => setSourceType(parseSourceType(event.target.value))}><option value="local">Local filesystem</option><option value="onedrive">OneDrive</option><option value="google_drive">Google Drive</option></select></label>
      {sourceType === "local" ? <label className="source-path">Lokale bronmap<input name="localSourcePath" defaultValue={space.localSourcePath ?? ""} placeholder="C:\\..." /></label> : null}
      {sourceType === "onedrive" ? <div className="settings-grid one-drive-fields">
        <label>OneDrive drive-ID<input name="oneDriveDriveId" defaultValue={space.oneDriveDriveId ?? ""} required /></label>
        <label>OneDrive map-ID<input name="oneDriveFolderId" defaultValue={space.oneDriveFolderId ?? ""} required /></label>
        <label className="field-full">OneDrive mapnaam of pad<input name="oneDriveFolderPath" defaultValue={space.oneDriveFolderPath ?? ""} /></label>
        <p className="source-connection-status">{space.oneDriveDriveId && space.oneDriveFolderId ? "Een OneDrive-bron is voor deze leeromgeving geconfigureerd." : "Vul drive-ID en map-ID in om deze OneDrive-bron te configureren."}</p>
      </div> : null}
      {sourceType === "google_drive" ? <div className="settings-grid google-drive-fields">
        <label>Google Drive folder-ID<input name="googleDriveFolderId" defaultValue={space.googleDriveFolderId ?? ""} required pattern="[A-Za-z0-9_-]+" /></label>
        <label>Herkenbaar label of pad<input name="googleDriveFolderLabel" defaultValue={space.googleDriveFolderLabel ?? ""} maxLength={240} placeholder="Mirror 6de jaar" /></label>
        <p className="source-connection-status">De Google Drive-map moet gedeeld zijn met het geconfigureerde service account als Viewer.</p>
      </div> : null}
    </section>

    {state.error ? <p className="form-message" role="alert">{state.error}</p> : null}
    <button className="primary-button settings-save-button" type="submit">Opslaan</button>
  </form>;
}

function parseSourceType(value: string): StorageSourceType {
  if (value === "onedrive" || value === "google_drive") return value;
  return "local";
}
