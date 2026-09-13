"use client";

import { CircleHelp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  exerciseScannerSchema,
  type ExerciseNumberLocation,
  type ExerciseScannerConfig,
} from "@/lib/source-profile-config";

const numberLocationLabels: Record<ExerciseNumberLocation, string> = {
  after_text: "Na tekst",
  start: "Aan begin van naam",
};

type SourceProfileExerciseScannerEditorProps = {
  scanner: ExerciseScannerConfig;
  editorKey?: string;
  embedded?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
};

export function SourceProfileExerciseScannerEditor(props: SourceProfileExerciseScannerEditorProps) {
  const initial = useMemo(() => exerciseScannerSchema.parse(props.scanner), [props.scanner]);
  const resetKey = `${props.editorKey ?? "scanner"}:${JSON.stringify(initial)}`;
  return <SourceProfileExerciseScannerEditorState key={resetKey} {...props} initial={initial} />;
}

function SourceProfileExerciseScannerEditorState({
  initial,
  embedded = false,
  onDirtyChange,
}: SourceProfileExerciseScannerEditorProps & { initial: ExerciseScannerConfig }) {
  const baseline = useMemo(() => JSON.stringify(initial), [initial]);
  const [value, setValue] = useState<ExerciseScannerConfig>(initial);
  const [showHelp, setShowHelp] = useState(false);
  const serialized = JSON.stringify(value);

  useEffect(() => {
    onDirtyChange?.(serialized !== baseline);
  }, [baseline, onDirtyChange, serialized]);

  const fields = <>
    <input type="hidden" name="exerciseScannerJson" value={serialized} />
    <div className="source-profile-resource-details">
      <div className="source-profile-recognition-panel">
        <label className="source-profile-recognition-label" htmlFor="exercise-number-location">Nummer vinden</label>
        <div className="source-profile-recognition-grid">
          <select
            id="exercise-number-location"
            aria-label="Oefeningsnummer vinden"
            value={value.numberLocation}
            onChange={(event) => setValue((current) => ({ ...current, numberLocation: event.target.value as ExerciseNumberLocation }))}
          >
            {Object.entries(numberLocationLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          {value.numberLocation === "after_text" ? <input
            aria-label="Tekst voor oefeningsnummer"
            value={value.marker}
            maxLength={40}
            required
            onChange={(event) => setValue((current) => ({ ...current, marker: event.target.value }))}
          /> : <div className="source-profile-resource-readonly-type"><span>Nummer</span><strong>Start meteen met een cijfer</strong></div>}
        </div>
      </div>
    </div>
  </>;

  return <section className="source-profile-resource-editor" aria-labelledby="exercise-scanner-heading">
    <div className="source-profile-resource-editor-heading">
      <div>
        <div className="source-profile-resource-title-row">
          <h3 id="exercise-scanner-heading">Oefeningen herkennen</h3>
          <button className="source-profile-help-button" type="button" onClick={() => setShowHelp((current) => !current)} aria-expanded={showHelp} aria-label="Uitleg over oefeningen herkennen" title="Uitleg over oefeningen herkennen"><CircleHelp size={17} aria-hidden /></button>
        </div>
        <p>Stel in waar het oefeningsnummer in bestands- en mapnamen begint.</p>
      </div>
    </div>
    {showHelp ? <div className="source-profile-resource-help" role="note">
      <strong>Hoe werkt de herkenning?</strong>
      <p>Het portfolionummer komt uit de portfoliomap en hoeft dus niet uit de bestandsnaam te worden gehaald. Tekst vóór de ingestelde markering mag vrij voorkomen, bijvoorbeeld <code>PF1-Oef3a.png</code>.</p>
      <p>Ondersteund zijn onder andere <code>3</code>, <code>12</code>, <code>3a</code>, <code>12b</code> en <code>3a1</code>. Een naam als <code>Oef3a(1).png</code> blijft oefening <code>3a</code>; <code>(1)</code> kan als extra bestand/stap dienen.</p>
      <p>De scanner combineert het mogelijke oefeningsnummer met de regels van de onderdelen. Zo wordt <code>Oef3uitwerking.png</code> oefening 3 wanneer “uitwerking” bij een onderdeel past, terwijl <code>Oef3auitwerking.png</code> oefening 3a kan worden.</p>
      <p>Portfolio-onderdelen worden per portfolio automatisch herkend als mappen volgens <code>nummer - titel</code>, bijvoorbeeld <code>1 - Oppervlakte</code>. Een portfolio mag ook helemaal geen onderdelen hebben.</p>
      <p>Oefeningen mogen zowel als bestanden als als mappen voorkomen; daarvoor is geen aparte instelling nodig.</p>
    </div> : null}
    {embedded ? <div className="source-profile-resource-form source-profile-resource-form-embedded">{fields}</div> : <div className="source-profile-resource-form">{fields}</div>}
  </section>;
}
