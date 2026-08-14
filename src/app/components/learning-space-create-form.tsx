"use client";

import { useState } from "react";

import type { StorageSourceType } from "@/lib/repositories";

export function LearningSpaceCreateForm({ action }: { action: (formData: FormData) => void | Promise<void> }) {
  const [sourceType, setSourceType] = useState<StorageSourceType>("local");
  return <form action={action} className="settings-form">
    <label>Naam<input name="name" required maxLength={100} placeholder="4de jaar" /></label>
    <label>Publieke slug<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="4" /></label>
    <label>Kort label<input name="shortLabel" required maxLength={20} placeholder="4" /></label>
    <label>Sortering<input name="sortOrder" type="number" defaultValue={40} /></label>
    <label>Bron<select name="sourceType" value={sourceType} onChange={(event) => setSourceType(parseSourceType(event.target.value))}><option value="local">Local filesystem</option><option value="onedrive">OneDrive</option><option value="google_drive">Google Drive</option></select></label>
    {sourceType === "local" ? <label>Lokale bronmap<input name="localSourcePath" placeholder="C:\\..." /></label> : null}
    {sourceType === "onedrive" ? <><label>OneDrive drive-ID<input name="oneDriveDriveId" required /></label><label>OneDrive map-ID<input name="oneDriveFolderId" required /></label><label>OneDrive mapnaam of pad<input name="oneDriveFolderPath" /></label></> : null}
    {sourceType === "google_drive" ? <><label>Google Drive folder-ID<input name="googleDriveFolderId" required pattern="[A-Za-z0-9_-]+" /></label><label>Herkenbaar label of pad<input name="googleDriveFolderLabel" maxLength={240} /></label><p className="source-connection-status">De Google Drive-map moet gedeeld zijn met het geconfigureerde service account als Viewer.</p></> : null}
    <button className="primary-button" type="submit">Leeromgeving toevoegen</button>
  </form>;
}

function parseSourceType(value: string): StorageSourceType {
  if (value === "onedrive" || value === "google_drive") return value;
  return "local";
}
