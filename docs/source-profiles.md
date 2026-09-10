# Bronprofielen

Een concreet `SourceProfile` beschrijft hoe broninhoud binnen één LearningSpace geïnterpreteerd wordt. Het heeft een eigen ID, managementcontext en snapshot van de versieerbare configuratie. Bronbestanden blijven de inhoudelijke waarheid en storage blijft read-only.

Er bestaan twee profieltypes:

- `built_in`: een intern, niet rechtstreeks wijzigbaar fallbackprofiel voor bootstrap en recovery;
- `custom`: een beheerbare profielconfiguratie met één LearningSpace als managementcontext.

Een `SourceProfileTemplate` is daarvan gescheiden appbrede data: een template heeft een eigen template-ID, naam, optionele beschrijving en exact dezelfde getypeerde `SourceProfileConfig`. Templates zijn nooit rechtstreeks actief voor een LearningSpace. Ze worden appbreed beheerd door een superadmin; de centrale beheerpagina volgt in B3.2.

Een relationele singleton-reference wijst exact één template als standaard aan. Het initiële standaardsjabloon heet **Standaard portfolio** en bevat de huidige strikt gevalideerde V1-config. Een nieuwe LearningSpace krijgt transactioneel een nieuwe concrete custom snapshot van het op dat moment ingestelde standaardsjabloon. Twee LearningSpaces krijgen dus verschillende profiel-ID's. Een later gewijzigd template verandert bestaande profielen nooit, en een profielwijziging verandert het template niet.

Migration 036 zet LearningSpaces die nog direct aan het technische built-in profiel gekoppeld waren om naar afzonderlijke concrete snapshots. Bestaande custom profielen en overige LearningSpace-data blijven behouden. Het built-in profiel blijft alleen als technische fallback bestaan en verschijnt niet in de normale profielselector.

Owner, editor en superadmin kunnen in de LearningSpace-instellingen het actieve profiel kiezen. Custom profielen zijn alleen beschikbaar wanneer de gebruiker de bijbehorende managementcontext mag beheren; er is in v1 geen globale of publieke profielbibliotheek.

Vanuit het ingebouwde profiel kan een beheerder een eigen profiel maken. Een actief profiel van een andere beheerde LearningSpace kan ook worden gekopieerd. Zo'n kopie krijgt een nieuwe identiteit, een eigen managementcontext en een gevalideerde snapshot van de configuratie: latere wijzigingen lopen in geen van beide richtingen door. Alleen de naam van een custom profiel is in B2 bewerkbaar.

De scanner leest deze configuratie in B3.1 nog niet: profiel-, template- en defaultwijzigingen starten geen synchronisatie en sync en indexering blijven exact de bestaande implementatie gebruiken. Latere fases voegen terminologie, resources en scannerregels toe zonder het interne portfolio-domein of de read-only bronprincipes te wijzigen.

Voor volgende beheerfases geldt een impactonderscheid: presentatie- en terminologiewijzigingen zijn laag-risico configuratie, terwijl bronherkenningsregels bepalen hoe bestanden en mappen inhoudelijk worden geïnterpreteerd. Wijzigingen aan zulke regels moeten daarom een duidelijke waarschuwing krijgen en, waar haalbaar, vóór toepassing een preview of dry-run van de gevolgen tonen. Templatewijzigingen propageren nooit stilzwijgend naar bestaande profielen. Die waarschuwing en preview maken nog geen deel uit van B3.1.
