import Link from "next/link";
import { MISSING_PROFILE_MESSAGE, MISSING_SOURCE_MESSAGE, type CreationResult } from "@/lib/learning-space-creation-wizard";
import { LearningSpaceSetupNotice } from "./learning-space-setup-notice";

export function LearningSpaceCreationSuccess({ result }: { result: Extract<CreationResult, { error: null }> }) {
  const setup = { missingProfile: result.warnings.includes(MISSING_PROFILE_MESSAGE), missingSource: result.warnings.includes(MISSING_SOURCE_MESSAGE) };
  const incomplete = setup.missingProfile || setup.missingSource;
  const warnings = result.warnings.filter((warning) => warning !== MISSING_PROFILE_MESSAGE && warning !== MISSING_SOURCE_MESSAGE);
  return <section className="creation-success" aria-labelledby="creation-success-title">
    <h3 id="creation-success-title">Leeromgeving aangemaakt</h3>
    <p className="success-message" role="status">{incomplete ? "Je kunt meteen verder. Voor synchronisatie ontbreken nog enkele instellingen." : result.summary === "Leeromgeving aangemaakt." ? "Je kunt meteen verder in je nieuwe leeromgeving." : result.summary}</p>
    <LearningSpaceSetupNotice setup={setup} slug={result.slug} canConfigure title={null} />
    {warnings.map((warning) => <p className="archived-message" key={warning}>{warning}</p>)}
    <div className="create-space-actions">
      {result.editProfileId ? <Link className="primary-button link-button" href={`/admin/bronprofielen?profile=${encodeURIComponent(result.editProfileId)}`}>Eigen bronprofiel aanpassen</Link> : null}
      <Link className="secondary-button link-button" href={`/admin/${encodeURIComponent(result.slug)}`}>Naar de leeromgeving</Link>
      {!incomplete ? <Link className="secondary-button link-button" href={`/admin/${encodeURIComponent(result.slug)}/instellingen`}>Instellingen</Link> : null}
    </div>
  </section>;
}
