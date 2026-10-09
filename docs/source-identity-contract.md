# Source identity contract (Fase 5B/5C)

Een bronbinding koppelt een bestaande app-entiteit aan de identiteit uit een
actuele scan. Een provider-ID wordt nooit een app-ID. De centrale read-only
planner `planSourceReconciliation` kiest vóór publicatie de theme- en portfolio-ID
op basis van dit contract. Section/exercise/resource-matching blijft intact.

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

## Resourcescope uitgesteld

Generieke en historische resources worden in 5B niet gebruikt om folderbindings
of entities te kiezen. Hun huidige matching en schema blijven intact. Daardoor
kan resource-scoping naar 5D worden uitgesteld zonder een nieuwe ongescopeerde
matchroute te introduceren. Vóór native assetreconciliation moet 5D de ontbrekende
source/providercontext alsnog expliciet opslaan en de huidige unscoped unieke
sleutels beoordelen. De nieuwe folderbindings lossen die bestaande assetgrens
niet op. Theme-identiteit en resource-item-ID's worden niet gedupliceerd.

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
