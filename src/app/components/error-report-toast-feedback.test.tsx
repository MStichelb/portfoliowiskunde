import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ status: "sent" }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => [initial === "idle" ? state.status : initial, vi.fn()],
}));
vi.mock("./flash-toast", () => ({
  FlashToast: ({ type, message }: { type: string; message: string }) => <span data-toast={type}>{message}</span>,
}));
import { ErrorReportForm } from "./error-report-form";
import { PortfolioErrorReportForm } from "./portfolio-error-report-form";

describe("public report action feedback", () => {
  it.each(["sent", "error"])("uses a shared toast for %s, independently of the disclosure", (status) => {
    state.status = status;
    const forms = [
      <ErrorReportForm key="exercise" exerciseId="exercise-1" variants={["standard"]} />,
      <PortfolioErrorReportForm key="portfolio" portfolioId="portfolio-1" documents={["assignment"]} exercises={[]} />,
      <ErrorReportForm key="exercise-open" exerciseId="exercise-1" variants={["standard"]} initiallyOpen />,
      <PortfolioErrorReportForm key="portfolio-open" portfolioId="portfolio-1" documents={["assignment"]} exercises={[]} initiallyOpen />,
    ];
    for (const form of forms) {
      const markup = renderToStaticMarkup(form);
      expect(markup).toContain(`data-toast="${status === "sent" ? "success" : "error"}"`);
      expect(markup).not.toMatch(/success-message|error-message/);
      if (status === "error" && form.props.initiallyOpen) expect(markup).toContain('class="report-form"');
    }
  });
});
