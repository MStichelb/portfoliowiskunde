import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/student-error-report-actions", () => ({ dismissHandledReportNotificationsAction: vi.fn() }));

import { StudentHandledReportNotificationBanner } from "./student-handled-report-notification";

describe("StudentHandledReportNotificationBanner", () => {
  it("renders nothing without pending handled reports", () => {
    expect(renderToStaticMarkup(<StudentHandledReportNotificationBanner notification={null} />)).toBe("");
  });

  it("renders the singular exercise message, accessible controls and no report content", () => {
    const markup = renderToStaticMarkup(<StudentHandledReportNotificationBanner notification={{
      reportIds: ["report-1"], count: 1, exerciseCode: "12a", singleLearningSpaceId: "space-5",
    }} />);

    expect(markup).toContain("Je melding over oefening 12a werd behandeld. Bedankt voor je scherpe blik!");
    expect(markup).toContain("Bekijk melding");
    expect(markup).toContain('href="/mijn-meldingen"');
    expect(markup).toContain('role="region"');
    expect(markup).toContain('aria-label="Melding sluiten"');
    expect(markup).not.toContain("teacher_response");
  });

  it("uses the safe singular fallback for an unmatched exercise", () => {
    const markup = renderToStaticMarkup(<StudentHandledReportNotificationBanner notification={{
      reportIds: ["report-1"], count: 1, exerciseCode: null, singleLearningSpaceId: "space-5",
    }} />);
    expect(markup).toContain("Je foutmelding werd behandeld. Bedankt voor je scherpe blik!");
    expect(markup).not.toContain("oefening null");
  });

  it("aggregates multiple reports into exactly one banner", () => {
    const markup = renderToStaticMarkup(<StudentHandledReportNotificationBanner notification={{
      reportIds: ["report-1", "report-2", "report-3"], count: 3, exerciseCode: null, singleLearningSpaceId: null,
    }} />);
    expect(markup).toContain("3 van je meldingen werden behandeld. Bedankt voor je scherpe blik!");
    expect(markup).toContain("Bekijk mijn meldingen");
    expect(markup.match(/student-report-notification/g)).toHaveLength(1);
    expect(markup.match(/name="reportId"/g)).toHaveLength(3);
  });
});
