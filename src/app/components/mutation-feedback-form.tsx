"use client";

import { unstable_rethrow } from "next/navigation";
import { useState, type ComponentProps } from "react";
import { useToast } from "./flash-toast";

export interface MutationFeedback { error?: string | null; validationError?: string | null; }

/** Opt-in feedback for the supplied mutation; page errors and auth redirects remain framework-owned. */
export function useMutationFeedback() {
  const show = useToast();
  return async <T,>(action: () => T | Promise<T>, successMessage?: string, errorMessage = "De wijziging kon niet worden opgeslagen. Probeer opnieuw."): Promise<{ ok: boolean; result?: T; validationError?: string }> => {
    try {
      const result = await action();
      const feedback = result as MutationFeedback | undefined;
      if (feedback?.validationError) return { ok: false, validationError: feedback.validationError };
      if (feedback?.error) { show({ type: "error", message: feedback.error }); return { ok: false }; }
      if (successMessage) show({ type: "success", message: successMessage });
      return { ok: true, result };
    } catch (error) {
      unstable_rethrow(error);
      // Next sanitizes thrown server errors in production. Preserve those boundaries,
      // including access failures; operational server failures are returned explicitly.
      if (error instanceof Error && (error.name === "AuthorizationError" || "digest" in error)) throw error;
      show({ type: "error", message: errorMessage });
      return { ok: false };
    }
  };
}

export function MutationFeedbackForm({ action, successMessage, errorMessage, children, ...props }: Omit<ComponentProps<"form">, "action"> & {
  action: (formData: FormData) => unknown | Promise<unknown>;
  successMessage?: string;
  errorMessage?: string;
}) {
  const run = useMutationFeedback();
  const [validationError, setValidationError] = useState<string | null>(null);
  return <form {...props} onReset={props.onReset ?? ((event) => event.preventDefault())} action={async (data) => {
    setValidationError(null);
    const outcome = await run(() => action(data), successMessage, errorMessage);
    setValidationError(outcome.validationError ?? null);
  }}>
    {children}
    {validationError ? <p className="form-error inline-validation" role="alert">{validationError}</p> : null}
  </form>;
}
