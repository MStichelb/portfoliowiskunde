"use server";

import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { dismissPendingHandledReportNotificationsForCurrentUser } from "@/lib/student-error-reports";

export async function dismissHandledReportNotificationsAction(formData: FormData) {
  try {
    await dismissPendingHandledReportNotificationsForCurrentUser(formData.getAll("reportId"));
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof Error && error.name === "AuthorizationError") throw error;
    return { error: "De melding kon niet worden gesloten. Probeer opnieuw." };
  }
  refresh();
}
