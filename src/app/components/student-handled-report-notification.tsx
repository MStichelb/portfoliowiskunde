import { X } from "lucide-react";
import Link from "next/link";

import { dismissHandledReportNotificationsAction } from "@/app/student-error-report-actions";
import type { StudentHandledReportNotification } from "@/lib/student-error-reports";

export function StudentHandledReportNotificationBanner({ notification }: { notification: StudentHandledReportNotification | null }) {
  if (!notification) return null;
  const singular = notification.count === 1;
  const message = singular
    ? notification.exerciseCode
      ? `Je melding over oefening ${notification.exerciseCode} werd behandeld. Bedankt voor je scherpe blik!`
      : "Je foutmelding werd behandeld. Bedankt voor je scherpe blik!"
    : `${notification.count} van je meldingen werden behandeld. Bedankt voor je scherpe blik!`;

  return <section className="student-report-notification" role="region" aria-label="Behandelde meldingen">
    <p>{message}</p>
    <Link href="/mijn-meldingen">{singular ? "Bekijk melding" : "Bekijk mijn meldingen"}</Link>
    <form action={dismissHandledReportNotificationsAction}>
      {notification.reportIds.map((reportId) => <input key={reportId} type="hidden" name="reportId" value={reportId} />)}
      <button type="submit" aria-label="Melding sluiten" title="Melding sluiten"><X size={16} aria-hidden /></button>
    </form>
  </section>;
}
