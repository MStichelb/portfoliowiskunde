"use client";

import { useState } from "react";

import type { StorageSourceType } from "@/lib/repositories";

export function LearningSpaceCreateForm({ action }: { action: (formData: FormData) => void | Promise<void> }) {
  const [sourceType, setSourceType] = useState<StorageSourceType>("local");

  return <form action={action} className="learning-space-create-form">
    <fieldset>
      <legend>Algemeen</legend>
      <div className="settings-grid">
        <label>Naam<input name="name" required maxLength={100} placeholder="4de jaar" /></label>
        <label>Publieke slug<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="4" /><small>Wordt gebruikt in de URL, bijvoorbeeld /4.</small></label>
        <label>Kort label<input name="shortLabel" required maxLength={20} placeholder="4" /><small>Compacte naam voor de navigatie, bijvoorbeeld 4.</small></label>
        <label>Sortering<input name="sortOrder" type="number" defaultValue={40} /><small>Bepaalt de volgorde in de navigatie.</small></label>
      </div>
    </fieldset>
    <fieldset>
      <legend>Bronbestanden</legend>
      <div className="create-source-fields">
        <label className="source-type">Brontype<select name="sourceType" value={sourceType} onChange={(event) => setSourceType(parseSourceType(event.target.value))}><option value="local">Local filesystem</option><option value="onedrive">OneDrive</option><option value="google_drive">Google Drive</option></select></label>
        {sourceType === "local" ? <label className="source-path">Lokale bronmap<input name="localSourcePath" placeholder="C:\\..." /></label> : null}
        {sourceType === "onedrive" ? <div className="settings-grid"><label>OneDrive drive-ID<input name="oneDriveDriveId" required /></label><label>OneDrive map-ID<input name="oneDriveFolderId" required /></label><label className="field-full">OneDrive mapnaam of pad<input name="oneDriveFolderPath" /></label></div> : null}
        {sourceType === "google_drive" ? <div className="settings-grid"><label>Google Drive folder-ID<input name="googleDriveFolderId" required pattern="[A-Za-z0-9_-]+" /></label><label>Herkenbaar label of pad<input name="googleDriveFolderLabel" maxLength={240} /></label><p className="source-connection-status">De Google Drive-map moet gedeeld zijn met het geconfigureerde service account als Viewer.</p></div> : null}
      </div>
    </fieldset>
    <div className="create-space-actions"><button className="primary-button" type="submit">Leeromgeving toevoegen</button></div>
  </form>;
}

function parseSourceType(value: string): StorageSourceType {
  if (value === "onedrive" || value === "google_drive") return value;
  return "local";
}
