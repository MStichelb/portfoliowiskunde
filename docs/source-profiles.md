# Bronprofielen

Een SourceProfile beschrijft hoe broninhoud binnen een LearningSpace geïnterpreteerd wordt. Bronbestanden blijven de inhoudelijke waarheid en storage blijft read-only; het profiel bewaart alleen configuratie.

Er bestaan twee profieltypes:

- `built_in`: een ingebouwd, niet rechtstreeks wijzigbaar systeemprofiel;
- `custom`: een beheerbare profielconfiguratie met één LearningSpace als managementcontext.

Iedere LearningSpace heeft relationeel één actieve profielkoppeling. Bestaande en nieuwe LearningSpaces gebruiken standaard het deterministische built-in profiel **Standaard portfolio**. Dit profiel bevat een strikt gevalideerde V1-config met `configVersion: 1` en identificeert de huidige scannerconventie.

Owner, editor en superadmin kunnen in de LearningSpace-instellingen het actieve profiel kiezen. Custom profielen zijn alleen beschikbaar wanneer de gebruiker de bijbehorende managementcontext mag beheren; er is in v1 geen globale of publieke profielbibliotheek.

Vanuit het ingebouwde profiel kan een beheerder een eigen profiel maken. Een actief profiel van een andere beheerde LearningSpace kan ook worden gekopieerd. Zo'n kopie krijgt een nieuwe identiteit, een eigen managementcontext en een gevalideerde snapshot van de configuratie: latere wijzigingen lopen in geen van beide richtingen door. Alleen de naam van een custom profiel is in B2 bewerkbaar.

De scanner leest deze configuratie in B2 nog niet: profielwissels starten geen synchronisatie en sync en indexering blijven exact de bestaande implementatie gebruiken. Latere fases voegen terminologie, resources en scannerregels toe zonder het interne portfolio-domein of de read-only bronprincipes te wijzigen.

Voor volgende beheerfases geldt een impactonderscheid: presentatie- en terminologiewijzigingen zijn laag-risico configuratie, terwijl bronherkenningsregels bepalen hoe bestanden en mappen inhoudelijk worden geïnterpreteerd. Wijzigingen aan zulke regels moeten daarom een duidelijke waarschuwing krijgen en, waar haalbaar, vóór toepassing een preview of dry-run van de gevolgen tonen. Die waarschuwing en preview maken nog geen deel uit van B2.
