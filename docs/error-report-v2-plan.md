# Foutmeldingen v2

## Model

`error_report_issues` bevat één inhoudelijke foutlocatie en bewaart de workflowstatus, pin en beheernotitie. `error_reports` blijft de onveranderde geschiedenis van individuele leerlingmeldingen en verwijst additief via `issue_id` naar het issue. De nieuwe nullable `reporter_user_id` verwijst naar de interne user en wordt bij een userreset op `NULL` gezet; `reporter_name` blijft als historische snapshot bestaan.

D1 met migratie 027 is afgerond. D2 voegt het server-side grouped readmodel toe: één issue per resultaat, aangevuld met portfolio-, sectie- en oefeningscontext en geaggregeerde reportgegevens. De overzichtsquery gebruikt één vaste SQL-query met een gegroepeerde reportsubquery; issue-detail gebruikt één afzonderlijke expliciete query.

Batch E en E.1 zijn afgerond. Een ingelogde leerling kan vanaf de publieke portfoliopagina een bestaand opgaven-, eindoplossingen- of hintsdocument kiezen en vrij een oefeningcode invullen. Geïndexeerde oefeningen worden alleen als suggestie aangeboden. De server valideert de LearningSpace, portfolio, documentbeschikbaarheid en eventuele alternatieve uitwerking opnieuw. De bestaande solution-page disclosure gebruikt dezelfde API- en repository-writeflow.

De locatie-identiteit is:

`learning_space_id + portfolio_id + document_kind + (exercise_id of exercise_code) + variant_kind`

Migratie 028 bewaart de genormaliseerde `exercise_code` op ieder issue en maakt `exercise_id` optioneel. Bestaande issues worden vanuit hun gekoppelde oefening gebackfilled. Matching gebeurt exact en uitsluitend binnen de gekozen portfolio; er is geen fuzzy matching. Bij een onbekende code blijft `exercise_id` leeg en vormt de genormaliseerde code de issue-identiteit. Een unieke expression index behandelt zowel deze fallback als een `NULL`-variant voorspelbaar in SQLite en PostgreSQL.

Onbekende oefeningen blijven als afzonderlijke issues zichtbaar. Omdat hun varianten niet betrouwbaar uit de index afgeleid kunnen worden, ondersteunen ze alleen de standaarduitwerking. Een toekomstige modernisering van de portfolio-opbouw kan de matching later verfijnen zonder deze meldingen te verliezen.

## Legacy migratie

Migratie 027 groepeert alle bestaande solutionmeldingen als `document_kind = final_solutions`. Een issue wordt `TODO` wanneer minstens één gekoppelde melding TODO is, en pinned wanneer minstens één melding pinned is. De oudste `created_at` en nieuwste `updated_at` worden gebruikt. `completed_at` wordt alleen overgenomen voor volledig afgeronde groepen waarvan iedere melding een voltooiingstijd heeft.

Bij exact één unieke niet-lege beheernotitie wordt die op het issue gezet. Bij meerdere verschillende notities blijft de issue-notitie voorlopig leeg en blijven alle oorspronkelijke teksten onaangeroerd in de redundante `error_reports.admin_note`-kolom. Daardoor gaat in D1 geen tekst verloren; D2 kan die uitzonderingen expliciet presenteren of consolideren.

De bestaande reportkolommen voor locatie, status, pin en notitie blijven bewust staan. Daardoor blijven de huidige API, adminqueries en acties werken tot de volgende batches zijn afgerond.

## Duplicaten

Een partial unique index op `(issue_id, reporter_user_id)` geldt alleen wanneer `reporter_user_id IS NOT NULL`. Een ingelogde user kan daardoor later maximaal één melding per issue hebben, terwijl meerdere anonieme legacyreports met `NULL` behouden blijven.

De writeflow maakt of hergebruikt het issue via de unieke locatie-index. Een eerste melding maakt een report; een volgende melding van dezelfde user werkt die reporttekst en timestamp bij. Een andere user krijgt een tweede report onder hetzelfde issue. Een opnieuw gemeld DONE-issue gaat terug naar TODO en verliest zijn voltooiingstijd, terwijl pin en beheernotitie behouden blijven. Nieuwe reports bewaren `reporter_user_id` en laten `reporter_name` leeg.

`reportCount` is het totale aantal individuele meldingen onder een issue. `reporterCount` telt uitsluitend unieke niet-lege interne user-IDs; anonieme legacyreports en `reporter_name` worden niet als unieke users geïnterpreteerd.

De canonieke v2-teller `getOpenErrorIssueCount()` telt TODO-issues. Alle Batch E-writes zijn issuegericht; `getOpenErrorReportCount()` blijft alleen tijdelijk beschikbaar voor de nog niet gemigreerde admin-UI. Batch F schakelt de zichtbare teller om.

## Vervolg

- **F:** meldingen voor opgaven, eindoplossingen en hints uitbreiden.
- **G:** legacyvelden gecontroleerd opruimen nadat alle reads en writes issuegericht zijn.
