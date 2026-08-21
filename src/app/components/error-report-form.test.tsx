import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ErrorReportForm } from "./error-report-form";

describe("ErrorReportForm", () => {
  it("starts as an accessible collapsed disclosure", () => {
    const markup = renderToStaticMarkup(<ErrorReportForm exerciseId="exercise-1" variants={["standard"]} />);

    expect(markup).toContain("Foutje gezien? Meld het.");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain('name="reporterName"');
  });

  it("renders an optional reporter name with guidance and a client-side length hint when open", () => {
    const markup = renderToStaticMarkup(<ErrorReportForm exerciseId="exercise-1" variants={["standard"]} initiallyOpen />);

    expect(markup).toContain("Naam <em>(optioneel)</em>");
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('name="reporterName"');
    expect(markup).toContain('maxLength="100"');
    expect(markup).not.toContain('name="reporterName" required');
    expect(markup).toContain("Vul je naam in als je graag een persoonlijke terugkoppeling wilt.");
  });
});
