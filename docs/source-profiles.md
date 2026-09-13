# Bronprofielen

Een concreet `SourceProfile` beschrijft hoe broninhoud voor een of meer LearningSpaces geïnterpreteerd wordt. Het heeft een eigen ID, voor custom profielen exact één expliciete eigenaar via `owner_user_id`, één LearningSpace als provenance-/managementcontext en een snapshot van de versieerbare configuratie. De management-LearningSpace bepaalt niet wie eigenaar van het profiel is. Bronbestanden blijven de inhoudelijke waarheid en storage blijft read-only.

Er bestaan twee profieltypes:

- `built_in`: een intern, niet rechtstreeks wijzigbaar fallbackprofiel voor bootstrap en recovery;
- `custom`: een beheerbare profielconfiguratie met één teacher of superadmin als eigenaar en één LearningSpace als provenancecontext.

Een `SourceProfileTemplate` is daarvan gescheiden appbrede data: een template heeft een eigen template-ID, naam, optionele beschrijving en exact dezelfde getypeerde `SourceProfileConfig`. Templates zijn nooit rechtstreeks actief voor een LearningSpace. De concrete profielen en de afzonderlijke sectie **Appbrede sjablonen** staan centraal op **Beheer → Bronprofielen**. Actieve leraren mogen templates als alleen-lezen kopieerbron bekijken; alleen een actieve superadmin kan templates maken, hernoemen, dupliceren of als standaard instellen. De technische `configVersion` blijft onderdeel van opslag en validatie, maar wordt niet in de gewone beheer-UI getoond.

Een relationele singleton-reference wijst exact één template als standaard aan. Het initiële standaardsjabloon heet **Standaard portfolio** en bevat de huidige strikt gevalideerde V1-config. Een nieuwe LearningSpace krijgt transactioneel een nieuwe concrete custom snapshot van het op dat moment ingestelde standaardsjabloon. Twee LearningSpaces krijgen dus verschillende profiel-ID's. Een later gewijzigd template verandert bestaande profielen nooit, en een profielwijziging verandert het template niet.

Een nieuw template vertrekt van het actuele standaardtemplate of een expliciet gekozen bestaand template en krijgt altijd een nieuwe ID en een gevalideerde, onafhankelijke configsnapshot. Dupliceren doet hetzelfde met een veilige kopienaam. Templatenamen zijn na trimmen en zonder onderscheid tussen hoofd- en kleine letters appbreed uniek, ook wanneer een template gearchiveerd is. Een defaultwissel past uitsluitend de singleton-reference aan: bestaande LearningSpaces, concrete profielen, bronnen, index en synchronisatie blijven onaangeroerd.

B3.3 introduceerde alleen template-metadata. Sinds C/D kunnen globale en onderdelen per oefening via getypeerde editors worden beheerd; er blijft bewust geen vrije JSON-editor en geen live inheritance.

Migration 036 zet LearningSpaces die nog direct aan het technische built-in profiel gekoppeld waren om naar afzonderlijke concrete snapshots. Migration 037 voegt expliciet profieleigendom toe. Bestaande custom profielen krijgen deterministisch de owner met de laagste user-ID van hun management-LearningSpace; ontbreekt die, dan wordt de actieve compatibility-superadmin gebruikt. Bestaande profielsnapshots en usage-koppelingen blijven behouden. Eventuele genormaliseerde naamconflicten bij dezelfde nieuwe eigenaar krijgen een veilig suffix. Migration 038 voegt aan concrete profielen en templates een nullable `archived_at` toe; bestaande rijen blijven actief en behouden al hun data. Het built-in profiel blijft zonder owner alleen als technische fallback bestaan en verschijnt niet in de normale beheer-overzichten.

De kaart **Bronprofiel** in de instellingen van een LearningSpace is volledig read-only. Ze toont alleen het actieve profiel, de eigenaar, een eventuele gedeeld-indicatie met actuele usage en de korte beschrijving. De enige actie gaat naar **Beheer → Bronprofielen** en heet voor owners en superadmins **Bronprofielen beheren** en voor editors **Bronprofielen bekijken**. Kiezen, koppelen, kopiëren, hernoemen en verder profielbeheer hebben geen UI-entrypoint meer binnen de LearningSpace-instellingen.

De centrale pagina heeft drie tabs en toont er steeds precies één: **Mijn bronprofielen**, **Bronprofielen uit leeromgevingen** en **Sjablonen**. De zichtbaarheid van concrete profielen volgt expliciet ownership en actuele usage. Een owner ziet in de eerste tab al zijn eigen profielen, ook wanneer ze inactief zijn. Een editor ziet in de tweede tab een foreign profiel alleen wanneer dat profiel actueel gebruikt wordt in een LearningSpace waar die editor is; viewer-toegang telt niet en foreign inactieve profielen blijven verborgen. Die foreign kaarten zijn read-only en tonen de profieleigenaar; kopiëren verschijnt alleen wanneer de editor minstens één eigen owner-LearningSpace als doel heeft. Een superadmin kan alle concrete profielen administratief beheren. Templates blijven een afzonderlijk readmodel en tab. Alle capabilities en targetlijsten worden server-side en in bulk afgeleid; verborgen UI-acties zijn niet de autorisatiegrens. Viewer en student krijgen geen managementvisibility.

Een concreet profiel kan in nul, één of meerdere LearningSpaces actief zijn. De centrale pagina en de read-only LearningSpace-kaart leiden die usage steeds af uit de actuele profielkoppelingen; de oorspronkelijke managementcontext is uitsluitend provenance en wordt niet als usage of rechtenbron voorgesteld. **Inactief** betekent dat nul LearningSpaces het profiel momenteel gebruiken. Een profiel met meerdere usages is gedeeld en krijgt compact een koppelicoon; de usage-regel toont de betrokken LearningSpace-labels. Eigen inactieve profielen blijven centraal bestaan en beheerbaar; foreign inactieve profielen zijn niet zichtbaar. Usage toont maximaal drie LearningSpace-shortlabels en daarna het resterende aantal. In overzichten staat de genormaliseerde naam **Standaard portfolio** eerst en volgen overige concrete profielen alfabetisch, onafhankelijk van actieve status. Bij templates staat het huidige standaardsjabloon eerst en volgen de overige namen alfabetisch.

**Inactief** en **gearchiveerd** zijn verschillende toestanden. Alleen een concreet profiel met nul actuele LearningSpace-usages kan door de eigenaar of een superadmin worden gearchiveerd; een gebruikt profiel kan server-side niet worden gearchiveerd of verwijderd. Gearchiveerde profielen en templates verdwijnen uit alle normale overzichten, selectors, kopieer- en koppelflows. **Toon archief** wisselt naar een exclusieve weergave met uitsluitend gearchiveerde items. Daar kan een bevoegde beheerder ze herstellen of permanent verwijderen. Archiveren houdt de genormaliseerde naam gereserveerd; pas permanent verwijderen maakt die opnieuw beschikbaar. Herstellen controleert de naamuniciteit opnieuw en activeert geen LearningSpace of standaardinstelling. Alleen superadmins beheren de templatelifecycle en het huidige standaardsjabloon kan nooit worden gearchiveerd of verwijderd. Concrete profielen zijn onafhankelijke snapshots: het permanent verwijderen van hun oorspronkelijke template wijzigt of verwijdert die profielen nooit.

Profielnamen zijn na trimmen en zonder onderscheid tussen hoofd- en kleine letters uniek per profieleigenaar, over actieve, inactieve en gearchiveerde profielen heen. Dezelfde naam blijft toegestaan voor verschillende eigenaars. Hernoemen gebruikt expliciet profieleigendom en vertrouwt geen door de client aangeleverde owner, context of usage. Kopieerconflicten krijgen achtereenvolgens het suffix `(2)`, `(3)`, enzovoort.

Vanuit het ingebouwde profiel kan een owner of superadmin een eigen profiel maken. Een zichtbaar concreet profiel of template kan alleen naar een LearningSpace worden gekopieerd waarvan de huidige gebruiker owner is; de superadmin behoudt zijn globale scope. De bron ligt daarbij vast en moet zichtbaar zijn. De gebruiker kiest alleen de doel-LearningSpace, herkenbaar aan shortlabel en huidig actief profiel. Elke kopie krijgt een nieuwe identiteit, de huidige gebruiker als eigenaar, de gekozen LearningSpace als provenancecontext en een diep gevalideerde, onafhankelijke configsnapshot. De kopie wordt meteen actief op het gekozen doel. Een pure editor zonder eigen owner-LearningSpace krijgt geen kopieeractie en wordt ook server-side geweigerd. Een editor die elders minstens één eigen LearningSpace heeft, kan een actueel toegankelijk foreign profiel wel naar zo'n eigen doel kopiëren; de oorspronkelijke LearningSpace en het bronprofiel blijven ongewijzigd.

**Koppelen** is hiervan bewust onderscheiden en is owner-safe. Het concrete profiel kan alleen gekoppeld worden aan een doel-LearningSpace wanneer de `owner_user_id` van het profiel daar zelf een owner-membership heeft. De huidige gebruiker moet daarnaast de profielactie en de doel-LearningSpace mogen beheren. Ook een superadmin kan deze domeinregel niet omzeilen: administratieve autorisatie maakt een owner-mismatch niet geldig. De centrale knop en modal verschijnen alleen bij minstens één owner-compatible doel en de modal toont uitsluitend zulke doelen. Er ontstaat geen nieuwe profielrij: alle gekoppelde LearningSpaces gebruiken exact hetzelfde profiel-ID en latere wijzigingen gelden voor allemaal. Een foreign editor-profiel en een template kunnen nooit rechtstreeks gekoppeld worden.

Hernoemen van een gedeeld profiel vereist een expliciete impactbevestiging van de profieleigenaar of superadmin. Op de centrale pagina is geen concrete LearningSpace-context bekend en wordt daarom alleen het gedeelde profiel zelf voor alle gekoppelde omgevingen hernoemd. De bestaande guarded domeinsemantiek voor een expliciete geldige LearningSpace-context blijft een onafhankelijke split-copy ondersteunen, maar de LearningSpace-instellingen bieden daarvoor geen profielmanagement-UI meer.

Sinds E leest de synchronisatie het actieve bronprofiel één keer per synchronisatieronde en gebruikt Scanner v2 die configuratie voor zowel globale `source_file`-resources als onderdelen per oefening. Profiel-, template-, default-, kopieer- en koppelacties starten nog steeds geen automatische synchronisatie. De oefeningnummerparser blijft bewust bestaan als structurele identity extractor voor oefeningsbestanden en -mappen; de standaardmarker is `Oef`, maar het bronprofiel kan die marker aanpassen. De resourceclassificatie erboven is profielgestuurd en bronbestanden blijven read-only.

Voor volgende beheerfases geldt een impactonderscheid: presentatie- en terminologiewijzigingen zijn laag-risico configuratie, terwijl bronherkenningsregels bepalen hoe bestanden en mappen inhoudelijk worden geïnterpreteerd. Wijzigingen aan zulke regels moeten daarom een duidelijke waarschuwing krijgen en, waar haalbaar, vóór toepassing een preview of dry-run van de gevolgen tonen. Templatewijzigingen propageren nooit stilzwijgend naar bestaande profielen. Die waarschuwing en preview maken nog geen deel uit van B3.1.

## C1 — Globale resources in de profielconfiguratie

De V1-config bevat vanaf C1 een getypeerde lijst `globalResources` met maximaal tien globale resources per bronprofiel. Dit is voorlopig uitsluitend configuratiemodel: de bestaande scanner en publieke documentknoppen lezen deze lijst nog niet. Het legacy scannergedrag blijft dus ongewijzigd tot C4.

Een globale resource heeft een stabiele slug-ID, zichtbaar label, gecureerd icoon, expliciete volgorde en een interne semantische rol (`assignment`, `hint`, `final_answer`, `worked_solution` of `generic`). De semantische rol is technische domeininformatie en hoeft later niet als vrij instelbaar begrip in de leraren-UI te verschijnen.

C1 ondersteunt twee resourcevormen. Een `source_file` verwijst naar een bestand dat later door de scanner in de portfolioroot wordt herkend via een eenvoudige bestandsnaamregel (`starts_with`, `contains` of `ends_with`) en een beperkte lijst ondersteunde bestandsextensies. Een `external_link` definieert alleen de globale knop/identiteit; de concrete URL hoort bewust niet in het bronprofiel, omdat die vanaf C3 per portfolio wordt ingesteld.

De standaardconfig bevat een declaratieve spiegel van de huidige globale legacyresources: **Opgaven**, **Hints** en **Eindoplossingen**. Oude opgeslagen V1-configs zonder `globalResources` worden door de getypeerde parser automatisch met deze legacydefinities genormaliseerd. Daardoor is geen databasemigratie nodig en blijven bestaande snapshots geldig. De scanner blijft tot C4 zelf de autoritatieve bron voor de daadwerkelijke herkenning.

Binnen één profiel moeten resource-ID's en volgordewaarden uniek zijn. De config accepteert maximaal tien resources en blijft strict gevalideerd; externe links bevatten nadrukkelijk geen profielbrede URL. Latere C2/C3-stappen bouwen hier de beheer-UI en portfolio-specifieke externe links op voort, zonder het interne resourcecontract opnieuw te definiëren.

## Globale documenten (C2)

Een bronprofiel kan maximaal tien globale documenten definiëren. Het beheer gebeurt centraal bij het concrete bronprofiel of, voor superadmins, bij een appbreed sjabloon. Per definitie zijn label, icoon, volgorde en semantische rol instelbaar. Een document uit de bron bevat daarnaast een eenvoudige bestandsnaamregel en toegelaten bestandstypes. Een externe-linkdefinitie legt in C2 alleen de knop en semantiek vast; de concrete URL per portfolio volgt in C3.

Wijzigingen aan een gedeeld concreet bronprofiel vereisen expliciete bevestiging en gelden voor alle gekoppelde leeromgevingen. Wijzigingen aan een sjabloon werken nooit terug op reeds gemaakte concrete profielen. C2 bewaart alleen configuratie: de scanner gebruikt deze regels nog niet; profielgestuurde herkenning volgt in C4/E.


## Beheerflow globale documenten

Concrete bronprofielen bewaren profielnaam en globale documenten in één beheerflow. De beheerder slaat beide samen op via de vaste knop bovenaan het dialoogvenster. Sluiten met lokale wijzigingen vraagt expliciet of de wijzigingen moeten worden opgeslagen, genegeerd of verder bewerkt.

Bij een gedeeld concreet profiel wordt pas bij opslaan een impactkeuze gevraagd. De beheerder kan de wijzigingen voor alle gekoppelde leeromgevingen opslaan, of één gekoppelde leeromgeving afsplitsen naar een onafhankelijke kopie. Zo'n split-kopie behoudt de oorspronkelijke profieleigenaar, wordt alleen in de gekozen leeromgeving actief en laat het gedeelde origineel voor de overige leeromgevingen onaangeraakt.

## C4 — Profielgestuurde herkenning van globale bronbestanden

Sinds C4 gebruikt de synchronisatie het **actieve bronprofiel van de LearningSpace** bij de indexering. De herkenningsregels van globale `source_file`-resources zijn daarmee niet langer alleen configuratie: voor de bestaande globale documentrollen bepalen ze welk bestand in de portfolioroot wordt gekoppeld.

C4 is bewust een compatibiliteitsstap vóór Scanner v2. De bestaande opslag heeft nog drie vaste globale documentposities. Daarom worden op dit moment de eerste `source_file`-resource volgens profielvolgorde met de semantische rol `assignment`, `hint` en `final_answer` gekoppeld aan respectievelijk de bestaande opgaven-, hints- en eindoplossingenpositie. De resource-ID zelf is daarbij niet meer bepalend: een resource met een eigen ID blijft werken zolang zijn semantische rol overeenkomt. Een tweede globale bronresource met dezelfde semantische rol en globale resources met `generic` of `worked_solution` krijgen in C4 nog geen eigen persistente bestandspositie; D voegt het exercise-resourceconfiguratie- en readmodel toe, terwijl de generieke bestandsopslag en vrije herkenning bij Scanner v2 in E horen.

De bestandsherkenning volgt de ingestelde operator (`starts_with`, `contains` of `ends_with`), hoofdlettergevoeligheid en toegelaten extensies. De tekstregel wordt toegepast op de bestandsnaam **zonder extensie**; de extensie wordt afzonderlijk gecontroleerd. Vanaf Scanner v2 is de **portfoliomap** autoritatief voor het portfolionummer. Een nummer dat toevallig in een globale bestandsnaam staat, wordt dus niet gebruikt om het bestand aan een ander portfolio toe te wijzen. Een profielregel moet zelf voldoende specifiek zijn wanneer meerdere bestanden in dezelfde portfoliomap zouden matchen.

Een profielwijziging start niet automatisch een synchronisatie. De nieuwe herkenningsregels worden toegepast bij de eerstvolgende synchronisatie. De bestaande vaste databasevelden en foutmeldingsterminologie blijven in C4 behouden om deze stap zonder databasemigratie en zonder brede foutmeldingsrefactor uit te voeren; generieke resource-opslag volgt in Scanner v2 en resource-aware foutmeldingen in J.

## D1–D3 — Onderdelen per oefening

Vanaf D1 bevat dezelfde V1-profielconfig ook een getypeerde lijst `exerciseResources` met maximaal tien onderdelen per individuele oefening. Een onderdeel heeft een stabiele resource-ID, label, icoon, volgorde, semantische rol en een bronherkenningsconfiguratie. In deze D-fase is het resourcekind bewust beperkt tot `source_file`; oefeningsspecifieke externe links worden nog niet geïntroduceerd.

De standaardconfig bevat twee compatibiliteitsonderdelen: **Uitwerking** met semantische rol `worked_solution` en **Alternatieve uitwerking** met semantische rol `alternative_solution`. Oude V1-configs zonder `exerciseResources` worden bij het lezen automatisch met deze twee definities aangevuld. Daarom is voor D1–D3 geen databasemigratie nodig en blijven bestaande profielen, sjablonen en LearningSpaces geldig.

D1 introduceert nog geen vrije bestandsnaamregel voor onderdelen per oefening. De herkenning heeft in deze overgangsfase expliciet target `legacy_solution_file` en bewaart de toegelaten bestandstypes (`PDF`, `PNG`, `JPG`, `JPEG`). De bestaande PF/Oef-conventie blijft dus de structurele herkenningsregel. De semantische rol bepaalt vervolgens hoe zo'n bestaand bestand geïnterpreteerd wordt:
- de eerste resource in profielvolgorde met `worked_solution` koppelt aan de bestaande `standard`-variant;
- de eerste resource met `alternative_solution` koppelt aan de bestaande `-alt`-variant.

De resource-ID is daarbij niet bepalend. Een leraar kan de labels, iconen, volgorde en toegelaten bestandstypes wijzigen zonder de historische `standard`/`alternative`-databasevelden te hernoemen. Wanneer een toegelaten extensie uit de resourceconfig verdwijnt, wordt zo'n bestand bij de volgende synchronisatie niet meer als dat onderdeel per oefening geïndexeerd.

Andere semantische rollen (`assignment`, `final_answer`, `hint`, `explanation` en `generic`) kunnen vanaf D1 al in een profiel of sjabloon worden vastgelegd en in de beheer-UI worden geordend. Ze krijgen in D3 bewust nog geen vrije bestandsherkenning of nieuwe persistente assetpositie. Dat vereist de generieke regelengine en opslagkoppeling van Scanner v2 in fase E. Ook een tweede resource met dezelfde legacy semantische rol wordt in D niet automatisch aan dezelfde variant gekoppeld: alleen de eerste volgens profielvolgorde vormt de compatibiliteitsbrug.

D2 maakt de exercise-readmodels resource-aware zonder de bestaande publicatie- en autorisatielogica te vervangen. Admin-readmodels bevatten alle geconfigureerde onderdelen per oefening in profielvolgorde, ook wanneer er voor een resource geen beschikbaar bestand is. Publieke exercise-readmodels bevatten alleen resources met beschikbare, effectief toegankelijke assets; de bestaande vlag voor alternatieve uitwerkingen blijft daarbij gerespecteerd. Het bestaande `assets`-veld blijft parallel aanwezig zodat de huidige oefeningspagina's en API-routes backward compatible blijven.

Concrete bronprofielen bewaren profielnaam, globale documenten en onderdelen per oefening samen in dezelfde centrale saveflow. De gedeeld-profielkeuze uit C2 blijft ongewijzigd: opslaan kan voor alle gekoppelde LearningSpaces of als onafhankelijke kopie voor één LearningSpace. Appbrede sjablonen hebben dezelfde editor voor onderdelen per oefening en bewaren metadata, globale documenten en onderdelen via één centrale Opslaan-knop bovenaan. Templatewijzigingen propageren nooit naar bestaande concrete profielen.

Een profielwijziging start ook in D geen automatische synchronisatie. Wijzigingen aan de legacy-koppeling of toegelaten extensies worden bij de eerstvolgende synchronisatie toegepast. De volledige generalisatie naar vrije herkenningsregels, meer resourcevormen en generieke persistente exercise assets blijft expliciet scope van E — Scanner v2.

## E1–E5 — Scanner v2

Scanner v2 maakt herkenning, classificatie en persistence profielgestuurd, maar houdt de bestanden zelf als source of truth. De actieve profielconfiguratie wordt één keer vóór het indexeren geladen en expliciet aan de indexer doorgegeven. Dezelfde bronstructuur en hetzelfde profiel leveren daardoor deterministisch hetzelfde resultaat op.

### Portfolio- en onderdeelcontext

Het **portfolionummer komt uitsluitend uit de portfoliomap** (`Portfolio <code> - <titel>`). Het mag nog in bestandsnamen voorkomen, bijvoorbeeld `PF1-Oef3a.png`, maar die tekst bepaalt niet meer aan welk portfolio het bestand behoort. Zo kan een bestand in Portfolio 1 technisch `PF8-...` heten zonder dat Scanner v2 naar Portfolio 8 springt. Als twee globale bestanden binnen dezelfde portfoliomap aan dezelfde herkenningsregel voldoen, ontstaat gewoon een conflict en wordt er niet gegokt.

Een individueel portfolio kan wel of geen tussentitels/onderdelen hebben. Directe submappen volgens de vaste conventie **`nummer - titel`**, bijvoorbeeld `1 - Oppervlakte`, worden automatisch als portfolio-onderdelen beschouwd. Als zulke mappen ontbreken, vormt de portfoliomap zelf één impliciete oefeningscontext. De historische map `Uitwerkingen` blijft als compatibilitycontainer ondersteund: wanneer daar `nummer - titel`-mappen in staan, worden die als onderdelen gebruikt; zonder zulke onderdeelmappen kan `Uitwerkingen` zelf de impliciete oefeningscontext zijn. Dit is een eigenschap van elk portfolio afzonderlijk en geen leeromgevinginstelling.

### Oefeningen herkennen

Een bronprofiel configureert alleen **waar het oefeningsnummer begint**:

- `Na tekst`, standaard na `Oef`; de tekst is vrij aanpasbaar, bijvoorbeeld `Vraag` of `Ex`;
- `Aan begin van naam`.

De scanner ondersteunt de vaste nummergrammatica die voor de portfolio's nodig is: een hoofdnummer, optioneel één letter en optioneel aansluitende cijfers, bijvoorbeeld `3`, `12`, `3a`, `12b` en `3a1`. Een puntnotatie zoals `3.1` wordt bewust niet als standaard bestandsnaamformaat ingevoerd. Haakjes zoals `(1)` en `(2)` behoren niet tot de oefeningsidentiteit: `Oef3a(1).png` blijft oefening `3a`. Zulke toevoegingen kunnen gewoon deel uitmaken van meerdere bestanden/stappen die alfabetisch worden gesorteerd.

Bestanden **en** mappen kunnen automatisch oefeningen vormen; daar is geen aparte schakelaar voor. Een mapnaam moet het oefeningsnummer eenduidig bevatten en mag na het nummer geen andere tekst meer hebben, bijvoorbeeld `Oef3a/`. Binnen zo'n oefeningsmap kunnen onderdelen vervolgens via gewone bestandsnaamregels (`opgave.pdf`, `uitwerking.png`, ...) worden gevonden.

Nummerherkenning en onderdeelherkenning werken samen om letterambiguïteit te vermijden. Voor `Oef3uitwerking.png` zijn technisch zowel `3` + `uitwerking` als `3u` + `itwerking` kandidaten. Als de onderdeelregel zegt dat de tekst na het oefeningsnummer met `uitwerking` begint, blijft alleen oefening `3` geldig. `Oef3auitwerking.png` en `Oef3auitwerkingvervolg.png` kunnen op dezelfde manier eenduidig als oefening `3a` worden herkend. Als de ingestelde regels geen eenduidige keuze toelaten, waarschuwt de scanner en kiest hij niets.

### Onderdelen per oefening

Elke exercise-resource heeft naast ID, label, icoon, volgorde en semantische rol vier scanner-/weergave-eigenschappen.

**Zoeklocatie** bepaalt waar het bestand ten opzichte van de huidige oefeningscontext mag staan:

- `Bij de oefening`: rechtstreeks in de huidige contextmap, of rechtstreeks in een expliciete oefeningsmap;
- `In submap`: uitsluitend in één ingestelde submap, standaard bijvoorbeeld `assets`;
- `Bij de oefening én in submap`: beide locaties zijn toegestaan.

De huidige contextmap is de portfoliomap wanneer het portfolio geen onderdelen heeft, of de map `nummer - titel` wanneer het portfolio wel onderdelen heeft. Bij een expliciete oefeningsmap is `Bij de oefening` de oefeningsmap zelf. Er wordt in E niet willekeurig recursief door alle submappen gezocht.

**Herkenningsregel** heeft drie vormen:

- `Tekst na oefeningnummer`: `Begint met`, `Bevat` of `Is exact`; dit is de voorkeursroute voor bestanden zoals `PF1-Oef3a-alt(1).png`;
- `Bestandsnaam`: dezelfde eenvoudige tekstoperatoren op de volledige naam zonder extensie; vooral nuttig binnen een oefeningsmap; bestaande profielen met een oudere `ends_with`-regel blijven leesbaar, maar nieuwe regels bieden die optie niet aan;
- `Standaard / overige bestanden`: fallback die pas wordt gebruikt wanneer geen specifiekere regel voor hetzelfde bestand overeenkomt.

Specifieke regels hebben dus voorrang op fallbackregels. Hierdoor kan `PF1-Oef3a-alt.png` eerst als Alternatieve uitwerking worden geclassificeerd en niet tegelijk als gewone Uitwerking. Als twee regels met dezelfde prioriteit hetzelfde bestand claimen, wordt geen `first match wins` toegepast: er volgt een conflictwaarschuwing en het bestand wordt niet gekoppeld. Meerdere fallbackresources zijn toegestaan wanneer locatie, bestandstype of andere context ze eenduidig houdt; als ze werkelijk hetzelfde bestand claimen, geldt dezelfde conflictregel.

**Meerdere bestanden toestaan** is een toggle per onderdeel. Staat die aan, dan worden alle eenduidige matches alfabetisch op bestandsnaam gekoppeld en in die volgorde genummerd. Scanner v2 probeert `(1)`, `(2)`, `vervolg`, enz. niet als aparte semantische staptaal te interpreteren. Staat de toggle uit en matchen meerdere bestanden, dan kiest de scanner niets en meldt hij een conflict. Defaults: Opgave en Eindoplossing één bestand; Uitwerking, Alternatieve uitwerking, Hint, Uitleg en Overig meerdere bestanden.

**Weergave** wordt nu al in het bronprofiel opgeslagen met drie waarden: `Altijd zichtbaar`, `Inklapbaar als geheel` en `Inklapbaar per bestand`. Opgave/Eindoplossing krijgen standaard `Altijd zichtbaar`, Hint `Inklapbaar per bestand`, en de overige meervoudige onderdelen `Inklapbaar als geheel`. E bewaart deze intentie in het readmodel; de volledige leerlingpresentatie van alle generieke oefeningsonderdelen wordt bewust later gebouwd.

### Globale resources, persistence en compatibility

Globale `source_file`-resources worden in profielvolgorde herkend via hun bestandsnaamregel (`starts_with`, `contains` of `ends_with`), hoofdlettergevoeligheid en toegelaten extensies. Elke eenduidig gevonden globale resource wordt in de generieke resource-index bewaard, ook wanneer de semantische rol niet één van de drie historische documentvelden is. De eerste resources met `assignment`, `hint` en `final_answer` blijven daarnaast naar de bestaande portfolio-documentvelden gespiegeld zodat oude URLs/readmodels blijven werken. Externe links blijven portfolio-metadata en worden niet door de scanner verwerkt.

Migration `040_generic_source_resource_assets` voegt additief `source_resource_assets` toe. De tabel bewaart portfolio- en oefeningsresources met resource-ID, semantische rol, provider-`source_id`, relatief pad, bestandsnaam, extensie, volgorde/stap en indexstatus. Een stabiele provider-`source_id` laat rename/move dezelfde resource-instance behouden; zonder provider-ID is het relatieve pad de fallback. Verdwenen bestanden blijven als missing indexrecord bestaan en kunnen bij herstel met dezelfde source-ID opnieuw worden geactiveerd. De bestaande vaste portfolio-documentvelden en `solution_variants`/`solution_assets` blijven voorlopig parallel bestaan als backward-compatibilitylaag.

Admin-readmodels tonen geconfigureerde resources ook wanneer ze ontbreken; publieke readmodels en generieke assetroutes geven alleen effectief geïndexeerde en volgens de bestaande portfolio/sectie/oefening-publicatie toegankelijke resources vrij. Voor `alternative_solution` blijft `show_alternative_to_students` ook op de directe generieke assetroute autoritatief. De generieke routes zijn `/api/resource-assets/[id]` en `/api/admin/resource-assets/[id]`; bestaande portfolio- en solution-assetroutes blijven geldig. MIME wordt afgeleid uit de echte bestandsextensie.

### Bewuste scopegrenzen

De individuele oefeningspagina's blijven in E nog de bestaande Uitwerking/Alternatieve uitwerking renderen. Andere generieke onderdelen zijn wel geïndexeerd, persistent en beschikbaar in readmodels. De opgeslagen weergavemodus wordt pas gebruikt wanneer die bredere oefeningspresentatie wordt gebouwd. Resource-specifieke visibility/publicatie blijft H, resource-aware gebruikersfoutmeldingen blijft J. De didactische betekenis van deelvragen (`3a`, `3b`: sequentieel of parallel) wordt niet door de scanner gegokt; E bewaart het hoofdnummer en suffix stabiel, G kan daar later de inhoudelijke relatie bovenop modelleren. Aanpasbare UI-terminologie zoals een ander woord voor “Portfolio” hoort bij I en verandert de interne semantiek niet.
