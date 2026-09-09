"use server";

import { refresh } from "next/cache";

import { dismissPendingHandledReportNotificationsForCurrentUser } from "@/lib/student-error-reports";

export async function dismissHandledReportNotificationsAction(formData: FormData): Promise<void> {
  await dismissPendingHandledReportNotificationsForCurrentUser(formData.getAll("reportId"));
  refresh();
}
