# Marktmeesters – scouting handelsspel

## Starten

1. Installeer Node.js via https://nodejs.org/
2. Open een terminal in de map `marktmeesters` en voer uit:

   ```
   npm start
   ```

3. In de terminal verschijnen de adressen, bijvoorbeeld:

   ```
   Beursleiding:  http://localhost:3000/beurs.html
   Posten (zelfde wifi): http://192.168.1.23:3000/
   ```

4. Open op de spel-pc de beursleiding. Open op elke telefoon/laptop van een post het tweede adres en kies daar de juiste post.

Alle apparaten moeten op hetzelfde wifi-netwerk zitten. Vraagt Windows om toegang voor Node.js tot het netwerk? Klik dan op **Toestaan** (privé netwerk).

## Wachtwoorden

Er zijn twee wachtwoorden:

| Wie | Mag | Standaard (alleen lokaal!) |
|---|---|---|
| Beursleiding | alles: groot scherm, bediening, instellingen, posten en ledenpagina | `beurs123` |
| Posten | alleen de post-pagina's | `post123` |
| Leden | alleen de ledenpagina (eigen groep) | `speler123` |

Inloggen blijft 7 dagen bewaard op dat apparaat. Uitloggen kan onderaan de startpagina.

**Eigen wachtwoorden instellen**

- Op Render: ga naar je Web Service → **Environment** → voeg toe:
  - `BEURS_WACHTWOORD` = jouw wachtwoord voor de leiding
  - `POST_WACHTWOORD` = jouw wachtwoord voor de posten
  - `SPELER_WACHTWOORD` = jouw wachtwoord voor de leden
  
  Klik op **Save changes**; Render herstart dan vanzelf.
- Lokaal op Windows (cmd): `set BEURS_WACHTWOORD=...` en `set POST_WACHTWOORD=...`, daarna `npm start`.
- Lokaal op Mac: `BEURS_WACHTWOORD=... POST_WACHTWOORD=... npm start`

Na het wijzigen van een wachtwoord moet iedereen opnieuw inloggen.

## Spelregels in de app

- Groepen starten met het ingestelde startgeld en geen aandelen.
- Koersen blijven altijd tussen de ingestelde minimale en maximale koers.
- Kopen kan alleen met genoeg kasgeld, verkopen alleen met genoeg aandelen.
- De tussenstand op de beurs telt kasgeld + aandelen tegen de huidige koers.
- Willekeurig nieuws verandert koersen met een percentage, zodat het bij elke prijsschaal past.

## Ledenpagina

Leden loggen in met het ledenwachtwoord en komen dan op **/groep.html**. Daar kiezen ze één keer hun groep (de telefoon onthoudt dat) en zien ze live:

- kasgeld, totale waarde en winst/verlies;
- welke aandelen ze hebben, wat ze ervoor betaald hebben en wat ze nu waard zijn;
- de geheime tips voor hun groep, met wat er gaat gebeuren en een aftelling;
- hun eigen transacties.

Leden zien geen gegevens van andere groepen en kunnen niets invoeren.
Ze zien ook **niet** de koersen van aandelen die ze niet hebben, en geen nieuws: daarvoor moeten ze naar het grote scherm op de middenpost.

## Spelinstellingen

Via **⚙ Spelinstellingen** (alleen beursleiding) pas je zonder code aan:

- **Groepen**: hernoemen, toevoegen, verwijderen.
- **Posten (aandelen)**: hernoemen, toevoegen, verwijderen en de beginwaarde instellen.
  Een hernoemde post houdt zijn koers en aandelen. Bij een verwijderde post krijgen groepen hun aandelen terugbetaald.
- **Koersgrenzen**: minimale en maximale koers.
- **Startgeld** per groep.
- **Naam van de beurs**: de plaatsnaam (standaard Nieuwe Vaart) in de titel en het nieuws.
- **Kleuren**: kies een kleurthema voor alle schermen (standaard roze, ook geel).
- **Spelregels**: heftigheid van nieuws, terugtrekkracht (aandelen blijven niet hangen), speelduur, dividend, koersreactie, maximaal lenen en rente.
- **Nieuwsberichten**: aanpassen, verwijderen, zelf schrijven of laten verzinnen met 🎲 *Verzin een bericht*.

Hernoem je een post, dan verandert ook de link van die post (`post.html?post=Naam`). Kies de post dan opnieuw via de startpagina.

## Groot scherm en bediening

- **`/beurs.html` – groot scherm** (beamer/tv): koersen, grafiek, tussenstand, nieuws, transacties en de aftelklok. Er staan geen knoppen op.
  - Onderaan loopt een **nieuwsticker** met koersen en koppen.
  - **Wie heeft wat**: per groep hoeveel aandelen van elk aandeel.
  - De **tussenstand** kun je vanaf de bediening verbergen en weer tonen.
  - **Geluid**: klik één keer op *Geluid aanzetten*. Je hoort een beursbel bij start en einde, een alarm bij een krach, een fanfare bij een hausse en een kort signaal bij nieuws.
  - Het **eindscherm** wisselt tussen het podium en de **prijzen van vandaag** (beste deal, pechvogel, bankkoning, durfal, enz.).
- **`/leiding.html` – bediening** (op je telefoon): alle knoppen van de beursleiding.

Via de bediening kun je ook per post de **voorraad** aanpassen (−5, −1, +1, +5 of onbeperkt); het grote scherm meldt dat meteen.

Lenen en aflossen bij de **bank** gaat alleen via de bediening. Over een lening wordt rente berekend.

Automatisch nieuws en geplande tips lopen op de server, dus ook als je telefoon op slot gaat.
Het eindscherm verschijnt vanzelf als de beurs sluit; je kunt het ook vanaf de bediening tonen of verbergen.

## Bediening (beursleiding)

- **Speeltijd**: kies het aantal minuten en klik op *Start de klok*. Je kunt pauzeren, verlengen (+5/−5 min) en de beurs sluiten.
  In de laatste 5 minuten (slotfase) komt automatisch nieuws twee keer zo vaak. Bij 0:00 sluit de beurs en verschijnt het **eindscherm met podium**.
- **Willekeurig nieuws** / **automatisch nieuws**: kiest een bericht uit de lijst in de spelinstellingen.
- **Beurskrach / Hausse**: alle koersen dalen of stijgen in één keer 15–30%.
- **Eigen nieuwsbericht**: zelf een kop verzinnen en één koers met een bedrag aanpassen.
- **Geheime tip**: een bericht dat alleen op de ledenpagina van één groep verschijnt.
  Met *Laat het ook echt gebeuren* verandert de koers na het gekozen aantal minuten speeltijd vanzelf, met een nieuwsbericht.
  Een geplande tip kun je annuleren of meteen laten gebeuren; tijdens een pauze staat de aftelling stil.
- **Koersgrafiek**: het verloop van alle aandelen over het hele spel.
- **Reset spel**: alles terug naar het begin.

## Posten

Een post heeft twee tabbladen:

- **Handel**: kopen en verkopen. Kopen kan alleen het aandeel van die post; verkopen kan van elk aandeel.
  Ook **delen van een aandeel** (standaard per 0,1, instelbaar) of **per bedrag** ("voor € 30"); met **Max** vul je het maximum in. Met **voorraad** zijn er maar zoveel aandelen per post (op = op).
  Met **koersreactie** wordt een aandeel duurder als er veel gekocht wordt, en goedkoper bij verkopen.
- **Beloning / boete**: geef een groep geld voor een opdracht, of een boete (nooit onder € 0).

Groepen krijgen regelmatig **dividend** over de aandelen die ze hebben.
De eindstand telt: kasgeld + aandelen − lening.

## Spelstand bewaren

- De server bewaart de stand in `spelstand.json`. Na een gewone herstart gaat het spel verder.
- Op **Render gratis** is die schijf na een herstart leeg. Daarom bewaart de **beurscomputer** zelf ook een kopie.
  Start de server leeg op, dan verschijnt op het beursscherm een oranje balk: *Spelstand herstellen*.
- In de spelinstellingen kun je de spelstand ook **downloaden** en later **terugzetten**.
- Tip: met een gratis dienst als UptimeRobot die de site elke 5 minuten opent, valt Render niet in slaap.

## Aanpassen

Bovenin `server.js` staan de standaardinstellingen en standaardnieuwsberichten. Die worden gebruikt als er nog niets is opgeslagen; normaal pas je alles aan via de spelinstellingen.
