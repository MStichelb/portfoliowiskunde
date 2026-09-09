import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ dismiss: vi.fn(), refresh: vi.fn() }));

vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("@/lib/student-error-reports", () => ({ dismissPendingHandledReportNotificationsForCurrentUser: mocks.dismiss }));

import { dismissHandledReportNotificationsAction } from "./student-error-report-actions";

describe("dismissHandledReportNotificationsAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes only report references to the authorized current-user write path and refreshes the page", async () => {
    const formData = new FormData();
    formData.append("reportId", "report-1");
    formData.append("reportId", "report-2");
    formData.append("userId", "other-user");

    await dismissHandledReportNotificationsAction(formData);

    expect(mocks.dismiss).toHaveBeenCalledWith(["report-1", "report-2"]);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
