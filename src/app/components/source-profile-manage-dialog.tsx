"use client";

import { Archive, Copy, Link2, Save, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { ManagedSourceProfile } from "@/lib/source-profiles";

import { SourceProfileExerciseConfigurationEditors } from "./source-profile-exercise-configuration-editors";
import { SourceProfileGlobalResourcesEditor } from "./source-profile-global-resources-editor";

type ServerAction = (formData: FormData) => void | Promise<void>;

export function SourceProfileManageDialog({
  profile,
  saveAction,
  archiveAction,
  error,
}: {
  profile: ManagedSourceProfile;
  saveAction: ServerAction;
  archiveAction: ServerAction;
  error?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const saveModeRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(profile.name);
  const [globalResourcesDirty, setGlobalResourcesDirty] = useState(false);
  const [exerciseScannerDirty, setExerciseScannerDirty] = useState(false);
  const [exerciseResourcesDirty, setExerciseResourcesDirty] = useState(false);
  const [closePrompt, setClosePrompt] = useState(false);
  const [sharedPrompt, setSharedPrompt] = useState(false);
  const [splitTarget, setSplitTarget] = useState("");
  const dirty = name !== profile.name || globalResourcesDirty || exerciseScannerDirty || exerciseResourcesDirty;
  const shared = profile.usageCount > 1;
  const router = useRouter();

const leave = useCallback(() => {
    router.push("/admin/bronprofielen");
  }, [router]);

  const requestClose = useCallback(() => {
    if (dirty) setClosePrompt(true);
    else leave();
  }, [dirty, leave]);

  const submit = useCallback((mode: "all" | "copy", targetLearningSpaceId = "") => {
    if (!formRef.current || !saveModeRef.current || !targetRef.current) return;
    saveModeRef.current.value = mode;
    targetRef.current.value = targetLearningSpaceId;
    formRef.current.requestSubmit();
  }, []);

  const requestSave = useCallback(() => {
    if (!formRef.current?.reportValidity()) return;
    if (shared) {
      setClosePrompt(false);
      setSharedPrompt(true);
      return;
    }
    submit("all");
  }, [shared, submit]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (sharedPrompt) {
        setSharedPrompt(false);
        return;
      }
      if (closePrompt) {
        setClosePrompt(false);
        return;
      }
      requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePrompt, requestClose, sharedPrompt]);

  return <div className="confirm-backdrop" role="presentation">
    <div className="source-profile-dialog source-profile-dialog-wide source-profile-manage-dialog" role="dialog" aria-modal="true" aria-labelledby="manage-source-profile-title">
      <form ref={formRef} action={saveAction}>
        <input type="hidden" name="sourceProfileId" value={profile.id} />
        <input ref={saveModeRef} type="hidden" name="saveMode" defaultValue="all" />
        <input ref={targetRef} type="hidden" name="targetLearningSpaceId" defaultValue="" />

        <div className="source-profile-dialog-heading source-profile-dialog-heading-sticky">
          <h2 id="manage-source-profile-title">Bronprofiel beheren</h2>
          <div className="source-profile-dialog-heading-actions">
            {profile.canArchive ? <button className="secondary-button" type="submit" formAction={archiveAction}><Archive size={16} aria-hidden />Archiveren</button> : null}
            <button className="primary-button" type="button" onClick={requestSave}><Save size={16} aria-hidden />Opslaan</button>
            <button className="icon-button" type="button" onClick={requestClose} aria-label="Sluiten" title="Sluiten"><X size={18} aria-hidden /></button>
          </div>
        </div>

        <div className="source-profile-manage-content">
          <div className="source-profile-central-usage">
            <span>{profile.isInactive
              ? "Inactief"
              : <>Gebruikt in: <strong>{profile.usages.map((usage) => usage.learningSpaceShortLabel).join(", ")}</strong></>}</span>
            {profile.ownerName ? <small>Eigenaar: {profile.ownerName}</small> : null}
          </div>

          <div className="source-profile-dialog-form source-profile-main-fields">
            <label>Profielnaam<input name="name" value={name} maxLength={80} required onChange={(event) => setName(event.target.value)} /></label>
          </div>

          {error ? <p className="form-message" role="alert">{error}</p> : null}

          <SourceProfileGlobalResourcesEditor
            resources={profile.config.globalResources}
            ownerIdField="sourceProfileId"
            ownerId={profile.id}
            embedded
            onDirtyChange={setGlobalResourcesDirty}
          />

          <SourceProfileExerciseConfigurationEditors
            key={profile.id}
            scanner={profile.config.scanner.exercise}
            resources={profile.config.exerciseResources}
            ownerIdField="sourceProfileId"
            ownerId={profile.id}
            editorKey={profile.id}
            onScannerDirtyChange={setExerciseScannerDirty}
            onResourcesDirtyChange={setExerciseResourcesDirty}
          />

        </div>
      </form>

      {closePrompt ? <div className="confirm-backdrop source-profile-nested-backdrop" role="presentation">
        <div className="source-profile-dialog source-profile-choice-dialog" role="dialog" aria-modal="true" aria-labelledby="unsaved-source-profile-title">
          <div className="source-profile-dialog-heading">
            <h2 id="unsaved-source-profile-title">Niet-opgeslagen wijzigingen</h2>
          </div>
          <p>Waarschuwing: er zijn niet-opgeslagen wijzigingen gemaakt. Wil je die opslaan of negeren?</p>
          <div className="source-profile-choice-actions">
            <button className="secondary-button" type="button" onClick={() => setClosePrompt(false)}>Verder bewerken</button>
            <button className="secondary-button" type="button" onClick={leave}>Wijzigingen negeren</button>
            <button className="primary-button" type="button" onClick={requestSave}><Save size={16} aria-hidden />Opslaan</button>
          </div>
        </div>
      </div> : null}

      {sharedPrompt ? <div className="confirm-backdrop source-profile-nested-backdrop" role="presentation">
        <div className="source-profile-dialog source-profile-choice-dialog source-profile-shared-save-dialog" role="dialog" aria-modal="true" aria-labelledby="shared-source-profile-save-title">
          <div className="source-profile-dialog-heading">
            <h2 id="shared-source-profile-save-title">Gedeeld bronprofiel opslaan</h2>
            <button className="icon-button" type="button" onClick={() => setSharedPrompt(false)} aria-label="Sluiten" title="Sluiten"><X size={18} aria-hidden /></button>
          </div>
          <div className="source-profile-shared-warning">
            <strong><Link2 size={16} aria-hidden />Dit profiel is gedeeld.</strong>
            <p>Opslaan voor iedereen past het profiel aan in alle gekoppelde leeromgevingen:</p>
            <ul>{profile.usages.map((usage) => <li key={usage.learningSpaceId}>{usage.learningSpaceShortLabel}</li>)}</ul>
          </div>
          <div className="source-profile-split-choice">
            <label>Of maak een onafhankelijke kopie voor één leeromgeving
              <select value={splitTarget} onChange={(event) => setSplitTarget(event.target.value)}>
                <option value="">Kies een leeromgeving</option>
                {profile.usages.map((usage) => <option key={usage.learningSpaceId} value={usage.learningSpaceId}>{usage.learningSpaceShortLabel} — {usage.learningSpaceName}</option>)}
              </select>
            </label>
            <p>De gekozen leeromgeving krijgt een onafhankelijke kopie met deze wijzigingen. Het gedeelde origineel blijft voor de andere leeromgevingen ongewijzigd.</p>
          </div>
          <div className="source-profile-choice-actions">
            <button className="secondary-button" type="button" onClick={() => setSharedPrompt(false)}>Annuleren</button>
            <button className="secondary-button" type="button" disabled={!splitTarget} onClick={() => submit("copy", splitTarget)}><Copy size={16} aria-hidden />Als kopie opslaan</button>
            <button className="primary-button" type="button" onClick={() => submit("all")}><Save size={16} aria-hidden />Voor alle opslaan</button>
          </div>
        </div>
      </div> : null}
    </div>
  </div>;
}
