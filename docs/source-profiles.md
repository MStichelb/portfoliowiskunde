# Bronprofielen

Een SourceProfile beschrijft hoe broninhoud binnen een LearningSpace geïnterpreteerd wordt. Bronbestanden blijven de inhoudelijke waarheid en storage blijft read-only; het profiel bewaart alleen configuratie.

In B1 bestaan twee profieltypes:

- `built_in`: een ingebouwd, niet rechtstreeks wijzigbaar systeemprofiel;
- `custom`: een later beheerbare, onafhankelijke profielconfiguratie.

Iedere LearningSpace heeft relationeel één actieve profielkoppeling. Bestaande en nieuwe LearningSpaces gebruiken standaard het deterministische built-in profiel **Standaard portfolio**. Dit profiel bevat een strikt gevalideerde V1-config met `configVersion: 1` en identificeert de huidige scannerconventie.

De scanner leest deze configuratie in B1 nog niet: sync en indexering blijven exact de bestaande implementatie gebruiken. Een adminaanduiding en verdere beheer-UI volgen vanaf B2. Latere fases voegen profielkeuze, kopiëren, bewerken, terminologie, resources en scannerregels toe zonder het interne portfolio-domein of de read-only bronprincipes te wijzigen.
