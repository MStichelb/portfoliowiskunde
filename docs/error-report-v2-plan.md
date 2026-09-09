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

De writeflow maakt of hergebruikt het issue via de unieke locatie-index. Een eerste melding maakt een report; een volgende melding van dezelfde user werkt die reporttekst en timestamp bij. Een andere user krijgt een tweede report onder hetzelfde issue. Een nieuwe melding heropent de thread naar TODO maar bewaart `completed_at` als grens tussen eerder behandelde en nieuwere reports; pin en beheernotitie blijven eveneens behouden. De issue-compatibiliteitsvelden behouden voorlopig hun bestaande reopen-gedrag. Een handmatige adminactie naar TODO wist de completiondatum wel, terwijl opnieuw DONE zetten `completed_at` en `updated_at` naar het nieuwe afwerkmoment verplaatst. Nieuwe reports bewaren `reporter_user_id` en laten `reporter_name` leeg.

`reportCount` is het totale aantal individuele meldingen onder een issue. `reporterCount` telt uitsluitend unieke niet-lege interne user-IDs; anonieme legacyreports en `reporter_name` worden niet als unieke users geïnterpreteerd.

Batch F vormde de tijdelijke issuegerichte beheerfase. De bijbehorende issue-readmodellen blijven beschikbaar voor migratie- en compatibiliteitstests, maar zijn niet langer het doelmodel voor beheerfunctionaliteit.

Batch G1 is afgerond. De LearningSpace-inbox toont één kaart per grouped issue en gebruikt issue-level status, pin en beheernotitie. Individuele reports zijn alleen nog als ingeklapte detailhistoriek zichtbaar en worden voor het volledige overzicht in één bulkquery geladen. Ook onbekende oefeningcodes blijven als issues zonder previewlink bruikbaar.

Batch G1.1 voegt de thread-readlaag toe. Het overzicht levert één rij per oefening met geaggregeerde issue- en reportaantallen; een afzonderlijke bulkquery levert alle onderliggende issuelocaties voor een verzameling threads. `getOpenErrorThreadCount()` telt open beheereenheden. De inbox en beheeracties worden pas in een volgende batch van issue- naar threadniveau omgezet.

Batch G1.2 schakelt de LearningSpace-inbox om naar één adminkaart per oefeningthread. Issues zijn binnen die kaart de afzonderlijke foutlocaties en reports blijven de individuele leerlingmeldingen. Status, pin en beheernotitie worden uitsluitend op threadniveau beheerd; issue- en reportworkflowvelden blijven voorlopig alleen als compatibiliteitsdata bestaan. De inbox gebruikt één threadoverzichtsquery en één bulkquery voor alle onderliggende issues en reports.

Batch G1.3 maakt de threadkaarten compacter met locatiechips, compacte reportmetadata en een beheernotitie die alleen tijdens bewerken als formulier verschijnt. Voor gematchte oefeningen is de bestaande visibilityactie opnieuw beschikbaar. Onbekende oefeningcodes krijgen een toegankelijk waarschuwingsicoon in plaats van een extra tekstregel.

Batch G1.4 combineert aantal, laatste melding en eventuele afwerkdatum in de disclosuretrigger. Individuele reports verschijnen per locatie als compacte minikaarten. Sinds A4.1 hangt de terughoudende grijze/doorgestreepte reportweergave uitsluitend af van `report.handled_at`; `thread.completed_at` bepaalt deze individuele adminvisualisatie niet. De interne beheernotitie heeft een afzonderlijk subtiel bordeaux accent.

Batch G2 rondt de lifecycle af. Een beheerder kan een individuele reportmelding na bevestiging permanent verwijderen. De server leidt de LearningSpace uitsluitend af uit de report-, issue- en threadrelatie. Blijven er andere reports in het issue, dan verandert verder niets. Een issue zonder reports wordt verwijderd; wanneer daardoor ook de thread geen issues meer heeft, verdwijnt de thread inclusief eventuele beheernotitie. Deze deletevolgorde gebeurt transactioneel en verandert status of `completed_at` van een niet-lege thread niet.

De opruimactie voor DONE verwijdert complete threads waarvan `thread.completed_at` strikt ouder is dan veertien dagen. Eerst verdwijnen alle reports, daarna de issues en ten slotte de thread. De teller telt threads. Een TODO-thread wordt nooit door deze cleanup verwijderd, ook niet wanneer een automatische heropening een oude `completed_at` als behandelingsgrens heeft behouden.

De canonieke beheeracties en teller zijn nu threadgericht; de zichtbare teller gebruikt `getOpenErrorThreadCount()`. De niet meer gebruikte report- en issue-level status-, pin- en notitieacties zijn verwijderd. De oude report-/issue-readmodellen, compatibiliteitstellers en redundante databasevelden blijven voorlopig behouden voor migratiecontrole, historische reads en backward-compatibilitytests. Foutmeldingen v2 is hiermee functioneel afgerond.

## Per-report leerlinglifecycle (v2.1 A1)

Migratie 032 voegt nullable `handled_at`, `student_dismissed_at` en `teacher_response` toe aan ieder individueel report. Historische reports blijven behouden en krijgen voor deze velden `NULL`; ook oude DONE-data krijgt bewust geen gegokte `handled_at`. `teacher_response` is gereserveerd voor batch A2 en heeft in A1 nog geen schrijf- of beheerinterface.

Sinds A4.1 zet de canonieke threadactie naar DONE uitsluitend `thread.status`, `thread.completed_at` en `thread.updated_at`; individuele reportvelden worden niet gewijzigd. Handmatig heropenen wist zoals voorheen `thread.completed_at`, maar muteert evenmin reports. Een nieuwe report op een automatisch heropende thread start onbehandeld en bestaande andere reports blijven volledig ongemoeid; bij een resubmit van dezelfde user op hetzelfde issue worden `handled_at`, `student_dismissed_at` en `teacher_response` op uitsluitend diens bestaande report gereset.

De twee tijdstippen hebben verschillende verantwoordelijkheden: `thread.completed_at` stuurt de threadhistoriek en de bestaande admincleanup na veertien dagen; `report.handled_at` legt de eerste actuele afhandeling van één concrete leerlingmelding vast. Daarom blijft een automatisch heropende TODO-thread met een oude `completed_at` beschermd tegen cleanup en verandert die cleanup niet naar reportniveau. `student_dismissed_at` bewaart later persistent of de leerling de behandelingsnotificatie heeft weggeklikt, zonder het report zelf te verwijderen.

Batch A2 gebruikt `teacher_response` als optioneel plain-textbericht van maximaal 500 tekens op één individueel report. Een owner, editor of superadmin kan het bericht vanuit de bestaande reportdetails toevoegen, aanpassen of verwijderen; de server leidt de LearningSpace altijd via report → issue → thread → portfolio af. Batch A3 toont deze response uitsluitend aan de eigenaar en uitsluitend wanneer de effectieve leerlingstatus afgewerkt is.

Een response via de gewone **Opslaan**-actie bewaren of verwijderen wijzigt `handled_at`, `student_dismissed_at` en de report-, issue- of threadstatus niet. Individueel DONE zetten behoudt een eerder geschreven response. Wanneer dezelfde leerling hetzelfde issue opnieuw indient, wist de bestaande resubmitflow de oude response samen met de eerdere afhandelings- en dismissmetadata, zodat die tekst niet ten onrechte bij de nieuwe submission blijft staan.

Batch A3 voegt `/mijn-meldingen` toe voor ingelogde leerlingen. Het server-side readmodel resolveert de actuele sessiegebruiker zelf, filtert strikt op diens `reporter_user_id` en beperkt resultaten tot LearningSpaces waarvoor die leerling volgens de huidige groeps-, individuele of membershipregels nog toegang heeft én portfolios die volgens hun actuele publicatie-, index- en archiefstatus beschikbaar zijn. De route accepteert geen user-ID en toont geen reports van andere leerlingen of van ingetrokken toegangen.

De effectieve leerlingstatus is **Afgewerkt** wanneer `report.handled_at` bestaat, of anders wanneer de thread DONE is; in alle andere gevallen is zij **In behandeling**. De concrete reportdatum heeft voorrang, anders gebruikt de leerlingweergave `thread.completed_at`. Open reports blijven zichtbaar; afgewerkte reports blijven tot en met exact veertien dagen na die effectieve datum in het overzicht. Na threadreopen wordt een niet individueel afgewerkt report opnieuw open, terwijl een eigen `handled_at` geldig blijft. De fysieke threadcleanup blijft ongewijzigd. Een `teacher_response` verschijnt alleen bij een effectief afgewerkt eigen report en blijft tijdens een effectieve open toestand verborgen zonder te worden gewist.

Batch A4 toont op de leerling-home maximaal één compacte behandelingsbanner voor eigen, recent afgewerkte reports zonder `student_dismissed_at`. Eén report gebruikt een oefeningsspecifieke tekst wanneer de koppeling betrouwbaar is; meerdere reports worden in dezelfde banner geaggregeerd. Dismiss zet voor precies de nog geldige eigen pending set `student_dismissed_at`, maar verwijdert geen report en wijzigt `handled_at` of `teacher_response` niet. Een resubmit reset deze drie lifecyclevelden volgens A1, zodat een later opnieuw afgewerkt report een nieuwe feedbackcyclus en banner kan starten.

Batch A4.1 voegt per report beveiligde acties toe om individueel af te werken of te heropenen. Individueel afwerken zet `handled_at` op nu en wist `student_dismissed_at`; heropenen maakt beide velden leeg. Beide acties behouden `teacher_response` en laten de threadstatus en `thread.completed_at` ongemoeid. De responsemodal biedt daarnaast **Opslaan** als lifecycle-neutrale optie en **Opslaan & markeren als afgewerkt** als één transactionele response-plus-afhandelactie. Alleen een individueel ingevulde `report.handled_at` kan de behandelingsbanner starten; thread-DONE alleen nooit.

Met batches A1 tot en met A4.1 is Foutmeldingen v2.1 functioneel en technisch afgerond.

## Vervolg

- **Legacy:** redundante workflowvelden gecontroleerd opruimen zodra migratie- en backward-compatibilityreads ze niet meer nodig hebben.
- **Resources:** documentsoorten later uitbreidbaar maken via configureerbare resourcedefinities; migratie 029 beperkt zich bewust tot de vier huidige kinds.
