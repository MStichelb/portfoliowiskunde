"use client";

import { useState } from "react";

import type { StorageSourceType } from "@/lib/repositories";
import { DEFAULT_LEARNING_SPACE_COLOR, DEFAULT_LEARNING_SPACE_DESCRIPTION } from "@/lib/ui-colors";

interface LearningSpaceCreateFormProps {
  action: (formData: FormData) => void | Promise<void>;
  error?: string | null;
  generalOnly?: boolean;
  onCancel?: () => void;
  returnTo?: "admin";
}

export function LearningSpaceCreateForm({ action, error = null, generalOnly = false, onCancel, returnTo }: LearningSpaceCreateFormProps) {
  const [sourceType, setSourceType] = useState<StorageSourceType>("onedrive");

  return <form action={action} className="learning-space-create-form">
    {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
    <fieldset>
      <legend className="sr-only">Gegevens leeromgeving</legend>
      <div className="settings-grid create-general-grid">
        <label>Weergavenaam<input name="name" required maxLength={100} placeholder="5MTWE 5LWE" /><small>Met deze naam verschijnt de leeromgeving bij de leerlingen.</small></label>
        <label>URL<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="5we" /><small>Dit wordt gebruikt in het webadres van deze leeromgeving.</small></label>
        <label>Kort label<input name="shortLabel" required maxLength={6} placeholder="5WET" /><small>Compacte naam voor de navigatie, maximaal 6 karakters.</small></label>
        <label>Sortering<input name="sortOrder" type="number" defaultValue={50} /><small>Dit bepaalt de volgorde in de navigatie.</small></label>
        <label className="field-full">{generalOnly ? "Omschrijving" : "Beschrijving"}<textarea name="description" defaultValue={DEFAULT_LEARNING_SPACE_DESCRIPTION} maxLength={240} rows={3} /><small>Korte beschrijving die op het kaartje voor leerlingen verschijnt.</small></label>
        <label className="color-field">Kleur<span><input name="cardColor" type="color" defaultValue={DEFAULT_LEARNING_SPACE_COLOR} /><code>{DEFAULT_LEARNING_SPACE_COLOR}</code></span></label>
      </div>
    </fieldset>
    {!generalOnly ? <fieldset>
      <legend className="sr-only">Bronconfiguratie</legend>
      <div className="create-source-fields">
        <label className="source-type">Brontype<select name="sourceType" value={sourceType} onChange={(event) => setSourceType(parseSourceType(event.target.value))}><option value="onedrive">OneDrive</option><option value="google_drive">Google Drive</option><option value="local">Lokale bestanden (test)</option></select></label>
        {sourceType === "local" ? <label className="source-path">Lokale bronmap<input name="localSourcePath" placeholder="C:\\..." /></label> : null}
        {sourceType === "onedrive" ? <div className="settings-grid"><label>OneDrive drive-ID<input name="oneDriveDriveId" required /></label><label>OneDrive map-ID<input name="oneDriveFolderId" required /></label><label className="field-full">OneDrive mapnaam of pad<input name="oneDriveFolderPath" /></label></div> : null}
        {sourceType === "google_drive" ? <div className="settings-grid"><label>Google Drive folder-ID<input name="googleDriveFolderId" required pattern="[A-Za-z0-9_-]+" /></label><label>Herkenbaar label of pad<input name="googleDriveFolderLabel" maxLength={240} /></label><p className="source-connection-status">De Google Drive-map moet gedeeld zijn met het geconfigureerde service account als Viewer.</p></div> : null}
      </div>
    </fieldset> : null}
    {error ? <p className="form-message" role="alert">{error}</p> : null}
    <div className="create-space-actions">{onCancel ? <button className="secondary-button" type="button" onClick={onCancel}>Annuleren</button> : null}<button className="primary-button" type="submit">Leeromgeving toevoegen</button></div>
  </form>;
}

function parseSourceType(value: string): StorageSourceType {
  if (value === "onedrive" || value === "google_drive") return value;
  return "local";
}
