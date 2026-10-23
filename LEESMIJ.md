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
| Beursleiding | alles: nieuws, reset, beurs-scherm, posten | `beurs123` |
| Posten | transacties invoeren en standen bekijken | `post123` |

Inloggen blijft 7 dagen bewaard op dat apparaat. Uitloggen kan onderaan de startpagina.

**Eigen wachtwoorden instellen**

- Op Render: ga naar je Web Service → **Environment** → voeg toe:
  - `BEURS_WACHTWOORD` = jouw wachtwoord voor de leiding
  - `POST_WACHTWOORD` = jouw wachtwoord voor de posten
  
  Klik op **Save changes**; Render herstart dan vanzelf.
- Lokaal op Windows (cmd): `set BEURS_WACHTWOORD=...` en `set POST_WACHTWOORD=...`, daarna `npm start`.
- Lokaal op Mac: `BEURS_WACHTWOORD=... POST_WACHTWOORD=... npm start`

Na het wijzigen van een wachtwoord moet iedereen opnieuw inloggen.

## Spelregels in de app

- 4 groepen starten met € 1.000 en geen aandelen.
- Koersen liggen altijd tussen € 10 en € 250.
- Kopen kan alleen met genoeg kasgeld, verkopen alleen met genoeg aandelen.
- De tussenstand op de beurs telt kasgeld + aandelen tegen de huidige koers.

## Beursleiding

- **Willekeurig nieuws**: kiest een nieuwsbericht en past de koersen aan.
- **Automatisch nieuws**: vinkje aan, dan komt er elke 2/3/5/10 minuten vanzelf nieuws.
- **Eigen nieuwsbericht**: verzin zelf een kop en kies welk aandeel hoeveel stijgt of daalt.
- **Reset spel**: alles terug naar het begin (ook kasgeld en aandelen).

Alles staat op de server, dus pagina's herladen is veilig. Alleen als je de server stopt, is de stand weg.

## Aanpassen

Bovenin `server.js` staan de beginkoersen, het startkapitaal, het aantal groepen en de lijst met nieuwsberichten.
