export const ERROR_REPORT_RATE_LIMIT_MESSAGE = "Je hebt op korte tijd veel meldingen verstuurd. Probeer straks opnieuw.";
export const ERROR_REPORT_GENERIC_ERROR_MESSAGE = "De melding kon niet worden verstuurd. Probeer later opnieuw.";

export async function errorReportSubmissionErrorMessage(response: Response): Promise<string> {
  if (response.status !== 429) return ERROR_REPORT_GENERIC_ERROR_MESSAGE;
  const payload = await response.json().catch(() => null) as { error?: unknown } | null;
  return payload?.error === ERROR_REPORT_RATE_LIMIT_MESSAGE
    ? ERROR_REPORT_RATE_LIMIT_MESSAGE
    : ERROR_REPORT_GENERIC_ERROR_MESSAGE;
}
