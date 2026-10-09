# Source identity contract (Fase 5B)

Een bronbinding koppelt een bestaande app-entiteit aan de identiteit uit een
actuele scan. Een provider-ID wordt nooit een app-ID. De huidige codegestuurde
entitymatching blijft ongewijzigd; deze infrastructuur kiest geen entities.

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
mag in 5B niet worden overgeschreven of gebruikt om een andere code te matchen.
Een codewijziging met dezelfde native ID faalt daarom veilig tot 5C de
reconciliation expliciet implementeert.

## Resourcescope uitgesteld

Generieke en historische resources worden in 5B niet gebruikt om folderbindings
of entities te kiezen. Hun huidige matching en schema blijven intact. Daardoor
kan resource-scoping naar 5D worden uitgesteld zonder een nieuwe ongescopeerde
matchroute te introduceren. Vóór native assetreconciliation moet 5D de ontbrekende
source/providercontext alsnog expliciet opslaan en de huidige unscoped unieke
sleutels beoordelen. De nieuwe folderbindings lossen die bestaande assetgrens
niet op. Theme-identiteit en resource-item-ID's worden niet gedupliceerd.

## Gebruik door 5C

5C kan de opgeslagen portfolio/sectionbindings en het actuele indexcontract
gebruiken, met alle contextvelden als matchscope. Alleen native contexten geven
een garantie over provider rename/move. Bestaande records zonder binding blijven
geldig; er is geen garantie dat een wijziging vóór de eerste betrouwbare scan
achteraf kan worden herkend.
