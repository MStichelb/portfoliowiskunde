# Foutmeldingen v2

## Model

Het canonieke model bestaat uit drie lagen:

- `error_report_threads`: één beheereenheid per oefening binnen een portfolio;
- `error_report_issues`: één exacte foutlocatie binnen die oefening, zoals Opgaven, Eindoplossingen, Hints of een individuele Uitwerking;
- `error_reports`: de onveranderde geschiedenis van individuele leerlingmeldingen onder een issue.

Status, pin en beheernotitie horen voortaan conceptueel bij de thread. De redundante workflowvelden op issues en reports blijven voorlopig bestaan voor compatibiliteit. De nullable `reporter_user_id` verwijst naar de interne user en wordt bij een userreset op `NULL` gezet; `reporter_name` blijft als historische snapshot bestaan.

D1 met migratie 027 is afgerond. D2 voegt het server-side grouped readmodel toe: één issue per resultaat, aangevuld met portfolio-, sectie- en oefeningscontext en geaggregeerde reportgegevens. De overzichtsquery gebruikt één vaste SQL-query met een gegroepeerde reportsubquery; issue-detail gebruikt één afzonderlijke expliciete query.

Batch E en E.1 zijn afgerond. Een ingelogde leerling kan vanaf de publieke portfoliopagina een bestaand opgaven-, eindoplossingen- of hintsdocument kiezen en vrij een oefeningcode invullen. Geïndexeerde oefeningen worden alleen als suggestie aangeboden. De server valideert de LearningSpace, portfolio, documentbeschikbaarheid en eventuele alternatieve uitwerking opnieuw. De bestaande solution-page disclosure gebruikt dezelfde API- en repository-writeflow.

De locatie-identiteit is:

`learning_space_id + portfolio_id + document_kind + (exercise_id of exercise_code) + variant_kind`

Migratie 028 bewaart de genormaliseerde `exercise_code` op ieder issue en maakt `exercise_id` optioneel. Bestaande issues worden vanuit hun gekoppelde oefening gebackfilled. Matching gebeurt exact en uitsluitend binnen de gekozen portfolio; er is geen fuzzy matching. Bij een onbekende code blijft `exercise_id` leeg en vormt de genormaliseerde code de issue-identiteit. Een unieke expression index behandelt zowel deze fallback als een `NULL`-variant voorspelbaar in SQLite en PostgreSQL.

Migratie 029 voegt de parentlaag `error_report_threads` toe. De thread-identiteit is `learning_space_id + portfolio_id + exercise_id` voor een gematchte oefening en `learning_space_id + portfolio_id + normalized exercise_code` voor een onbekende oefening. Alle bestaande issues worden zonder verwijdering aan precies één thread gekoppeld. Als minstens één issue TODO of pinned is, neemt de thread die toestand over. Eén unieke niet-lege issuenotitie wordt overgenomen; bij verschillende niet-lege notities blijft de threadnotitie leeg en blijven de oorspronkelijke teksten op de issues staan. Daardoor gaat geen informatie verloren.

Nieuwe meldingen vanaf een individuele oefeningspagina gebruiken `exercise_solution`. `final_solutions` is uitsluitend het globale document achter de knop Eindoplossingen. Historische `final_solutions`-issues worden niet blind geconverteerd, omdat uit de bestaande gegevens niet betrouwbaar blijkt of ze uit het globale document of uit de vroegere solution-page-flow kwamen.

Onbekende oefeningen blijven als afzonderlijke issues zichtbaar. Omdat hun varianten niet betrouwbaar uit de index afgeleid kunnen worden, ondersteunen ze alleen de standaarduitwerking. Een toekomstige modernisering van de portfolio-opbouw kan de matching later verfijnen zonder deze meldingen te verliezen.

## Legacy migratie

Migratie 027 groepeert alle bestaande solutionmeldingen als `document_kind = final_solutions`. Een issue wordt `TODO` wanneer minstens één gekoppelde melding TODO is, en pinned wanneer minstens één melding pinned is. De oudste `created_at` en nieuwste `updated_at` worden gebruikt. `completed_at` wordt alleen overgenomen voor volledig afgeronde groepen waarvan iedere melding een voltooiingstijd heeft.

Bij exact één unieke niet-lege beheernotitie wordt die op het issue gezet. Bij meerdere verschillende notities blijft de issue-notitie voorlopig leeg en blijven alle oorspronkelijke teksten onaangeroerd in de redundante `error_reports.admin_note`-kolom. Daardoor gaat in D1 geen tekst verloren; D2 kan die uitzonderingen expliciet presenteren of consolideren.

De bestaande reportkolommen voor locatie, status, pin en notitie blijven bewust staan. Daardoor blijven de huidige API, adminqueries en acties werken tot de volgende batches zijn afgerond.

## Duplicaten

Een partial unique index op `(issue_id, reporter_user_id)` geldt alleen wanneer `reporter_user_id IS NOT NULL`. Een ingelogde user kan daardoor later maximaal één melding per issue hebben, terwijl meerdere anonieme legacyreports met `NULL` behouden blijven.

De writeflow maakt of hergebruikt het issue via de unieke locatie-index. Een eerste melding maakt een report; een volgende melding van dezelfde user werkt die reporttekst en timestamp bij. Een andere user krijgt een tweede report onder hetzelfde issue. Een opnieuw gemeld DONE-issue gaat terug naar TODO en verliest zijn voltooiingstijd, terwijl pin en beheernotitie behouden blijven. Nieuwe reports bewaren `reporter_user_id` en laten `reporter_name` leeg.

`reportCount` is het totale aantal individuele meldingen onder een issue. `reporterCount` telt uitsluitend unieke niet-lege interne user-IDs; anonieme legacyreports en `reporter_name` worden niet als unieke users geïnterpreteerd.

Batch F is afgerond. Status, pin en beheernotitie worden voor nieuwe beheerfunctionaliteit uitsluitend op `error_report_issues` gewijzigd. De issue-actions autoriseren via de server-side issue- en portfoliorelatie naar de LearningSpace en werken daardoor ook voor onbekende oefeningen zonder `exercise_id`. De zichtbare LearningSpace-teller gebruikt `getOpenErrorIssueCount()` en telt dus TODO-issues in plaats van onderliggende meldingen.

De bestaande report-level actions en redundante reportvelden blijven tijdelijk beschikbaar voor de oude admin-UI, maar zijn niet langer het doelmodel voor nieuwe beheerfunctionaliteit. Issue-delete en de definitieve bewaarlifecycle zijn nog bewust open; de volgende stap is de gegroepeerde admin-UI op het issue-readmodel en de nieuwe issue-actions aansluiten.

Batch G1 is afgerond. De LearningSpace-inbox toont één kaart per grouped issue en gebruikt issue-level status, pin en beheernotitie. Individuele reports zijn alleen nog als ingeklapte detailhistoriek zichtbaar en worden voor het volledige overzicht in één bulkquery geladen. Ook onbekende oefeningcodes blijven als issues zonder previewlink bruikbaar.

Batch G1.1 voegt de thread-readlaag toe. Het overzicht levert één rij per oefening met geaggregeerde issue- en reportaantallen; een afzonderlijke bulkquery levert alle onderliggende issuelocaties voor een verzameling threads. `getOpenErrorThreadCount()` telt open beheereenheden. De inbox en beheeracties worden pas in een volgende batch van issue- naar threadniveau omgezet.

Batch G1.2 schakelt de LearningSpace-inbox om naar één adminkaart per oefeningthread. Issues zijn binnen die kaart de afzonderlijke foutlocaties en reports blijven de individuele leerlingmeldingen. Status, pin en beheernotitie worden uitsluitend op threadniveau beheerd; issue- en reportworkflowvelden blijven voorlopig alleen als compatibiliteitsdata bestaan. De inbox gebruikt één threadoverzichtsquery en één bulkquery voor alle onderliggende issues en reports. Delete en bewaarlifecycle blijven open.

Batch G1.3 maakt de threadkaarten compacter met locatiechips, compacte reportmetadata en een beheernotitie die alleen tijdens bewerken als formulier verschijnt. Voor gematchte oefeningen is de bestaande visibilityactie opnieuw beschikbaar. Onbekende oefeningcodes krijgen een toegankelijk waarschuwingsicoon in plaats van een extra tekstregel.

Thread-delete, de definitieve bewaarlifecycle en het opruimen van de tijdelijke issue-/report-level actions en redundante legacyvelden blijven open.

## Vervolg

- **G2:** individuele report-delete met bevestiging en de lifecycle van lege issues/threads en bestaande beheernotities bepalen.
- **G:** legacyvelden gecontroleerd opruimen nadat alle reads en writes issuegericht zijn.
- **Resources:** documentsoorten later uitbreidbaar maken via configureerbare resourcedefinities; migratie 029 beperkt zich bewust tot de vier huidige kinds.
