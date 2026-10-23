const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const root = path.join(__dirname, "public");

// --- Wachtwoorden ---
// Online (bijv. op Render) stel je deze in als "Environment Variables".
// Lokaal worden de standaardwachtwoorden hieronder gebruikt.
const WACHTWOORD_BEURS = process.env.BEURS_WACHTWOORD || "beurs123";
const WACHTWOORD_POST = process.env.POST_WACHTWOORD || "post123";
// Wachtwoord voor de leden: zij kunnen alleen hun eigen groep bekijken.
const WACHTWOORD_SPELER = process.env.SPELER_WACHTWOORD || "speler123";

// Sleutel om inlog-cookies te ondertekenen. Afgeleid van de wachtwoorden,
// zodat je na een herstart ingelogd blijft, maar na een wachtwoordwijziging niet.
const SLEUTEL = crypto
  .createHash("sha256")
  .update("marktmeesters|" + WACHTWOORD_BEURS + "|" + WACHTWOORD_POST + "|" + WACHTWOORD_SPELER)
  .digest();

const COOKIE = "mm_sessie";

const MAX_GROEPEN = 20;
const MAX_POSTEN = 12;
const VERBODEN_NAMEN = ["__proto__", "constructor", "prototype"];

// --- Spelinstellingen ---
// Dit zijn de standaardinstellingen. Je past ze normaal aan via de pagina
// "Spelinstellingen" (alleen voor de beursleiding). Wat je daar opslaat,
// komt in het bestand instellingen.json te staan.
const standaardInstellingen = {
  groepen: ["Groep 755", "Groep 1063", "Groep 1766", "Groep 1798"],
  // voorraad: hoeveel aandelen er van deze post maximaal in omloop zijn (0 = onbeperkt)
  posten: [
    { naam: "Eiland", beginKoers: 100, voorraad: 20 },
    { naam: "Sleper", beginKoers: 105, voorraad: 20 },
    { naam: "Gebouw", beginKoers: 95, voorraad: 20 },
    { naam: "Loods", beginKoers: 125, voorraad: 20 },
    { naam: "Lelievletten", beginKoers: 70, voorraad: 20 }
  ],
  startkapitaal: 1000,
  minKoers: 10,
  maxKoers: 250,
  regels: standaardRegels(),
  nieuws: null // null = de standaardberichten (zie standaardNieuws)
};

// Spelregels. Een 0 betekent: staat uit.
function standaardRegels() {
  return {
    speelduur: 60,        // minuten, voorstel bij het starten van de speeltijd
    dividendProcent: 2,   // % van de koers dat per aandeel wordt uitbetaald
    dividendInterval: 10, // elke zoveel minuten
    koersImpact: 1,       // % koersverandering per gekocht/verkocht aandeel
    renteProcent: 5,      // % rente op een lening
    renteInterval: 10,    // elke zoveel minuten
    maxLening: 1000       // maximaal te lenen bedrag per groep (0 = lenen uit)
  };
}

// Grenzen per spelregel: [minimum, maximum, omschrijving]
const regelGrenzen = {
  speelduur: [1, 600, "De speelduur"],
  dividendProcent: [0, 50, "Het dividend"],
  dividendInterval: [1, 120, "De tijd tussen dividenden"],
  koersImpact: [0, 20, "De koersreactie op handel"],
  renteProcent: [0, 100, "De rente"],
  renteInterval: [1, 120, "De tijd tussen rentebetalingen"],
  maxLening: [0, 1000000, "Het maximale leenbedrag"]
};

const instellingenBestand = path.join(__dirname, "instellingen.json");
let instellingen; // wordt geladen vlak voor de start van het spel (zie onder)

function laadInstellingen() {
  try {
    const bewaard = JSON.parse(fs.readFileSync(instellingenBestand, "utf8"));
    const fout = controleerInstellingen(bewaard);
    if (fout) throw new Error(fout);
    return normaliseer(bewaard);
  } catch (e) {
    if (e.code !== "ENOENT") console.log("instellingen.json overgeslagen:", e.message);
    return normaliseer(standaardInstellingen);
  }
}

function bewaarInstellingen() {
  try {
    fs.writeFileSync(instellingenBestand, JSON.stringify(instellingen, null, 2));
  } catch (e) {
    console.log("Kon instellingen niet opslaan:", e.message);
  }
}

// Groepen mogen als tekst ("Bevers") of als object ({ id, name }) binnenkomen
function groepNaam(item) {
  return String(item && typeof item === "object" ? item.name : item).trim();
}

// Oudere instellingenbestanden hadden "beginKoersen" in plaats van "posten"
function postenVan(inst) {
  if (Array.isArray(inst.posten)) return inst.posten;
  if (inst.beginKoersen && typeof inst.beginKoersen === "object") {
    return Object.entries(inst.beginKoersen).map(([naam, beginKoers]) => ({ naam, beginKoers }));
  }
  return null;
}

function controleerNamen(namen, soort, maxAantal, maxLengte) {
  if (namen.length < 1) return `Er moet minstens één ${soort} zijn.`;
  if (namen.length > maxAantal) return `Maximaal ${maxAantal} ${soort === "groep" ? "groepen" : "posten"}.`;
  if (namen.some((n) => !n)) return `Elke ${soort} heeft een naam nodig.`;
  if (namen.some((n) => n.length > maxLengte)) return `Namen van een ${soort} mogen maximaal ${maxLengte} tekens zijn.`;
  if (namen.some((n) => VERBODEN_NAMEN.includes(n))) return `"${namen.find((n) => VERBODEN_NAMEN.includes(n))}" kan niet als naam.`;
  const uniek = new Set(namen.map((n) => n.toLowerCase()));
  if (uniek.size !== namen.length) return `Twee keer dezelfde naam bij ${soort === "groep" ? "de groepen" : "de posten"}.`;
  return null;
}

// Geeft een foutmelding terug, of null als alles goed is
function controleerInstellingen(inst) {
  if (!inst || !Array.isArray(inst.groepen)) return "Groepen ontbreken.";
  const groepFout = controleerNamen(inst.groepen.map(groepNaam), "groep", MAX_GROEPEN, 30);
  if (groepFout) return groepFout;

  const posten = postenVan(inst);
  if (!posten) return "Posten ontbreken.";
  const postFout = controleerNamen(posten.map((p) => String((p && p.naam) || "").trim()), "post", MAX_POSTEN, 20);
  if (postFout) return postFout;

  const kapitaal = Number(inst.startkapitaal);
  if (!Number.isInteger(kapitaal) || kapitaal < 0 || kapitaal > 1000000) {
    return "Startgeld moet een heel getal tussen 0 en 1.000.000 zijn.";
  }

  const min = Number(inst.minKoers ?? 10);
  const max = Number(inst.maxKoers ?? 250);
  if (!Number.isInteger(min) || min < 1) return "De minimale koers moet een heel getal van minstens € 1 zijn.";
  if (!Number.isInteger(max) || max > 1000000) return "De maximale koers mag niet hoger zijn dan € 1.000.000.";
  if (min >= max) return "De minimale koers moet lager zijn dan de maximale koers.";

  for (const p of posten) {
    const k = Number(p.beginKoers);
    if (!Number.isInteger(k) || k < min || k > max) {
      return `Beginwaarde van ${String(p.naam).trim()} moet tussen € ${min} en € ${max} liggen.`;
    }
    const v = Number(p.voorraad ?? 0);
    if (!Number.isInteger(v) || v < 0 || v > 100000) {
      return `Voorraad van ${String(p.naam).trim()} moet een heel getal van 0 of meer zijn (0 = onbeperkt).`;
    }
  }

  if (inst.nieuws !== undefined && inst.nieuws !== null) {
    if (!Array.isArray(inst.nieuws)) return "De nieuwsberichten zijn ongeldig.";
    if (inst.nieuws.length > 300) return "Maximaal 300 nieuwsberichten.";
    for (const [i, n] of inst.nieuws.entries()) {
      const nr = `Nieuwsbericht ${i + 1}`;
      if (!n || !String(n.titel || "").trim()) return `${nr} heeft geen kop.`;
      if (String(n.titel).length > 100 || String(n.tekst || "").length > 300) return `${nr} is te lang.`;
      if (!Array.isArray(n.effecten) || !n.effecten.length || n.effecten.length > 12) {
        return `${nr} ("${String(n.titel).trim()}") moet minstens één koerseffect hebben.`;
      }
      for (const ef of n.effecten) {
        const min = Number(ef && ef.min);
        const max = Number(ef && ef.max);
        if (!ef || !String(ef.post || "").trim()) return `${nr}: kies bij elk effect een post.`;
        if (!Number.isInteger(min) || !Number.isInteger(max) || min < -90 || max > 300 || min > max) {
          return `${nr} ("${String(n.titel).trim()}"): het effect moet tussen -90% en +300% liggen, met van ≤ tot.`;
        }
      }
    }
  }

  const regels = { ...standaardRegels(), ...(inst.regels || {}) };
  for (const [sleutel, [laag, hoog, naam]] of Object.entries(regelGrenzen)) {
    const w = Number(regels[sleutel]);
    if (!Number.isFinite(w) || w < laag || w > hoog) return `${naam} moet tussen ${laag} en ${hoog} liggen.`;
  }
  return null;
}

function normaliseer(inst) {
  return {
    groepen: inst.groepen.map(groepNaam),
    posten: postenVan(inst).map((p) => ({
      naam: String(p.naam).trim(),
      beginKoers: Number(p.beginKoers),
      voorraad: Number(p.voorraad ?? 0)
    })),
    startkapitaal: Number(inst.startkapitaal),
    minKoers: Number(inst.minKoers ?? 10),
    maxKoers: Number(inst.maxKoers ?? 250),
    regels: Object.fromEntries(
      Object.keys(regelGrenzen).map((k) => [k, Number({ ...standaardRegels(), ...(inst.regels || {}) }[k])])
    ),
    nieuws: (Array.isArray(inst.nieuws) ? inst.nieuws : standaardNieuws).map((n) => ({
      titel: String(n.titel).trim(),
      tekst: String(n.tekst || "").trim(),
      effecten: n.effecten.map((ef) => ({ post: String(ef.post).trim(), min: Number(ef.min), max: Number(ef.max) }))
    }))
  };
}

function postNamen() {
  return instellingen.posten.map((p) => p.naam);
}

function nieuweGroep(id, naam) {
  return {
    id,
    name: naam,
    cash: instellingen.startkapitaal,
    shares: Object.fromEntries(postNamen().map((a) => [a, 0])),
    // cost: wat de groep in totaal betaald heeft voor de aandelen die ze NU nog hebben
    cost: Object.fromEntries(postNamen().map((a) => [a, 0])),
    // realized: winst/verlies op alles wat al verkocht is
    realized: 0,
    loan: 0,      // openstaande lening bij de bank
    dividend: 0,  // totaal ontvangen dividend
    bonus: 0      // totaal van beloningen min boetes
  };
}

// Gemiddelde aankoopprijs per aandeel (0 als de groep er geen heeft)
function gemiddeldePrijs(groep, aandeel) {
  const aantal = groep.shares[aandeel] || 0;
  return aantal ? (groep.cost[aandeel] || 0) / aantal : 0;
}

// Aandelen weghalen bij een groep en de winst/het verlies daarop teruggeven
function verkoopUitBezit(groep, aandeel, aantal, koers) {
  const gemiddeld = gemiddeldePrijs(groep, aandeel);
  const resultaat = Math.round((koers - gemiddeld) * aantal);
  groep.shares[aandeel] -= aantal;
  groep.cost[aandeel] = groep.shares[aandeel] ? (groep.cost[aandeel] || 0) - gemiddeld * aantal : 0;
  groep.realized = (groep.realized || 0) + resultaat;
  return resultaat;
}

// --- Nieuws ---
// Nieuwsberichten staan in de spelinstellingen en zijn daar aan te passen.
// Dit zijn de standaardberichten. Per bericht:
//   effecten: lijst van { post, min, max } in PROCENTEN van de huidige koers
//   post "*" = een willekeurige post; {post} in de titel/tekst wordt dan die naam.
// Berichten over een post die niet (meer) bestaat, worden overgeslagen.
const e = (post, min, max) => ({ post, min, max });
const standaardNieuws = [
  // Oorspronkelijke berichten
  { titel: "Nieuwe aanlegsteiger opent", tekst: "De bereikbaarheid van het eiland verbetert direct.", effecten: [e("Eiland", 18, 34)] },
  { titel: "Motorstoring bij de sleper", tekst: "Een onverwachte reparatie zet de planning onder druk.", effecten: [e("Sleper", -22, -10)] },
  { titel: "Loods volledig verhuurd", tekst: "Alle opslagruimte is voor de komende maanden gereserveerd.", effecten: [e("Loods", 20, 38)] },
  { titel: "Lelievletten winnen regatta", tekst: "De zichtbaarheid op het water zorgt voor extra belangstelling.", effecten: [e("Lelievletten", 16, 30)] },
  { titel: "Nieuwe huurder voor het gebouw", tekst: "Een langlopend contract geeft beleggers vertrouwen.", effecten: [e("Gebouw", 15, 28)] },
  { titel: "Storm boven Nieuwe Vaart", tekst: "Schade en vertraging raken meerdere onderdelen van de haven.", effecten: [e("Eiland", -18, -8), e("Sleper", -16, -7), e("Lelievletten", -20, -9)] },
  { titel: "Zonnig weekend trekt bezoekers", tekst: "De haven bruist en de belangstelling groeit.", effecten: [e("Eiland", 10, 22), e("Loods", 12, 25)] },
  { titel: "Onderhoudsbudget goedgekeurd", tekst: "De sleper en het gebouw krijgen zekerheid voor komend seizoen.", effecten: [e("Sleper", 14, 29), e("Gebouw", 12, 24)] },
  { titel: "Vergunning voor loods vertraagd", tekst: "De geplande uitbreiding moet wachten op een besluit.", effecten: [e("Loods", -19, -8)] },
  { titel: "Nieuwe sponsor voor de lelievletten", tekst: "De vloot krijgt meer middelen voor onderhoud en activiteiten.", effecten: [e("Lelievletten", 20, 36)] },
  { titel: "Lekkage in het gebouw", tekst: "Na de regen blijkt het dak niet meer waterdicht.", effecten: [e("Gebouw", -20, -9)] },
  { titel: "Eiland overspoeld door ganzen", tekst: "Kampeerders blijven weg zolang de ganzen er zitten.", effecten: [e("Eiland", -15, -6)] },
  { titel: "Goed nieuws voor {post}", tekst: "Beleggers zien de toekomst van {post} zonnig in.", effecten: [e("*", 10, 25)] },
  { titel: "Tegenvaller bij {post}", tekst: "Onverwachte kosten drukken de waarde van {post}.", effecten: [e("*", -22, -8)] },
  { titel: "Drukte bij {post}", tekst: "Veel groepen tonen ineens interesse in {post}.", effecten: [e("*", 8, 20)] },
  { titel: "Twijfel over {post}", tekst: "Geruchten zorgen voor onrust rond {post}.", effecten: [e("*", -15, -5)] },
  { titel: "Topdag voor {post}", tekst: "Alles zit mee bij {post} vandaag.", effecten: [e("*", 20, 35)] },

  // 20 nieuwe berichten in het thema van scouting en de haven
  { titel: "Kampvuur op het eiland groot succes", tekst: "Het hele dorp kwam kijken naar de vlammen en de verhalen.", effecten: [e("Eiland", 12, 26)] },
  { titel: "Muizen gevonden in de loods", tekst: "De voorraad moet gecontroleerd worden; huurders zijn ongerust.", effecten: [e("Loods", -24, -10)] },
  { titel: "Sleper trekt vastgelopen schip los", tekst: "De bemanning wordt als held binnengehaald in de haven.", effecten: [e("Sleper", 18, 32)] },
  { titel: "Lekke vlet bij de lelievletten", tekst: "Eén boot ligt op de kant voor reparatie.", effecten: [e("Lelievletten", -18, -7)] },
  { titel: "Gebouw krijgt nieuwe verf", tekst: "Na een klusdag ziet het gebouw er weer als nieuw uit.", effecten: [e("Gebouw", 10, 22)] },
  { titel: "Hoogwater in Nieuwe Vaart", tekst: "Het eiland is maar half bereikbaar, de boten hebben het druk.", effecten: [e("Eiland", -16, -6), e("Sleper", 8, 18), e("Lelievletten", 6, 15)] },
  { titel: "Jaarlijkse scoutingdag aangekondigd", tekst: "Alle onderdelen van de haven verwachten veel bezoekers.", effecten: [e("Eiland", 6, 14), e("Gebouw", 6, 14), e("Loods", 6, 14)] },
  { titel: "Pionierhout op, loods leeg", tekst: "Er moet dringend nieuw hout besteld worden.", effecten: [e("Loods", -15, -5), e("*", 5, 12)] },
  { titel: "Diesel flink duurder", tekst: "Varen kost ineens veel meer geld.", effecten: [e("Sleper", -20, -9), e("Lelievletten", -12, -4)] },
  { titel: "Opkomst bij de opkomst!", tekst: "Er melden zich tien nieuwe leden aan; het gebouw raakt vol.", effecten: [e("Gebouw", 16, 30)] },
  { titel: "Fietsenrek bij het gebouw gesloopt", tekst: "Een vrachtwagen reed er dwars doorheen.", effecten: [e("Gebouw", -14, -5)] },
  { titel: "Zeilwedstrijd op Nieuwe Vaart", tekst: "Iedereen wil een boot, de vletten zijn niet aan te slepen.", effecten: [e("Lelievletten", 18, 34), e("Sleper", 5, 12)] },
  { titel: "Vossenjacht op het eiland", tekst: "Spelers kruipen door de bosjes, de bezoekersaantallen pieken.", effecten: [e("Eiland", 14, 28)] },
  { titel: "Inspectie keurt de sleper af", tekst: "Er moet eerst een nieuwe reddingsboei aan boord.", effecten: [e("Sleper", -26, -12)] },
  { titel: "Grote bestelling bij de loods", tekst: "Een kamp in de buurt huurt alle tenten en materialen.", effecten: [e("Loods", 16, 30)] },
  { titel: "Onweer op komst", tekst: "Alles op het water ligt stil tot de bui over is.", effecten: [e("Sleper", -14, -5), e("Lelievletten", -18, -8), e("Gebouw", 4, 10)] },
  { titel: "Insider-gerucht over {post}", tekst: "Volgens ingewijden gaat er iets groots gebeuren bij {post}.", effecten: [e("*", 15, 40)] },
  { titel: "Schandaal bij {post}", tekst: "De penningmeester van {post} is de kas kwijtgeraakt.", effecten: [e("*", -30, -12)] },
  { titel: "Influencer bezoekt {post}", tekst: "Een filmpje over {post} gaat viraal in de regio.", effecten: [e("*", 12, 28)] },
  { titel: "Verloren sleutelbos bij {post}", tekst: "Niemand kan erin; de boel ligt even stil bij {post}.", effecten: [e("*", -14, -6)] }
];

function kiesNieuws() {
  const posten = postNamen();
  const vind = (naam) => posten.find((p) => p.toLowerCase() === String(naam).toLowerCase());
  const willekeurig = posten[Math.floor(Math.random() * posten.length)];

  const bruikbaar = instellingen.nieuws
    .map((item) => {
      const effect = {};
      let gebruiktWillekeurig = false;
      for (const ef of item.effecten) {
        const echt = ef.post === "*" ? willekeurig : vind(ef.post);
        if (ef.post === "*") gebruiktWillekeurig = true;
        if (echt) effect[echt] = [ef.min, ef.max];
      }
      if (!Object.keys(effect).length) return null;
      const vul = (t) => (gebruiktWillekeurig ? t.replaceAll("{post}", willekeurig) : t);
      return { titel: vul(item.titel), tekst: vul(item.tekst), effect };
    })
    .filter(Boolean);

  if (!bruikbaar.length) {
    return { titel: `Nieuws over ${willekeurig}`, tekst: "", effect: { [willekeurig]: [-15, 20] } };
  }
  return bruikbaar[Math.floor(Math.random() * bruikbaar.length)];
}

// Live-verbindingen. Elke verbinding krijgt zijn eigen weergave van het spel:
// beurs en posten zien alles, leden alleen hun eigen groep.
const clients = new Set(); // { res, weergave: () => object }
let state;

// bron: "opstart" (server net gestart zonder bewaarde stand) of "reset" (bewust opnieuw begonnen)
function nieuwSpel(bron = "reset") {
  const koersen = Object.fromEntries(instellingen.posten.map((p) => [p.naam, p.beginKoers]));
  state = {
    posts: postNamen(),
    limits: { min: instellingen.minKoers, max: instellingen.maxKoers },
    prices: { ...koersen },
    previous: { ...koersen },
    groups: instellingen.groepen.map((naam, i) => nieuweGroep(i + 1, naam)),
    news: [
      {
        at: new Date().toISOString(),
        titel: "De beurs opent",
        tekst: "Alle aandelen starten op hun beginwaarde.",
        changes: []
      }
    ],
    transactions: [],
    history: [{ t: Date.now(), p: { ...koersen } }],
    // Speeltijd. status: "vrij" (geen klok, handel open), "loopt", "pauze" of "gesloten"
    game: { status: "vrij", eind: null, rest: null },
    // Tijd (ms) dat er actief gespeeld is, voor dividend en rente
    klok: { actief: 0, laatsteDividend: 0, laatsteRente: 0 }
  };
  state.spelId = crypto.randomBytes(6).toString("hex");
  state.bron = bron;
  tips = [];
  werkRegelsBij();
}

// --- Spelstand bewaren ---
// 1) Op de schijf van de server (spelstand.json): overleeft een gewone herstart.
// 2) De beurscomputer bewaart zelf ook een kopie en kan die terugzetten
//    (handig bij Render gratis, waar de schijf bij een herstart leeg is).
const spelstandBestand = path.join(__dirname, "spelstand.json");
let bewaarTimer = null;

function bewaarSpelstand() {
  clearTimeout(bewaarTimer);
  bewaarTimer = setTimeout(() => {
    fs.writeFile(spelstandBestand, JSON.stringify({ state, tips }), (fout) => {
      if (fout) console.log("Kon spelstand niet opslaan:", fout.message);
    });
  }, 1500);
}

const getal = (w, standaard = 0) => (Number.isFinite(Number(w)) ? Number(w) : standaard);

// Controleert een bewaarde spelstand en vult ontbrekende velden aan. Geeft null bij een ongeldige stand.
function schoonSpelstand(st) {
  if (!st || typeof st !== "object" || !Array.isArray(st.groups) || !st.prices) return null;
  const posten = postNamen();
  const lijst = (x) => (Array.isArray(x) ? x : []);
  const perPost = (obj, standaard) => Object.fromEntries(posten.map((a) => [a, getal(obj && obj[a], standaard)]));

  const prijzen = Object.fromEntries(posten.map((a) => {
    const p = instellingen.posten.find((x) => x.naam === a);
    return [a, begrens(getal(st.prices[a], p.beginKoers))];
  }));

  const groepen = st.groups.slice(0, MAX_GROEPEN).map((g) => ({
    id: Math.round(getal(g && g.id)),
    name: String((g && g.name) || "Groep").slice(0, 30),
    cash: getal(g.cash),
    shares: perPost(g.shares, 0),
    cost: perPost(g.cost, 0),
    realized: getal(g.realized),
    loan: getal(g.loan),
    dividend: getal(g.dividend),
    bonus: getal(g.bonus)
  }));
  if (!groepen.length || new Set(groepen.map((g) => g.id)).size !== groepen.length) return null;

  const statussen = ["vrij", "loopt", "pauze", "gesloten"];
  const game = st.game && statussen.includes(st.game.status)
    ? { status: st.game.status, eind: st.game.eind ? getal(st.game.eind) : null, rest: st.game.rest ? getal(st.game.rest) : null }
    : { status: "vrij", eind: null, rest: null };

  return {
    posts: posten,
    limits: { min: instellingen.minKoers, max: instellingen.maxKoers },
    prices: prijzen,
    previous: Object.fromEntries(posten.map((a) => [a, begrens(getal(st.previous && st.previous[a], prijzen[a]))])),
    groups: groepen,
    news: lijst(st.news).slice(0, 30),
    transactions: lijst(st.transactions).slice(0, 200),
    history: lijst(st.history).filter((h) => h && h.p).slice(-400),
    game,
    klok: {
      actief: getal(st.klok && st.klok.actief),
      laatsteDividend: getal(st.klok && st.klok.laatsteDividend),
      laatsteRente: getal(st.klok && st.klok.laatsteRente)
    },
    spelId: String(st.spelId || crypto.randomBytes(6).toString("hex")),
    bron: "hersteld"
  };
}

function laadSpelstand() {
  try {
    const bewaard = JSON.parse(fs.readFileSync(spelstandBestand, "utf8"));
    const st = schoonSpelstand(bewaard.state);
    if (!st) return false;
    state = st;
    tips = Array.isArray(bewaard.tips) ? bewaard.tips.slice(0, 50) : [];
    werkRegelsBij();
    console.log("Bewaarde spelstand ingeladen.");
    return true;
  } catch {
    return false;
  }
}

// Geheime tips staan NIET in de gewone spelstand, zodat posten ze niet zien.
let tips = [];

// Regels en voorraad die alle schermen moeten kennen
function werkRegelsBij() {
  state.rules = { ...instellingen.regels };
  state.supply = Object.fromEntries(instellingen.posten.map((p) => [p.naam, p.voorraad]));
}

instellingen = laadInstellingen();
if (!laadSpelstand()) nieuwSpel("opstart");

// --- Speeltijd ---

function handelOpen() {
  return state.game.status === "vrij" || state.game.status === "loopt";
}

function geslotenMelding() {
  return state.game.status === "pauze"
    ? "De beurs is gepauzeerd. Even wachten tot de leiding hem weer start."
    : "De beurs is gesloten. Er kan niet meer gehandeld worden.";
}

// Waarde van een groep: kasgeld + aandelen tegen de huidige koers - lening
function totaleWaarde(groep) {
  const aandelen = state.posts.reduce((som, a) => som + (groep.shares[a] || 0) * state.prices[a], 0);
  return groep.cash + aandelen - (groep.loan || 0);
}

function rangLijst() {
  return state.groups
    .map((g) => ({ id: g.id, name: g.name, totaal: totaleWaarde(g) }))
    .sort((a, b) => b.totaal - a.totaal);
}

function inBezit(aandeel) {
  return state.groups.reduce((som, g) => som + (g.shares[aandeel] || 0), 0);
}

function boek(groep, actie, velden) {
  state.transactions.unshift({
    at: new Date().toISOString(),
    group: groep.name,
    groupId: groep.id,
    action: actie,
    ...velden
  });
  state.transactions = state.transactions.slice(0, 200);
}

function betaalDividend() {
  const procent = instellingen.regels.dividendProcent;
  if (!procent) return false;
  let iemand = false;
  state.groups.forEach((g) => {
    const bedrag = Math.round(state.posts.reduce(
      (som, a) => som + (g.shares[a] || 0) * state.prices[a] * procent / 100, 0));
    if (bedrag > 0) {
      g.cash += bedrag;
      g.dividend = (g.dividend || 0) + bedrag;
      boek(g, "dividend", { amount: bedrag, reason: `${procent}% dividend` });
      iemand = true;
    }
  });
  if (iemand) {
    voegNieuwsToe("Dividend uitgekeerd!",
      `Elke groep krijgt ${procent}% van de waarde van zijn aandelen uitbetaald.`, []);
  }
  return iemand;
}

function rekenRente() {
  const procent = instellingen.regels.renteProcent;
  if (!procent) return false;
  let iemand = false;
  state.groups.forEach((g) => {
    if ((g.loan || 0) > 0) {
      const rente = Math.max(1, Math.round(g.loan * procent / 100));
      g.loan += rente;
      boek(g, "rente", { amount: rente, reason: `${procent}% rente op de lening` });
      iemand = true;
    }
  });
  if (iemand) voegNieuwsToe("De bank rekent rente", `Groepen met een lening betalen ${procent}% rente.`, []);
  return iemand;
}

// Elke seconde: klok bijwerken, dividend en rente uitbetalen, beurs sluiten als de tijd op is
let vorigeTik = Date.now();
setInterval(() => {
  const nu = Date.now();
  const verstreken = nu - vorigeTik;
  vorigeTik = nu;
  let veranderd = false;

  if (state.game.status === "loopt" && nu >= state.game.eind) {
    state.game = { status: "gesloten", eind: null, rest: null };
    voegNieuwsToe("De beurs is gesloten!", "De tijd is om. Bekijk de eindstand op het grote scherm.", []);
    veranderd = true;
  }

  if (handelOpen()) {
    const k = state.klok;
    k.actief += verstreken;
    const dividendMs = instellingen.regels.dividendInterval * 60000;
    if (k.actief - k.laatsteDividend >= dividendMs) {
      k.laatsteDividend = k.actief;
      veranderd = betaalDividend() || veranderd;
    }
    const renteMs = instellingen.regels.renteInterval * 60000;
    if (k.actief - k.laatsteRente >= renteMs) {
      k.laatsteRente = k.actief;
      veranderd = rekenRente() || veranderd;
    }
  }

  if (veranderd) stuurUpdate();
}, 1000);

function randomGetal(van, tot) {
  return van + Math.floor(Math.random() * (tot - van + 1));
}

function begrens(koers) {
  return Math.max(instellingen.minKoers, Math.min(instellingen.maxKoers, Math.round(koers)));
}

function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function stuurUpdate() {
  bewaarSpelstand();
  state.serverNow = Date.now(); // zodat telefoons met een afwijkende klok toch goed aftellen
  const volledig = "data: " + JSON.stringify(state) + "\n\n";
  clients.forEach((c) => {
    c.res.write(c.weergave ? "data: " + JSON.stringify(c.weergave()) + "\n\n" : volledig);
  });
}

// Wat een lid te zien krijgt: de lijst met groepen, de koersen, het nieuws
// en (als er een groep gekozen is) alleen de gegevens van de eigen groep.
function spelerWeergave(groepId) {
  const groep = state.groups.find((g) => g.id === groepId) || null;
  return {
    groepen: state.groups.map((g) => ({ id: g.id, name: g.name })),
    posts: state.posts,
    prices: state.prices,
    previous: state.previous,
    news: state.news.slice(0, 5),
    groep,
    transactions: groep
      ? state.transactions.filter((t) => t.groupId === groep.id).slice(0, 15)
      : [],
    game: state.game,
    rules: state.rules,
    supply: state.supply,
    held: Object.fromEntries(state.posts.map((a) => [a, inBezit(a)])),
    serverNow: Date.now(),
    tips: groep ? tips.filter((t) => t.groupId === groep.id).slice(0, 5) : [],
    // De eindstand is pas zichtbaar als de beurs gesloten is
    eindstand: state.game.status === "gesloten" ? rangLijst() : null
  };
}

// Wat de beursleiding ziet: alles, plus de geheime tips
function beursWeergave() {
  return { ...state, serverNow: Date.now(), tips };
}

function leesBody(req, maxGrootte = 200000) {
  return new Promise((resolve, reject) => {
    let inhoud = "";
    req.on("data", (deel) => {
      inhoud += deel;
      if (inhoud.length > maxGrootte) {
        reject(new Error("Aanvraag is te groot"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(inhoud || "{}"));
      } catch {
        reject(new Error("Ongeldige JSON"));
      }
    });
  });
}

function voegNieuwsToe(titel, tekst, changes) {
  state.news.unshift({ at: new Date().toISOString(), titel, tekst, changes });
  state.news = state.news.slice(0, 30);
  noteerKoersen();
}

// Koersgeschiedenis voor de grafiek: een punt bij elke koerswijziging.
// Bij meer dan 400 punten wordt elk tweede (oude) punt weggelaten, zodat het licht blijft.
function noteerKoersen() {
  const h = state.history;
  const laatste = h[h.length - 1];
  if (laatste && state.posts.every((a) => laatste.p[a] === state.prices[a])) return;
  h.push({ t: Date.now(), p: { ...state.prices } });
  if (h.length > 400) state.history = h.filter((_, i) => i % 2 === 0 || i > h.length - 50);
}

// Nieuwe instellingen toepassen op een lopend spel, zonder opnieuw te beginnen
function pasToeOpLopendSpel(body) {
  // Posten: bestaande posten behouden hun koers (ook na hernoemen), nieuwe krijgen hun beginwaarde.
  const oudePrijzen = state.prices;
  const oudeVorige = state.previous;
  const prijzen = {};
  const vorige = {};
  const hernoemd = {}; // oude naam -> nieuwe naam

  instellingen.posten.forEach((p, i) => {
    const item = postenVan(body)[i];
    const oudeNaam = item && typeof item.id === "string" ? item.id : null;
    // Bestond deze post al (eventueel onder een andere naam)? Dan blijft de koers staan.
    if (oudeNaam && state.posts.includes(oudeNaam) && !Object.hasOwn(hernoemd, oudeNaam)) {
      prijzen[p.naam] = begrens(oudePrijzen[oudeNaam]);
      vorige[p.naam] = begrens(oudeVorige[oudeNaam]);
      hernoemd[oudeNaam] = p.naam;
    } else {
      prijzen[p.naam] = p.beginKoers;
      vorige[p.naam] = p.beginKoers;
    }
  });

  const gesloten = state.posts.filter((naam) => !Object.hasOwn(hernoemd, naam));

  // Groepen: bestaande behouden hun stand, nieuwe krijgen het startgeld.
  const bestaand = new Map(state.groups.map((g) => [g.id, g]));
  let volgendId = Math.max(0, ...state.groups.map((g) => g.id)) + 1;

  const groepen = body.groepen.map((item, i) => {
    const groep = bestaand.get(Number(item && item.id));
    if (!groep) return nieuweGroep(volgendId++, instellingen.groepen[i]);

    groep.name = instellingen.groepen[i];

    groep.cost = groep.cost || {};

    // Aandelen van gesloten posten terugbetalen tegen de laatste koers (telt als verkoop)
    gesloten.forEach((naam) => {
      const aantal = groep.shares[naam] || 0;
      if (aantal) {
        groep.cash += aantal * oudePrijzen[naam];
        verkoopUitBezit(groep, naam, aantal, oudePrijzen[naam]);
      }
    });

    const nieuweShares = {};
    const nieuweCost = {};
    postNamen().forEach((naam) => { nieuweShares[naam] = 0; nieuweCost[naam] = 0; });
    Object.entries(hernoemd).forEach(([oud, nieuw]) => {
      nieuweShares[nieuw] = groep.shares[oud] || 0;
      nieuweCost[nieuw] = groep.cost[oud] || 0;
    });
    groep.shares = nieuweShares;
    groep.cost = nieuweCost;
    return groep;
  });

  state.posts = postNamen();
  state.limits = { min: instellingen.minKoers, max: instellingen.maxKoers };
  werkRegelsBij();
  state.prices = prijzen;
  state.previous = vorige;

  // Grafiek: hernoemde posten meenemen, verwijderde laten vallen
  state.history = (state.history || []).map((punt) => {
    const p = {};
    Object.entries(hernoemd).forEach(([oud, nieuw]) => { if (Object.hasOwn(punt.p, oud)) p[nieuw] = punt.p[oud]; });
    return { t: punt.t, p };
  });
  state.groups = groepen;
  noteerKoersen();

  gesloten.forEach((naam) => {
    voegNieuwsToe(
      `Post ${naam} is gesloten`,
      `Alle aandelen ${naam} zijn terugbetaald tegen € ${oudePrijzen[naam]} per stuk.`,
      []
    );
  });
}

// --- Inloggen ---

function onderteken(rol) {
  return crypto.createHmac("sha256", SLEUTEL).update(rol).digest("hex");
}

function gelijk(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Geeft "beurs", "post" of null terug
function rolVan(req) {
  const cookies = Object.fromEntries(
    (req.headers.cookie || "").split(";").map((c) => {
      const i = c.indexOf("=");
      return [c.slice(0, i).trim(), c.slice(i + 1).trim()];
    })
  );
  const [rol, handtekening] = String(cookies[COOKIE] || "").split(".");
  if (["beurs", "post", "speler"].includes(rol) && handtekening && gelijk(handtekening, onderteken(rol))) {
    return rol;
  }
  return null;
}

function zetCookie(req, res, waarde, maxAge) {
  const https = req.headers["x-forwarded-proto"] === "https";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${waarde}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${https ? "; Secure" : ""}`
  );
}

const wachtTot = new Map(); // simpele rem op wachtwoord raden, per IP-adres

function ipVan(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
}

// Welke pagina's wie mag zien
const paginaRechten = {
  "/index.html": ["beurs", "post"],
  "/groep.html": ["beurs", "post", "speler"],
  "/post.html": ["beurs", "post"],
  "/beurs.html": ["beurs"],
  "/instellingen.html": ["beurs"]
};

const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

function serveFile(req, res) {
  let url = decodeURIComponent((req.url || "/").split("?")[0]);
  if (url === "/") url = "/index.html";

  // Leden hebben geen keuzemenu nodig: stuur ze meteen naar hun eigen pagina
  if (url === "/index.html" && rolVan(req) === "speler") {
    res.writeHead(302, { Location: "/groep.html" });
    return res.end();
  }

  const nodig = paginaRechten[url];
  if (nodig && !nodig.includes(rolVan(req))) {
    const terug = encodeURIComponent(req.url || "/");
    res.writeHead(302, { Location: "/login.html?terug=" + terug });
    return res.end();
  }

  const bestand = path.normalize(path.join(root, url));
  if (!bestand.startsWith(root)) {
    return json(res, 403, { error: "Geen toegang" });
  }

  fs.readFile(bestand, (error, data) => {
    if (error) return json(res, 404, { error: "Bestand niet gevonden" });

    const type = types[path.extname(bestand)] || "text/plain";
    res.writeHead(200, { "Content-Type": type + "; charset=utf-8" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = (req.url || "/").split("?")[0];

  try {
    // Inloggen en uitloggen zijn voor iedereen bereikbaar
    if (req.method === "POST" && url === "/api/login") {
      const ip = ipVan(req);
      if ((wachtTot.get(ip) || 0) > Date.now()) {
        return json(res, 429, { error: "Even wachten en opnieuw proberen." });
      }

      const body = await leesBody(req);
      const wachtwoord = String(body.wachtwoord || "");
      let rol = null;
      if (gelijk(wachtwoord, WACHTWOORD_BEURS)) rol = "beurs";
      else if (gelijk(wachtwoord, WACHTWOORD_POST)) rol = "post";
      else if (gelijk(wachtwoord, WACHTWOORD_SPELER)) rol = "speler";

      if (!rol) {
        wachtTot.set(ip, Date.now() + 1500);
        return json(res, 401, { error: "Onjuist wachtwoord." });
      }

      wachtTot.delete(ip);
      zetCookie(req, res, rol + "." + onderteken(rol), 60 * 60 * 24 * 7);
      return json(res, 200, { ok: true, rol });
    }

    if (req.method === "POST" && url === "/api/logout") {
      zetCookie(req, res, "", 0);
      return json(res, 200, { ok: true });
    }

    if (url.startsWith("/api/")) {
      const rol = rolVan(req);

      if (!rol) {
        return json(res, 401, { error: "Niet ingelogd." });
      }

      const alleenBeurs =
        url.startsWith("/api/news/") || url === "/api/reset" || url === "/api/settings" ||
        url === "/api/game" || url === "/api/tip" || url === "/api/backup" || url === "/api/herstel";
      if (alleenBeurs && rol !== "beurs") {
        return json(res, 403, { error: "Alleen de beursleiding mag dit doen." });
      }

      if (req.method === "GET" && url === "/api/me") {
        return json(res, 200, { rol });
      }

      // Leden mogen alleen hun eigen groep live volgen, verder niets
      if (url === "/api/speler/events") {
        const groepId = Number(new URL(req.url, "http://x").searchParams.get("groep")) || null;
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive"
        });
        const client = { res, weergave: () => spelerWeergave(groepId) };
        res.write("retry: 2000\n");
        res.write("data: " + JSON.stringify(client.weergave()) + "\n\n");
        clients.add(client);
        req.on("close", () => clients.delete(client));
        return;
      }

      if (rol === "speler") {
        return json(res, 403, { error: "Met het ledenwachtwoord kun je alleen je eigen groep bekijken." });
      }
    }

    if (req.method === "GET" && url === "/api/state") {
      return json(res, 200, rolVan(req) === "beurs" ? beursWeergave() : { ...state, serverNow: Date.now() });
    }

    if (req.method === "GET" && url === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      });
      res.write("retry: 2000\n");
      res.write("data: " + JSON.stringify(rolVan(req) === "beurs" ? beursWeergave() : { ...state, serverNow: Date.now() }) + "\n\n");
      const client = { res, weergave: rolVan(req) === "beurs" ? beursWeergave : null };
      clients.add(client);
      req.on("close", () => clients.delete(client));
      return;
    }

    // Willekeurig nieuwsbericht: server kiest, past koersen aan en stuurt door.
    if (url.startsWith("/api/news/") && !handelOpen()) {
      return json(res, 400, { error: geslotenMelding() });
    }

    if (req.method === "POST" && url === "/api/news/random") {
      const item = kiesNieuws();
      state.previous = { ...state.prices };

      const changes = Object.entries(item.effect).map(([aandeel, [van, tot]]) => {
        const oud = state.prices[aandeel];
        // Procentuele verandering, minstens € 1 omhoog of omlaag
        const procent = randomGetal(van, tot);
        let verschil = Math.round((oud * procent) / 100);
        if (verschil === 0) verschil = procent > 0 ? 1 : -1;
        state.prices[aandeel] = begrens(oud + verschil);
        return { stock: aandeel, diff: state.prices[aandeel] - oud };
      });

      voegNieuwsToe(item.titel, item.tekst, changes);
      stuurUpdate();
      return json(res, 200, { ok: true });
    }

    // Eigen nieuwsbericht of handmatige koerswijziging door de beursleiding.
    if (req.method === "POST" && url === "/api/news/custom") {
      const body = await leesBody(req);
      const titel = String(body.titel || "").trim().slice(0, 100);
      const tekst = String(body.tekst || "").trim().slice(0, 300);
      const aandeel = String(body.stock || "");
      const diff = Math.round(Number(body.diff));

      if (!titel || !state.posts.includes(aandeel) || !Number.isFinite(diff)) {
        return json(res, 400, { error: "Vul een titel, aandeel en koerswijziging in." });
      }

      state.previous = { ...state.prices };
      const oud = state.prices[aandeel];
      state.prices[aandeel] = begrens(oud + diff);

      voegNieuwsToe(titel, tekst, [{ stock: aandeel, diff: state.prices[aandeel] - oud }]);
      stuurUpdate();
      return json(res, 200, { ok: true });
    }

    // Spelinstellingen ophalen (met de groepen zoals ze nu in het spel staan)
    if (req.method === "GET" && url === "/api/settings") {
      return json(res, 200, {
        instellingen,
        groepen: state.groups.map((g) => ({
          id: g.id,
          name: g.name,
          cash: g.cash,
          aandelen: state.posts.reduce((som, a) => som + g.shares[a], 0)
        })),
        posten: state.posts.map((naam) => ({
          naam,
          koers: state.prices[naam],
          inBezit: state.groups.reduce((som, g) => som + g.shares[naam], 0)
        })),
        limieten: { maxGroepen: MAX_GROEPEN, maxPosten: MAX_POSTEN, regels: regelGrenzen },
        standaardNieuws
      });
    }

    // Spelinstellingen opslaan.
    // - Nieuwe namen gaan direct in.
    // - Nieuwe groepen krijgen direct het startgeld.
    // - Verwijderde groepen verdwijnen direct (met hun geld en aandelen).
    // - Nieuwe posten starten direct op hun beginwaarde; hernoemde posten houden hun koers.
    // - Verwijderde posten: aandelen worden terugbetaald tegen de laatste koers.
    // - Min/max koers geldt direct (huidige koersen worden zo nodig bijgesteld).
    // - Startgeld en beginwaarden van bestaande posten gelden vanaf de volgende reset,
    //   of direct als "opnieuwStarten" aan staat.
    if (req.method === "PUT" && url === "/api/settings") {
      const body = await leesBody(req);
      const fout = controleerInstellingen(body);
      if (fout) return json(res, 400, { error: fout });

      instellingen = normaliseer(body);

      // Hernoemde posten ook in de nieuwsberichten hernoemen
      postenVan(body).forEach((p) => {
        const oud = typeof p.id === "string" ? p.id : null;
        const nieuw = String(p.naam).trim();
        if (!oud || oud === nieuw) return;
        instellingen.nieuws.forEach((n) => n.effecten.forEach((ef) => {
          if (ef.post.toLowerCase() === oud.toLowerCase()) ef.post = nieuw;
        }));
      });

      bewaarInstellingen();

      if (body.opnieuwStarten) {
        nieuwSpel();
      } else {
        pasToeOpLopendSpel(body);
      }

      stuurUpdate();
      return json(res, 200, { ok: true });
    }

    // Beurskrach of hausse: alle koersen tegelijk flink omlaag of omhoog
    if (req.method === "POST" && url === "/api/news/markt") {
      const body = await leesBody(req);
      const krach = body.type === "krach";
      if (!krach && body.type !== "hausse") return json(res, 400, { error: "Kies krach of hausse." });

      state.previous = { ...state.prices };
      const changes = state.posts.map((a) => {
        const oud = state.prices[a];
        const procent = krach ? -randomGetal(15, 30) : randomGetal(15, 30);
        state.prices[a] = begrens(oud + Math.round((oud * procent) / 100));
        return { stock: a, diff: state.prices[a] - oud };
      });
      voegNieuwsToe(
        krach ? "BEURSKRACH!" : "HAUSSE!",
        krach ? "Paniek op de beurs: alle aandelen kelderen." : "Feest op de beurs: alle aandelen schieten omhoog.",
        changes
      );
      stuurUpdate();
      return json(res, 200, { ok: true });
    }

    // Speeltijd bedienen
    if (req.method === "POST" && url === "/api/game") {
      const body = await leesBody(req);
      const nu = Date.now();
      const g = state.game;
      const minuten = Math.round(Number(body.minuten));

      if (body.actie === "start") {
        if (!(minuten >= 1 && minuten <= 600)) return json(res, 400, { error: "Kies een speeltijd tussen 1 en 600 minuten." });
        state.game = { status: "loopt", eind: nu + minuten * 60000, rest: null };
        voegNieuwsToe("De beurs is geopend!", `Er wordt ${minuten} minuten gehandeld. Succes!`, []);
      } else if (body.actie === "pauze" && g.status === "loopt") {
        state.game = { status: "pauze", eind: null, rest: Math.max(0, g.eind - nu) };
        voegNieuwsToe("De beurs is gepauzeerd", "Even geen handel mogelijk.", []);
      } else if (body.actie === "hervat" && g.status === "pauze") {
        state.game = { status: "loopt", eind: nu + g.rest, rest: null };
        voegNieuwsToe("De beurs gaat weer verder", "Er kan weer gehandeld worden.", []);
      } else if (body.actie === "verleng" && (g.status === "loopt" || g.status === "pauze")) {
        if (!(minuten >= -600 && minuten <= 600 && minuten !== 0)) return json(res, 400, { error: "Ongeldig aantal minuten." });
        if (g.status === "loopt") g.eind = Math.max(nu + 1000, g.eind + minuten * 60000);
        else g.rest = Math.max(1000, g.rest + minuten * 60000);
      } else if (body.actie === "stop") {
        state.game = { status: "gesloten", eind: null, rest: null };
        voegNieuwsToe("De beurs is gesloten!", "De handel is gestopt. Bekijk de eindstand op het grote scherm.", []);
      } else if (body.actie === "heropen") {
        state.game = { status: "vrij", eind: null, rest: null };
        voegNieuwsToe("De beurs is weer open", "Er kan weer gehandeld worden (zonder tijdslimiet).", []);
      } else {
        return json(res, 400, { error: "Dat kan nu niet." });
      }
      stuurUpdate();
      return json(res, 200, { ok: true });
    }

    // Geheime tip voor één groep (alleen te zien op de ledenpagina van die groep)
    if (req.method === "POST" && url === "/api/tip") {
      const body = await leesBody(req);
      const groep = state.groups.find((g) => g.id === Number(body.groep));
      const tekst = String(body.tekst || "").trim().slice(0, 200);
      if (!groep || !tekst) return json(res, 400, { error: "Kies een groep en schrijf een tip." });
      tips.unshift({ at: new Date().toISOString(), groupId: groep.id, group: groep.name, tekst });
      tips = tips.slice(0, 50);
      stuurUpdate();
      return json(res, 200, { ok: true });
    }

    // Beloning of boete voor een opdracht (door een post of de beursleiding)
    if (req.method === "POST" && url === "/api/bonus") {
      if (!handelOpen()) return json(res, 400, { error: geslotenMelding() });
      const body = await leesBody(req);
      const groep = state.groups.find((g) => g.id === Number(body.group));
      const bedrag = Math.round(Number(body.amount));
      const reden = String(body.reason || "").trim().slice(0, 80);
      const station = state.posts.includes(body.station) ? body.station : "";

      if (!groep || !Number.isFinite(bedrag) || bedrag === 0 || Math.abs(bedrag) > 1000000) {
        return json(res, 400, { error: "Kies een groep en een bedrag (positief voor beloning, negatief voor boete)." });
      }

      // Een boete kan het kasgeld niet onder € 0 brengen
      const echt = bedrag < 0 ? -Math.min(-bedrag, groep.cash) : bedrag;
      groep.cash += echt;
      groep.bonus = (groep.bonus || 0) + echt;
      boek(groep, echt >= 0 ? "bonus" : "boete", { amount: echt, reason: reden, station });

      stuurUpdate();
      return json(res, 200, { ok: true, amount: echt, gevraagd: bedrag, state });
    }

    // Bank: lenen en aflossen
    if (req.method === "POST" && url === "/api/bank") {
      if (!handelOpen()) return json(res, 400, { error: geslotenMelding() });
      const body = await leesBody(req);
      const groep = state.groups.find((g) => g.id === Number(body.group));
      const bedrag = Math.round(Number(body.amount));
      const station = state.posts.includes(body.station) ? body.station : "";
      const max = instellingen.regels.maxLening;

      if (!groep || !(bedrag >= 1)) return json(res, 400, { error: "Kies een groep en een bedrag." });
      groep.loan = groep.loan || 0;

      if (body.action === "lenen") {
        if (!max) return json(res, 400, { error: "Lenen staat uit in de spelinstellingen." });
        if (groep.loan + bedrag > max) {
          return json(res, 400, { error: `${groep.name} kan nog maar € ${Math.max(0, max - groep.loan)} lenen (maximaal € ${max}).` });
        }
        groep.loan += bedrag;
        groep.cash += bedrag;
      } else if (body.action === "aflossen") {
        if (!groep.loan) return json(res, 400, { error: `${groep.name} heeft geen lening.` });
        if (bedrag > groep.loan) return json(res, 400, { error: `De lening is maar € ${groep.loan}.` });
        if (bedrag > groep.cash) return json(res, 400, { error: `${groep.name} heeft maar € ${groep.cash} kasgeld.` });
        groep.loan -= bedrag;
        groep.cash -= bedrag;
      } else {
        return json(res, 400, { error: "Kies lenen of aflossen." });
      }

      boek(groep, body.action, { amount: bedrag, station });
      stuurUpdate();
      return json(res, 200, { ok: true, state });
    }

    // Volledige reservekopie: instellingen + spelstand + tips
    if (req.method === "GET" && url === "/api/backup") {
      return json(res, 200, { versie: 1, gemaakt: new Date().toISOString(), instellingen, state, tips });
    }

    // Reservekopie terugzetten
    if (req.method === "POST" && url === "/api/herstel") {
      const body = await leesBody(req, 5000000);
      const fout = controleerInstellingen(body.instellingen);
      if (fout) return json(res, 400, { error: "De instellingen in de reservekopie kloppen niet: " + fout });

      const vorige = instellingen;
      instellingen = normaliseer(body.instellingen);
      const st = schoonSpelstand(body.state);
      if (!st) {
        instellingen = vorige;
        return json(res, 400, { error: "De spelstand in de reservekopie is ongeldig." });
      }
      bewaarInstellingen();
      state = st;
      tips = Array.isArray(body.tips) ? body.tips.slice(0, 50) : [];
      werkRegelsBij();
      voegNieuwsToe("Spelstand hersteld", "De beurs gaat verder waar hij gebleven was.", []);
      stuurUpdate();
      return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && url === "/api/reset") {
      nieuwSpel();
      stuurUpdate();
      return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && url === "/api/trade") {
      if (!handelOpen()) return json(res, 400, { error: geslotenMelding() });
      const transactie = await leesBody(req);

      const groep = state.groups.find((g) => g.id === Number(transactie.group));
      const aandeel = String(transactie.stock || "");
      const aantal = Math.floor(Number(transactie.qty));
      const actie = String(transactie.action || "");
      const station = state.posts.includes(transactie.station) ? transactie.station : "";

      if (!groep || !state.posts.includes(aandeel) || !(aantal >= 1)) {
        return json(res, 400, { error: "Vul een geldige groep, aandeel en aantal in." });
      }

      const koers = state.prices[aandeel];
      const totaal = koers * aantal;
      groep.cost = groep.cost || {};
      let resultaat = null;
      let gemiddeld = null;

      if (actie === "buy") {
        if (groep.cash < totaal) {
          return json(res, 400, {
            error: `${groep.name} heeft onvoldoende kasgeld (nodig: € ${totaal}, aanwezig: € ${groep.cash}).`
          });
        }
        const voorraad = state.supply[aandeel] || 0;
        if (voorraad) {
          const beschikbaar = voorraad - inBezit(aandeel);
          if (aantal > beschikbaar) {
            return json(res, 400, {
              error: beschikbaar > 0
                ? `Er zijn nog maar ${beschikbaar} aandelen ${aandeel} te koop.`
                : `De aandelen ${aandeel} zijn uitverkocht! Wacht tot iemand verkoopt.`
            });
          }
        }
        groep.cash -= totaal;
        groep.shares[aandeel] += aantal;
        groep.cost[aandeel] = (groep.cost[aandeel] || 0) + totaal;
      } else if (actie === "sell") {
        if (groep.shares[aandeel] < aantal) {
          return json(res, 400, {
            error: `${groep.name} heeft maar ${groep.shares[aandeel]} aandelen ${aandeel}.`
          });
        }
        gemiddeld = Math.round(gemiddeldePrijs(groep, aandeel));
        groep.cash += totaal;
        resultaat = verkoopUitBezit(groep, aandeel, aantal, koers);
      } else {
        return json(res, 400, { error: "Kies kopen of verkopen." });
      }

      boek(groep, actie, {
        stock: aandeel,
        qty: aantal,
        price: koers,
        total: totaal,
        avg: gemiddeld,     // gemiddelde aankoopprijs (alleen bij verkoop)
        result: resultaat,  // winst (+) of verlies (-) (alleen bij verkoop)
        station
      });

      // Koers reageert op handel: kopen maakt duurder, verkopen goedkoper
      const impact = instellingen.regels.koersImpact;
      if (impact) {
        let verschil = Math.round((koers * impact * aantal) / 100);
        if (verschil === 0) verschil = 1;
        state.prices[aandeel] = begrens(koers + (actie === "buy" ? verschil : -verschil));
        noteerKoersen();
      }

      stuurUpdate();
      return json(res, 200, { ok: true, total: totaal, result: resultaat, state });
    }

    serveFile(req, res);
  } catch (error) {
    json(res, 400, { error: error.message || "Er ging iets mis." });
  }
});

// Houd de live-verbindingen open (sommige routers/telefoons sluiten stille verbindingen).
setInterval(() => clients.forEach((c) => c.res.write(": ping\n\n")), 25000);

function lokaleAdressen() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
}

const poort = process.env.PORT || 3000;

server.listen(poort, () => {
  console.log("Marktmeesters draait!");
  console.log("  Beursleiding:  http://localhost:" + poort + "/beurs.html");
  lokaleAdressen().forEach((ip) => {
    console.log("  Posten (zelfde wifi): http://" + ip + ":" + poort + "/");
  });

  if (!process.env.BEURS_WACHTWOORD || !process.env.POST_WACHTWOORD || !process.env.SPELER_WACHTWOORD) {
    console.log("");
    console.log("  Let op: standaardwachtwoorden in gebruik (beurs123 / post123 / speler123).");
    console.log("  Stel BEURS_WACHTWOORD, POST_WACHTWOORD en SPELER_WACHTWOORD in voordat je online gaat.");
  }
});
