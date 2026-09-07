"use client";

import { useState, useTransition } from "react";

import type { EditorPermissionsActionState } from "@/app/admin/actions";

export type EditorPermissionsAction = (learningSpaceId: string, enabled: boolean) => Promise<EditorPermissionsActionState>;

export function EditorPermissionsToggle({
  learningSpaceId,
  initialEnabled,
  canChange,
  action,
}: {
  learningSpaceId: string;
  initialEnabled: boolean;
  canChange: boolean;
  action: EditorPermissionsAction;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const label = enabled ? "Bewerkers kunnen toegang beheren" : "Bewerkers kunnen geen toegang beheren";
  const helpText = enabled
    ? "Bewerkers mogen Smartschoolgroepen en individuele leerlingen aan deze leeromgeving koppelen."
    : "Alleen de eigenaar en beheerders mogen Smartschoolgroepen en individuele leerlingen aan deze leeromgeving koppelen.";

  function toggle() {
    if (!canChange || isPending) return;
    const previous = enabled;
    const requested = !enabled;
    setEnabled(requested);
    setError(null);
    startTransition(async () => {
      const result = await commitEditorPermissionsToggle(previous, requested, () => action(learningSpaceId, requested));
      setEnabled(result.enabled);
      setError(result.error);
    });
  }

  return <section className="settings-card editor-permissions-card" aria-labelledby="editor-permissions-heading">
    <h2 id="editor-permissions-heading">Bewerkersrechten</h2>
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-readonly={!canChange || undefined}
      className={`editor-permissions-toggle${enabled ? " is-enabled" : ""}`}
      disabled={!canChange || isPending}
      onClick={toggle}
    >
      <span className="editor-permissions-track" aria-hidden><span /></span>
      <span>{label}</span>
    </button>
    <p className="editor-permissions-help">{helpText}</p>
    {isPending ? <small className="editor-permissions-feedback" role="status">Opslaan...</small> : null}
    {error ? <p className="form-message editor-permissions-feedback" role="alert">{error}</p> : null}
  </section>;
}

export async function commitEditorPermissionsToggle(
  previous: boolean,
  requested: boolean,
  action: () => Promise<EditorPermissionsActionState>,
): Promise<{ enabled: boolean; error: string | null }> {
  try {
    const result = await action();
    return result.saved
      ? { enabled: requested, error: null }
      : { enabled: previous, error: result.error ?? "De bewerkersrechten konden niet worden opgeslagen." };
  } catch {
    return { enabled: previous, error: "De bewerkersrechten konden niet worden opgeslagen." };
  }
}
