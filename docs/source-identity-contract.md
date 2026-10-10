# Source identity contract (Fase 5B/5C/5D1/5D1b/5D2/5E)

Een bronbinding koppelt een bestaande app-entiteit aan de identiteit uit een
actuele scan. Een provider-ID wordt nooit een app-ID. De centrale read-only
planner `planSourceReconciliation` kiest vóór publicatie de theme-, portfolio-,
section-, exercise- en asset-IDs op basis van dit contract. Oefeningen gebruiken
de bestaande Fase-2-reconciliation; beide live assetmodellen blijven behouden.

## Contract

`StorageEntry.sourceId` blijft de enige itemreferentie van de provider.
`StorageProvider.identityContext` voegt uitsluitend context toe:

- `providerType`: local, onedrive of google_drive;
- `providerNamespace`: providercontext waarin de item-ID betekenis heeft;
- `identityKind`: native of path.

Portfolio's dragen de context en hun folder-`sourceId` door de indexer. Sections
dragen hun folder-`sourceId`; ze gebruiken dezelfde portfolio/providercontext.
De repository voegt LearningSpace-ID, configured-source-ID en de reeds gekozen
app-entiteit toe. Ontbrekende context of item-ID betekent geen binding. Er wordt
geen identiteit afgeleid uit namen, paden van clouditems of document-ID's.

OneDrive gebruikt drive-ID plus rootfolder-ID als namespace. Google Drive
gebruikt het bestaande service-account plus rootfolder-ID. Zonder bekende
accountcontext publiceert een Google-provider geen identitycontext. Een
Google-ID beschrijft uitsluitend het Google-object, nooit de upstream
OneDrive-identiteit van een externe mirror. LocalFS gebruikt de absolute
bronroot als namespace en het actuele relatieve pad als itemreferentie.
`supportsStableNativeIdentity` geeft voor LocalFS altijd false.

## Opslag

Migration 060 maakt uitsluitend `source_entity_bindings` en ondersteunende
indexes. Er is geen backfill en bestaande apprecords blijven ongewijzigd.

Een context bestaat uit LearningSpace, configured source, providertype en
namespace. Binnen die context is iedere native itemreferentie uniek, ook over
entitytypes heen. Iedere portfolio of section heeft hoogstens één binding per
context. De capability is tevens een databaseconstraint: local/path en
cloud/native.

De tabel gebruikt `portfolio_id` en optioneel `section_id` in plaats van een
polymorfe FK op een generieke entity-ID. Het openbare contract biedt `entityId`.
Composite FK's bewaken dat de configured source en portfolio bij de
LearningSpace horen en de section bij het portfolio. Verwijderen van een bron
of app-entiteit verwijdert alleen de afhankelijke bindings via cascade.
Providercompatibiliteit wordt vóór opslag gecontroleerd tegen de configured
source. De providertypekolom is bewust geen FK naar een veranderlijk
configuratieveld: eerdere contexten blijven afzonderlijk bewaard wanneer de
bestaande bronconfiguratie verandert.

Bindingwrites komen na de entitywrites in dezelfde bestaande transactionele
indexpublicatie, inclusief de lease/snapshotguard. Een identieke sync schrijft
de binding niet opnieuw. Nieuwe native claims voor een al gebonden entity,
claims door twee entities en claims met verkeerd provider/sourcecontext worden
vóór de writebatch geweigerd. Databaseconstraints beschermen bovendien tegen
races; een mislukte batch rolt de gehele indexpublicatie terug.

Pathbindings mogen het bestaande codegematchte record volgen bij een
padwijziging. Dat is geen native renameherkenning. Een bekende native binding
wordt nooit overschreven; 5C gebruikt haar als bewijs om dezelfde portfolio-ID
te behouden wanneer bronpad, titel, code of thematoewijzing verandert.

## Resourcescope in 5D1

Er blijven twee assetmodellen bestaan:

| Model | App-ID en unieke sleutel vóór 062 | Parent en matching in 5D1 |
| --- | --- | --- |
| `source_resource_assets` | PK `id`; uniek `(learning_space_id, resource_scope, resource_id, source_id)` | Portfolio, optioneel exercise; eerst bestaande raw-sourcekey, daarna bestaande unieke parent/resource/step/extensie-kandidaat. |
| `solution_assets` | PK `id`; uniek `(variant_id, relative_path)`; nullable `source_id` | Variant → exercise → portfolio; eerst variant/pad, daarna bestaande unieke variant/step/extensie-kandidaat. |

Beide modellen missen configured source, providertype en namespace. Migration
061 voegt daarom één `source_asset_bindings`-tabel met ondersteunende FK-indexes
toe. De tabel gebruikt hetzelfde `SourceBindingContext` als folderbindings.
Iedere observatie bevat LearningSpace, configured source, providertype,
namespace, capability, itemreferentie en resource-scope/resource-ID. Daarnaast
verwijst zij via echte FK's naar portfolio/exercise en de bestaande generieke
asset, historische solution-asset plus variant, of beide representaties.

De unieke identitykey bestaat uit LearningSpace + configured source + provider
+ namespace + resource-scope + resource-ID + itemreferentie. Parent/app-ID's
zijn claims bij die sleutel: dezelfde sleutel met een andere exercise,
portfolio, variant of asset is een conflict. Hetzelfde raw item-ID in andere
sourcecontexten kan afzonderlijke bindings hebben, ook naar verschillende
app-assets. Verschillende sourcecontexten mogen tevens hetzelfde logische
app-asset beschrijven; dit bewijst geen fysieke mirrorcontinuïteit.

De indexer draagt uitsluitend expliciete itemreferenties plus providercontext
door. Een bestaande padfallback zonder werkelijk provider-item-ID krijgt geen
native binding. De repository voegt configured source en LearningSpace centraal
toe en controleert de providercontext tegen de publicatiebron. LocalFS blijft
local/path; OneDrive gebruikt drive/root en Google Drive account/root.

Afwezigheid van een binding betekent legacy/unscoped. Migration 061 verandert
geen bestaande rij, app-ID, variantrelatie of source-ID en doet geen backfill.
Een actuele scan mag de IDs vastleggen die de bestaande matching al eenduidig
koos. De scopehelper kiest zelf geen asset. In 5D1 werden ambigue kandidaten
overgeslagen zonder willekeurige binding. Sinds 5D2 blokkeren zulke conflicten
de volledige publicatie vóór writes.

Bindingwrites staan in dezelfde guarded indextransactie als assetwrites.
Identieke observaties schrijven geen nieuwe rij of timestamp. Composite FK's
bewaken LearningSpace/source, portfolio/exercise, resourcecontext en
solution/variant/exercise. De asset-parent-FK's zijn deferred, zodat reeds
bewezen Fase-2-parentwijzigingen binnen dezelfde transactie kunnen afronden;
de helper kopieert uitsluitend de bestaande exercise/variant-resoluties.
Constraintfouten rollen de volledige publicatie terug. Cascade verwijdert
afhankelijke bindings, zonder daarmee app-assets te verwijderen.

5D1 gebruikt de bindings nog niet voor assetmatching. Haar raw-source- en
padconstraints op app-assets konden onafhankelijke sourceclaims nog op hetzelfde
app-record laten uitkomen. Dit blokkeerde 5D2 en is in 5D1b fysiek gecorrigeerd.
Step/extensie-fallbacks blijven bestaan; een observatie alleen bewijst geen
asset-rename of move. Sinds 5D2 gebruikt de planner `getSourceAssetBindings` en
de doorgedragen providercontext als expliciete input voor veilige matching.

## Scoped assetopslag in 5D1b

Migration 062 voegt aan beide assettabellen één nullable `storage_context_key`
toe. De repository gebruikt de bestaande `sourceBindingContextKey`: een
deterministische JSON-array van LearningSpace, configured source, provider en
namespace. `source_id` blijft ongewijzigd de raw providerreferentie. Resource-
scope/resource-ID en variant blijven buiten de contextkey hun eigen rol houden.

Een contextkolom is kleiner dan vier extra contextvelden en hergebruikt één
canonieke samenstelling. Alleen een verwijzing naar de bindinglaag volstaat
niet: daarmee kan de database geen uniqueness op de app-assetrij afdwingen.

Partial unique indexes maken het onderscheid expliciet, in beide databases:

| Tabel | Legacy (`storage_context_key IS NULL`) | Scoped (`IS NOT NULL`) |
| --- | --- | --- |
| `source_resource_assets` | LearningSpace + resource-scope + resource-ID + raw source-ID | Dezelfde velden + storagecontext |
| `solution_assets` | Variant + pad | Variant + storagecontext + pad; tevens variant + storagecontext + raw source-ID |

Scoped solution-assets vereisen een niet-NULL itemreferentie. Legacy solution-
assets behouden hun nullable `source_id`. De legacy partial indexes behouden de
oude duplicatebeperking ondanks de nieuwe NULL-kolom. Binnen verschillende
sourcecontexten kunnen hetzelfde raw ID en hetzelfde variant/pad afzonderlijke
app-assets vertegenwoordigen.

SQLite vervangt de twee tabellen transactioneel met de bestaande FK-off
migrationvoorziening en herstelt alle bekende indexes; PostgreSQL voegt de
kolom toe en vervangt de oude inline unique constraints. Alle bestaande kolommen,
IDs, bindings en parentrelaties blijven behouden. Iedere bestaande asset krijgt
NULL, ook als historische bindings bestaan: de migration kiest geen broncontext.

De huidige matchingvolgorde blijft bestaan binnen de betreffende storagecontext.
NULL-legacyrijen blijven beschikbaar voor de bestaande ondubbelzinnige matches;
een actuele match kan hun context vastleggen en behoudt hun app-ID. Scoped rijen
uit andere contexten zijn geen kandidaten. Nieuwe rij-IDs omvatten de context;
een historische ID wordt nooit opnieuw gebruikt voor een andere partitionering.
Writes gebruiken de reeds geselecteerde app-ID en laten databaseconstraints
strijdige scoped claims transactioneel weigeren. De huidige publicatie behoudt
haar bestaande lease/snapshotguard. Herhaalde publicatie maakt geen nieuwe IDs.

Uitlezen/downloads blijven de raw `source_id` aan de provider doorgeven. Er is
geen provider-API, rename/move-prioriteit of nieuwe fallback toegevoegd. De
storagecontext wordt evenmin gebruikt om een exercise-identiteit af te leiden.

Historische 5D1-bindings kunnen meerdere contexten naar hetzelfde app-ID verwijzen.
Die blijven bewaard. Een binding mag niet stil naar een nieuwe app-rij worden
overgedragen. Sinds 5D2 kiest een exacte historische native binding opnieuw haar
bestaande app-ID, ook bij een gewijzigde huidige storagecontext. Een nieuwe
context zonder exacte binding levert geen continuïteit via alleen raw ID of pad.
De aangetoonde raw-ID- en variant/pad-schemablokkers zijn met 062 opgeheven.

## Reconciliation in 5C

`planSourceReconciliation` laadt uitsluitend de portfolios, themes en bindings
van de actuele LearningSpace. De expliciete theme/portfolio-plannen bevatten
IDs, matchreden, bronwijzigingen en thematoewijzing; de planner schrijft niets.
`persistIndex` voert het plan uit in de bestaande guarded transactionele batch.
De bindinghelper valideert en plant daarna uitsluitend opslag van de gekozen
portfolio- en ongewijzigd codegematchte section-IDs.

Portfolio-prioriteit:

1. Exacte native binding binnen LearningSpace + configured source + provider +
   namespace, met juist entiteittype.
2. Bestaande logische portfoliocode zonder strijdige native binding in die scope.
   Dit ondersteunt conservatief de eerste binding en het bestaande mirrorpad.
3. Nieuwe portfolio; geen naam-, pad-, hash- of tijdheuristieken.

Een native match behoudt portfolio-ID en alle appmetadata. De source code,
titel, het pad en (in foldermodus) theme-ID mogen veranderen. Children blijven
binnen dezelfde portfolio-ID hun bestaande matching gebruiken; hun native
bindings worden hier niet gebruikt om sectioncodes te veranderen. Een oude
gegenereerde app-ID wordt niet opnieuw gebruikt voor een nieuwe portfolio
wanneer de oorspronkelijke portfolio intussen een andere code draagt.

Codehergebruik door een andere native map wordt geblokkeerd zolang de code
bezet is. Dat geldt ook voor ontbrekende portfolios en codewissels tussen twee
bestaande portfolios. De huidige unieke codes blijven daardoor intact zonder
migration of metadataoverdracht. Een volledig nieuwe, vrije code creëert een
nieuw record. Buiten de exacte scope wordt een native ID nooit gebruikt om een
codewijziging te herkennen. Mirrorbindings bewijzen geen upstream-continuïteit.

Themes gebruiken hun bestaande `(LearningSpace, configured source, source_id)`
identiteit. Gelijke referentie behoudt ID, handmatige naam en volgorde; alleen
bronnaam/pad veranderen. Een nieuwe referentie met dezelfde naam creëert een
nieuw theme. LocalFS-referenties zijn exacte paden en bieden geen renamebewijs.
Het themeschema heeft geen providernamespacekolom: als opgeslagen bindings een
contextwisseling binnen dezelfde configured source aantonen, weigert de planner
bestaande themareferenties opnieuw te interpreteren. Een contextwisseling vóór
de eerste betrouwbare binding kan niet achteraf bewezen worden.

Dubbele native claims, strijdige themebeschrijvingen, verkeerd entiteittype,
gemengde scancontexten, bezette codes en meervoudige claims op een app-ID weigeren
de volledige publicatie vóór writes. Het bestaande sync-foutpad rapporteert dit
als configuratiefout; de laatst geldige index blijft behouden. Een SQL-fout later
in de batch rolt ook theme- en bindingwrites terug.

Geen nieuwe migration. Geen extra garanties voor LocalFS, wijzigingen vóór de
eerste betrouwbare scan of provider/root/accountwissels. Native section/exercise-
reconciliation en expliciete resourcescope blijven buiten 5C (grens naar 5D).

## Child reconciliation in 5D2

`planSourceReconciliation` plant nu ook sections, oefeningen en beide live
assetmodellen. `planSourceChildren` is de interne read-only childfase van deze
centrale planner; het bevat de verplaatste bestaande Fase-2-oefenings- en
metadata-mergecode. `persistIndex` voert uitsluitend de gekozen IDs en geplande
merges uit in de bestaande transactionele, eventueel guarded batch.

Sections krijgen eerst hun exacte native binding uit 060, daarna hun unieke
code binnen dezelfde portfolio zonder strijdige native binding. Een native
match behoudt section-ID en publicatie-/zichtbaarheidsmetadata bij gewijzigde
code, titel en pad. Een bezette code wordt conservatief geweigerd, ook bij een
codewissel. Dezelfde native section onder een andere portfolio wordt afgewezen.

Oefeningen blijven volgens Fase 2 uniek per portfolio en exerciseCode. Daardoor
behouden root/section- en section/section-verplaatsingen hun app-ID, metadata en
foutmeldingen. Asset-ID, bestandspad en inhoud bewijzen geen oefeningsidentiteit.
Een gewijzigde oefeningscode biedt geen continuïteit; een bestand dat daardoor
een andere exerciseparent claimt, blokkeert publicatie. Dubbele kandidaten en
conflicterende metadata/rapporten/uitwerkingen blokkeren nu de volledige batch.
Een Fase-2-merge mag geen al gebonden solution-asset-ID verwijderen.

Assetprioriteit is exacte gescopeerde native binding, daarna een veilige exacte
storage-/parentmatch, daarna de bestaande unieke legacy logische fallback.
Generieke keys bevatten storagecontext, resource-scope en resource-ID; de
parent wordt afzonderlijk gevalideerd. Solutionkeys bevatten variant en
storagecontext met pad of, als veilige unieke fallback, stap en extensie.
Gebonden native assets zijn nooit kandidaten voor een zwakkere fallback.
Een nieuw native bestand kan een gebonden bestand niet via stap of pad
overnemen. Native matches volgen wel gewijzigde naam, pad, stap en volgorde,
ook bij meerdere bestanden met dezelfde extensie of missing/return.

Bindings bewijzen uitsluitend identiteit binnen LearningSpace, configured
source, provider en namespace. Alle historische bindings blijven behouden.
Een exacte historische native binding mag dezelfde app-assetrij opnieuw kiezen,
ook als haar huidige `storage_context_key` bij een andere historische context
hoort. De huidige storagecontext en bronvelden volgen dan die bewezen match;
andere historische bindings worden niet herschreven. Een nieuwe context zonder
exacte binding krijgt geen continuïteit via alleen raw ID of pad. Een NULL-rij
met al bestaande native bindings is daarom evenmin een vrije legacy kandidaat.
Historische padbindings begrenzen ook na migration 062 hun broncontext; NULL
maakt die assets niet ongebonden voor een nieuwe context.
Twee inkomende native claims op hetzelfde app-ID worden vooraf afgewezen.

Native assetbindings mogen geen portfolio-, exercise-, variant- of
resourcegrens oversteken. Alleen reeds bewezen Fase-2-exercise- en variantmerges
normaliseren hun historische parents. De planner weigert alle overige
parentconflicten, dubbele claims en dubbelzinnige fallbacks vóór de eerste write.
Voor bewezen native padwissels worden niet-deferrable unieke sleutels tijdelijk
vrijgemaakt binnen dezelfde publicatietransactie. Tijdelijke pads/contexten
worden niet gepubliceerd; app-ID en raw provider-ID worden niet vervangen.
Bezetting zonder bewezen vrijgave wordt geweigerd. Ook een latere SQL-fout
rolt de volledige batch, tijdelijke sleutels en bindingwrites terug.

Geen migration, nieuwe providercapability of fuzzy matching. LocalFS houdt
uitsluitend het bestaande code-/padgedrag; paden worden geen stabiele native
identiteit. Mirrors en andere roots/accounts bieden geen veronderstelde
continuïteit. Cross-portfolio sectionmoves, cross-exercise/-variant assetmoves
en extra herstel-/bevestigingsflows blijven buiten deze batch en de 5E-grens.

## Conflict- en regressiehardening in 5E

De beslisketen blijft: provider → indexer → expliciete source identity →
`planSourceReconciliation` met `planSourceChildren` → bindingvalidatie → één
transactionele `persistIndex`-batch → missingstatus → bestaande readmodels.
`archiveMissingIndexItems` is een afzonderlijke, expliciete beheeractie met een
eigen transactie. Publicatie archiveert verdwenen records niet automatisch.

Dubbele portfolio- en genormaliseerde onderdeelcodes blokkeren nu al de indexer,
ook voor LocalFS en legacy providers. De planner controleert dezelfde claims
voor rechtstreekse repositoryaanroepen. Het vroegere overslaan met een warning
kon een gedeeltelijke scan publiceren en bestaande inhoud missing maken.

| Niveau | Conflicten en toegelaten onderscheid | Bewijs |
| --- | --- | --- |
| Thema | Dezelfde bronreferentie met verschillende namen/paden of een claim als portfolio/section blokkeert. Een nieuwe native referentie met dezelfde naam krijgt een afzonderlijk thema zonder de handmatige naam/volgorde over te nemen. Databaseuniqueness verhindert dubbele opgeslagen bronreferenties. | `source-reconciliation.test.ts`, `source-theme-sync.test.ts`, PostgreSQL compatibility |
| Portfolio | Dubbele native/logische claims, andere bekende native ID bij dezelfde code, bezette nieuwe code en rename+move naar bezette code blokkeren. | `source-reconciliation.test.ts`, `source-reconciliation-hardening.test.ts` |
| Section | Dubbele native/genormaliseerde codes, bezette nieuwe code, andere bekende native ID en cross-portfolio parent blokkeren. | `source-child-reconciliation.test.ts`, hardening |
| Exercise | Dubbele incoming portfolio/oefencode, meerdere oude kandidaten, conflicterende metadata/rapporten/solutions en assetclaims die een andere exercise willen kiezen blokkeren. Root/section-moves gebruiken uitsluitend de bestaande Fase-2-regels. | `repositories.test.ts`, child reconciliation |
| Generieke assets | Dubbele scoped identities/app-ID-claims, incompatibele resource/portfolio/exercise en ambigue legacy fallback blokkeren. Identieke raw IDs in verschillende geldige storagecontexten blijven afzonderlijk. | `source-asset-bindings.test.ts`, `source-asset-storage.test.ts`, child reconciliation, hardening |
| Solution-assets | Dubbele scoped identities/app-ID-claims, ambigue stap/extensie, bezet variant/pad en cross-variant/exercise blokkeren. Native rename/reorder/padwissels met dezelfde extensie behouden de bewezen IDs. | child reconciliation, gedeelde native continuity scenarios, PostgreSQL compatibility |

Identityconflicten worden vóór writes geweigerd; late databaseconstraints rollen
de hele batch terug. De gedeelde SQLite/PostgreSQL-hardeningtests voegen een
echte uniquenessfout toe na portfolio/assetwrites, section/resourcewrites,
exercise/solutionwrites, bindingwrites, missingupdates en archiveupdates. Zij
vergelijken alle betrokken rijen, metadata, relations, warnings, sourceconfig,
header, LearningSpace en lease exact vóór/na de mislukte transactie. Een extra
late bindingconstraint test de echte guarded publicatie inclusief rollback van
de leaseverlenging. Bestaande lease/snapshot-tests dekken verouderde workers.

De volledige missing→archive→return-lifecycle controleert originele portfolio-,
section-, exercise-, variant- en beide asset-IDs. Concrete eigendomsvelden worden
vergeleken: naam/volgorde, zichtbaarheid, publicatievensters, titel/kleur/tekst,
notes/labels/positie, leveloverride, alternatieve uitwerking en foutmeldingen.
Bij terugkeer worden `archived_at` en asset-`missing_since` volgens de bestaande
semantiek gewist; bindings blijven behouden. Een andere bekende native folder
bij een bezette code wordt ook na archivering geweigerd. De eerste terugkeer
kan in de bestaande syncstatistieken als toegevoegd tellen; dit betekent geen
nieuwe app-ID. Identieke volgende syncs voegen niets toe.

Scopeproeven gebruiken dezelfde raw IDs in andere LearningSpaces, configured
sources, OneDrive drives/roots en Google providers/accounts/roots. Historical
bindings leveren alleen continuïteit binnen hun exact bewezen context. Een
Google mirror krijgt geen upstream OneDrive-identiteit. LocalFS blijft logisch
codegematcht waar dit al de bedoeling was; een padclaim op een ander apprecord
wordt conservatief geweigerd. Er is geen inode-, hash- of naamheuristiek.

Niet-blocking warnings blijven voor ontbrekende/onherkende optionele bestanden,
bronprofielherkenning zonder gekozen resource en onduidelijk bronniveau. Zij
kiezen geen willekeurige identitykandidaat, behouden ontbrekende records en
wijzigen geen handmatige metadata. Een mislukte echte sync bewaart afzonderlijk
de bestaande failure-audit en invalid source validation, en geeft haar lease
vrij. Die diagnostiek is bewust geen onderdeel van de teruggedraaide index;
de laatst succesvol gepubliceerde inhoud/warnings blijven intact.

Geen nieuwe migration, matchingfeature, UI, providergarantie of live provider-QA.
De themeopslag blijft beperkt tot configured-source-scope; bekende gewijzigde
native contexten worden conservatief geblokkeerd. Testdekking bewijst de lokale
contracten en transacties. OneDrive-item-ID-stabiliteit bij fysieke rename/move
en Google Drive-native-ID-stabiliteit zijn niet live gevalideerd. Een mirror
heeft eigen identiteit en bewijst geen upstreamcontinuïteit. LocalFS heeft geen
stabiele renamegarantie: een pad is uitsluitend een locatie.
