# Bronnen instellen

De webapp leest bronbestanden altijd read-only. Ze wijzigt of verwijdert nooit bestanden in OneDrive, Google Drive of een lokale testmap.

## 1. Begrippen

- Primaire bron: de normale bron waaruit portfolio's worden gelezen.
- Mirror: een tweede, onafhankelijk geconfigureerde kopie die bij problemen kan overnemen.
- Actieve bron: de bron waarvan de laatst geslaagde index momenteel wordt gebruikt.

Compacte beheerkaarten noemen de actieve primaire configuratie **Bron**. In de configuratie en bronvergelijking gebruikt de UI de volledige termen **Primaire bron** en **Mirror**.

Een ingestelde mirror wordt niet vanzelf actief. Eerst vergelijk je beide bronnen en daarna bevestig je de omschakeling.

Bij een nieuwe leeromgeving is OneDrive de normale standaardkeuze. Google Drive is beschikbaar als expliciete bron of mirror; **Lokale bestanden (test)** is uitsluitend voor lokale ontwikkeling en acceptance-tests.

## 2. OneDrive verbinden

1. Open `/admin`, kies **Leeromgevingen beheren** en ga op de pagina **Leeromgevingen** naar **OneDrive-verbinding**.
2. Kies OneDrive verbinden of OneDrive opnieuw verbinden.
3. Meld je aan met het Microsoft-account dat leestoegang heeft tot de bronmap.
4. Controleer dat de status OneDrive geconnecteerd verschijnt.

De huidige beheer-UI toont de bestaande OneDrive-verbinding van de compatibility-superadmin. Een LearningSpaceSource verwijst expliciet naar een storageconnection; drive-ID en map-ID blijven brongebonden. Tokens van de ene user worden nooit voor de persoonlijke verbinding van een andere user gebruikt.

Een LearningSpace kan wel door meerdere leraren worden beheerd. Een **Eigenaar** mag ook de broninstellingen wijzigen. Een **Editor** beheert dagelijkse inhoud, publicatie en synchronisatie, maar gebruikt voor een bestaande LearningSpace dezelfde expliciet gekoppelde bron. De editor hoeft daarvoor geen eigen OneDrive-account te verbinden en neemt de bestaande connection niet over.

## 3. OneDrive drive-ID en map-ID

Open de gewenste map in OneDrive en gebruik Microsoft Graph Explorer of de bestaande IT-beheertool om de drive en map op te zoeken. Vul de technische drive-ID en map-ID exact in. Het optionele pad of label is alleen herkenningsinformatie voor beheerders.

Gebruik geen gedeelde browser-URL als map-ID. Vraag je IT-beheerder om de Graph-ID's wanneer je ze niet kunt ophalen.

## 4. Google Drive service account

De app gebruikt in productie een afzonderlijk Google service account met alleen leestoegang.

1. Configureer de service-accountgegevens als beveiligde serveromgevingvariabele.
2. Deel de gewenste Google Drive-map met het e-mailadres van het service account als Viewer.
3. Kopieer de folder-ID uit de Google Drive-URL naar de bronconfiguratie.
4. Geef een herkenbaar label of pad op zodat je de map later eenvoudig controleert.

Plaats nooit de service-account-JSON of andere secrets in deze instellingenpagina.

## 5. Google mirror en completion marker

Wanneer Google Drive als mirror wordt gebruikt, draait rclone buiten de webapp. Rclone maakt een eenrichtingskopie en schrijft na een volledig geslaagde mirror een bestand met de naam _mirror-complete.json in de root van elke leeromgeving.

De marker moet status complete en een geldige completedAt bevatten. Er geldt geen maximale leeftijd. Ontbreekt de marker of is hij ongeldig, dan weigert de app een nieuwe indexering en blijft de laatst geldige index actief.

## 6. Bronnen vergelijken

1. Sla de primaire bron en mirror op.
2. Ga naar Actieve bron.
3. Kies Bronnen vergelijken.
4. Controleer gelijke bestanden, ontbrekende paden en parserwaarschuwingen.

Lege portfolio's, onderdelen en andere structurele containers zonder indexeerbare bestanden tellen niet als inhoudsverschil. Waarschuwingen worden symmetrisch vergeleken: dezelfde waarschuwing voor hetzelfde logische pad in beide bronnen telt niet mee; een waarschuwing in slechts een bron wel.

## 7. Lage overlap

De overlapscore gebruikt alleen genormaliseerde relatieve paden van indexeerbare bestanden, niet lege mappen, parserwaarschuwingen of provider-ID's. Wanneer beide bronnen minstens vijf relevante bestanden bevatten en minder dan 25% van alle unieke bestandspaden in beide voorkomt, verschijnt de waarschuwing dat de bronnen mogelijk niet bij elkaar horen. Controleer dan vooral of de juiste map-ID voor dezelfde leeromgeving werd ingevoerd. Dit is een waarschuwing: omschakelen blijft mogelijk na expliciete bevestiging.

## 8. Omschakelen en terugschakelen

Na een geslaagde vergelijking kan je overschakelen naar de mirror. De volledige nieuwe index wordt transactioneel opgeslagen. Gebruik dezelfde vergelijking om later terug te schakelen naar de primaire bron.

Bij een providerfout, ongeldige marker of mislukte scan wordt niet omgeschakeld en blijft de bestaande index behouden.

## 9. Problemen oplossen

- OneDrive-fout: verbind OneDrive opnieuw en controleer drive-ID, map-ID en toegangsrechten.
- Google Drive-fout: controleer de serverconfiguratie, Viewer-deling en folder-ID.
- Mirror onvolledig: controleer het externe rclone-proces en _mirror-complete.json.
- Veel verschillen: verifieer dat de primaire bron en mirror naar dezelfde leeromgeving wijzen.
- Parserwaarschuwing: controleer de map- en bestandsnaamconventies van de relevante portfolio-inhoud.

Rclone, Taakplanner en mirrorretentie worden buiten de webapp beheerd.

## 10. Hulp voor collega's

- Controleer eerst met welk account OneDrive is verbonden en of dat account leesrechten op de gekozen map heeft.
- Vul drive-ID en map-ID van de bedoelde LearningSpace in; gebruik geen browserdeel-URL als technische ID.
- Sla de bron op en voer daarna een synchronisatie uit.
- Configureer een mirror afzonderlijk. Vergelijk beide bronnen voordat je omschakelt.
- Bij Google Drive moet de map als Viewer met het service account gedeeld zijn. Een mirror vereist bovendien een geldige `_mirror-complete.json`.
- Een owner kan broninstellingen aanpassen. Een editor kan dezelfde LearningSpace beheren zonder eigenaar van de storageconnection te zijn.

De in-app actie **Hulp bij bronnen** is beschikbaar voor zowel leraren als hoofdbeheerders. Editors kunnen inhoud beheren en de bestaande bron synchroniseren, maar alleen een owner of hoofdbeheerder kan de provider, map-ID of gekoppelde persoonlijke storageconnection wijzigen.
