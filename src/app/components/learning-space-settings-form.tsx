"use client";

import { useState } from "react";

import type { LearningSpace } from "@/lib/repositories";

export function LearningSpaceSettingsForm({
  space,
  action,
}: {
  space: LearningSpace;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [storageProvider, setStorageProvider] = useState<"local" | "onedrive">(space.storageProvider);

  return <form action={action} className="learning-space-settings-form">
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
      <label className="source-type">Brontype<select name="storageProvider" value={storageProvider} onChange={(event) => setStorageProvider(event.target.value === "onedrive" ? "onedrive" : "local")}><option value="local">Local filesystem</option><option value="onedrive">OneDrive</option></select></label>
      {storageProvider === "local" ? <label className="source-path">Lokale bronmap<input name="localSourcePath" defaultValue={space.localSourcePath ?? ""} placeholder="C:\\..." /></label> : <div className="settings-grid one-drive-fields">
        <label>OneDrive drive-ID<input name="oneDriveDriveId" defaultValue={space.oneDriveDriveId ?? ""} required /></label>
        <label>OneDrive map-ID<input name="oneDriveFolderId" defaultValue={space.oneDriveFolderId ?? ""} required /></label>
        <label className="field-full">OneDrive mapnaam of pad<input name="oneDriveFolderPath" defaultValue={space.oneDriveFolderPath ?? ""} /></label>
        <p className="source-connection-status">{space.oneDriveDriveId && space.oneDriveFolderId ? "Een OneDrive-bron is voor deze leeromgeving geconfigureerd." : "Vul drive-ID en map-ID in om deze OneDrive-bron te configureren."}</p>
      </div>}
    </section>

    <button className="primary-button settings-save-button" type="submit">Opslaan</button>
  </form>;
}
