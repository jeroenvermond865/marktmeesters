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

// Sleutel om inlog-cookies te ondertekenen. Afgeleid van de wachtwoorden,
// zodat je na een herstart ingelogd blijft, maar na een wachtwoordwijziging niet.
const SLEUTEL = crypto
  .createHash("sha256")
  .update("marktmeesters|" + WACHTWOORD_BEURS + "|" + WACHTWOORD_POST)
  .digest();

const COOKIE = "mm_sessie";

const aandelen = ["Eiland", "Sleper", "Gebouw", "Loods", "Lelievletten"];

const MIN_KOERS = 10;
const MAX_KOERS = 250;
const MAX_GROEPEN = 20;

// --- Spelinstellingen ---
// Dit zijn de standaardinstellingen. Je past ze normaal aan via de pagina
// "Spelinstellingen" (alleen voor de beursleiding). Wat je daar opslaat,
// komt in het bestand instellingen.json te staan.
const standaardInstellingen = {
  groepen: ["Groep 755", "Groep 1063", "Groep 1766", "Groep 1798"],
  startkapitaal: 1000,
  beginKoersen: {
    Eiland: 100,
    Sleper: 105,
    Gebouw: 95,
    Loods: 125,
    Lelievletten: 70
  }
};

const instellingenBestand = path.join(__dirname, "instellingen.json");
let instellingen = laadInstellingen();

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

// Geeft een foutmelding terug, of null als alles goed is
function controleerInstellingen(inst) {
  if (!inst || !Array.isArray(inst.groepen)) return "Groepen ontbreken.";
  const namen = inst.groepen.map((n) => String(n && n.name !== undefined ? n.name : n).trim());
  if (namen.length < 1) return "Er moet minstens één groep zijn.";
  if (namen.length > MAX_GROEPEN) return `Maximaal ${MAX_GROEPEN} groepen.`;
  if (namen.some((n) => !n)) return "Elke groep heeft een naam nodig.";
  if (namen.some((n) => n.length > 30)) return "Groepsnamen mogen maximaal 30 tekens zijn.";
  const uniek = new Set(namen.map((n) => n.toLowerCase()));
  if (uniek.size !== namen.length) return "Twee groepen hebben dezelfde naam.";

  const kapitaal = Number(inst.startkapitaal);
  if (!Number.isInteger(kapitaal) || kapitaal < 0 || kapitaal > 1000000) {
    return "Startgeld moet een heel getal tussen 0 en 1.000.000 zijn.";
  }

  for (const a of aandelen) {
    const k = Number(inst.beginKoersen && inst.beginKoersen[a]);
    if (!Number.isInteger(k) || k < MIN_KOERS || k > MAX_KOERS) {
      return `Beginkoers van ${a} moet tussen € ${MIN_KOERS} en € ${MAX_KOERS} liggen.`;
    }
  }
  return null;
}

function normaliseer(inst) {
  return {
    groepen: inst.groepen.map((n) => String(n && n.name !== undefined ? n.name : n).trim()),
    startkapitaal: Number(inst.startkapitaal),
    beginKoersen: Object.fromEntries(aandelen.map((a) => [a, Number(inst.beginKoersen[a])]))
  };
}

function nieuweGroep(id, naam) {
  return {
    id,
    name: naam,
    cash: instellingen.startkapitaal,
    shares: Object.fromEntries(aandelen.map((a) => [a, 0]))
  };
}

// Nieuwsberichten staan nu op de server: zo blijft alles gelijk,
// ook als de beurspagina per ongeluk herladen wordt.
const nieuws = [
  { titel: "Nieuwe aanlegsteiger opent", tekst: "De bereikbaarheid van het eiland verbetert direct.", effect: { Eiland: [18, 34] } },
  { titel: "Motorstoring bij de sleper", tekst: "Een onverwachte reparatie zet de planning onder druk.", effect: { Sleper: [-22, -10] } },
  { titel: "Loods volledig verhuurd", tekst: "Alle opslagruimte is voor de komende maanden gereserveerd.", effect: { Loods: [20, 38] } },
  { titel: "Lelievletten winnen regatta", tekst: "De zichtbaarheid op het water zorgt voor extra belangstelling.", effect: { Lelievletten: [16, 30] } },
  { titel: "Nieuwe huurder voor het gebouw", tekst: "Een langlopend contract geeft beleggers vertrouwen.", effect: { Gebouw: [15, 28] } },
  { titel: "Storm boven Nieuwe Vaart", tekst: "Schade en vertraging raken meerdere onderdelen van de haven.", effect: { Eiland: [-18, -8], Sleper: [-16, -7], Lelievletten: [-20, -9] } },
  { titel: "Zonnig weekend trekt bezoekers", tekst: "De haven bruist en de belangstelling groeit.", effect: { Eiland: [10, 22], Loods: [12, 25] } },
  { titel: "Onderhoudsbudget goedgekeurd", tekst: "De sleper en het gebouw krijgen zekerheid voor komend seizoen.", effect: { Sleper: [14, 29], Gebouw: [12, 24] } },
  { titel: "Vergunning voor loods vertraagd", tekst: "De geplande uitbreiding moet wachten op een besluit.", effect: { Loods: [-19, -8] } },
  { titel: "Nieuwe sponsor voor de lelievletten", tekst: "De vloot krijgt meer middelen voor onderhoud en activiteiten.", effect: { Lelievletten: [20, 36] } },
  { titel: "Lekkage in het gebouw", tekst: "Na de regen blijkt het dak niet meer waterdicht.", effect: { Gebouw: [-20, -9] } },
  { titel: "Eiland overspoeld door ganzen", tekst: "Kampeerders blijven weg zolang de ganzen er zitten.", effect: { Eiland: [-15, -6] } }
];

const clients = new Set();
let state;

function nieuwSpel() {
  state = {
    prices: { ...instellingen.beginKoersen },
    previous: { ...instellingen.beginKoersen },
    groups: instellingen.groepen.map((naam, i) => nieuweGroep(i + 1, naam)),
    news: [
      {
        at: new Date().toISOString(),
        titel: "De beurs opent",
        tekst: "Alle aandelen starten op hun beginwaarde.",
        changes: []
      }
    ],
    transactions: []
  };
}

nieuwSpel();

function randomGetal(van, tot) {
  return van + Math.floor(Math.random() * (tot - van + 1));
}

function begrens(koers) {
  return Math.max(MIN_KOERS, Math.min(MAX_KOERS, Math.round(koers)));
}

function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function stuurUpdate() {
  const bericht = "data: " + JSON.stringify(state) + "\n\n";
  clients.forEach((client) => client.write(bericht));
}

function leesBody(req) {
  return new Promise((resolve, reject) => {
    let inhoud = "";
    req.on("data", (deel) => {
      inhoud += deel;
      if (inhoud.length > 100000) {
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
  if ((rol === "beurs" || rol === "post") && handtekening && gelijk(handtekening, onderteken(rol))) {
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
        url.startsWith("/api/news/") || url === "/api/reset" || url === "/api/settings";
      if (alleenBeurs && rol !== "beurs") {
        return json(res, 403, { error: "Alleen de beursleiding mag dit doen." });
      }

      if (req.method === "GET" && url === "/api/me") {
        return json(res, 200, { rol });
      }
    }

    if (req.method === "GET" && url === "/api/state") {
      return json(res, 200, state);
    }

    if (req.method === "GET" && url === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      });
      res.write("retry: 2000\n");
      res.write("data: " + JSON.stringify(state) + "\n\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }

    // Willekeurig nieuwsbericht: server kiest, past koersen aan en stuurt door.
    if (req.method === "POST" && url === "/api/news/random") {
      const item = nieuws[Math.floor(Math.random() * nieuws.length)];
      state.previous = { ...state.prices };

      const changes = Object.entries(item.effect).map(([aandeel, [van, tot]]) => {
        const oud = state.prices[aandeel];
        state.prices[aandeel] = begrens(oud + randomGetal(van, tot));
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

      if (!titel || !aandelen.includes(aandeel) || !Number.isFinite(diff)) {
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
          aandelen: aandelen.reduce((som, a) => som + g.shares[a], 0)
        })),
        limieten: { minKoers: MIN_KOERS, maxKoers: MAX_KOERS, maxGroepen: MAX_GROEPEN }
      });
    }

    // Spelinstellingen opslaan.
    // - Nieuwe namen gaan direct in.
    // - Nieuwe groepen krijgen direct het startgeld.
    // - Verwijderde groepen verdwijnen direct (met hun geld en aandelen).
    // - Startgeld en beginkoersen gelden vanaf de volgende reset, of direct als "opnieuwStarten" aan staat.
    if (req.method === "PUT" && url === "/api/settings") {
      const body = await leesBody(req);
      const fout = controleerInstellingen(body);
      if (fout) return json(res, 400, { error: fout });

      instellingen = normaliseer(body);
      bewaarInstellingen();

      if (body.opnieuwStarten) {
        nieuwSpel();
      } else {
        const bestaand = new Map(state.groups.map((g) => [g.id, g]));
        let volgendId = Math.max(0, ...state.groups.map((g) => g.id)) + 1;

        state.groups = body.groepen.map((item, i) => {
          const id = Number(item && item.id);
          const groep = bestaand.get(id);
          if (groep) {
            groep.name = instellingen.groepen[i];
            return groep;
          }
          return nieuweGroep(volgendId++, instellingen.groepen[i]);
        });
      }

      stuurUpdate();
      return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && url === "/api/reset") {
      nieuwSpel();
      stuurUpdate();
      return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && url === "/api/trade") {
      const transactie = await leesBody(req);

      const groep = state.groups.find((g) => g.id === Number(transactie.group));
      const aandeel = String(transactie.stock || "");
      const aantal = Math.floor(Number(transactie.qty));
      const actie = String(transactie.action || "");
      const station = aandelen.includes(transactie.station) ? transactie.station : "";

      if (!groep || !aandelen.includes(aandeel) || !(aantal >= 1)) {
        return json(res, 400, { error: "Vul een geldige groep, aandeel en aantal in." });
      }

      const koers = state.prices[aandeel];
      const totaal = koers * aantal;

      if (actie === "buy") {
        if (groep.cash < totaal) {
          return json(res, 400, {
            error: `${groep.name} heeft onvoldoende kasgeld (nodig: € ${totaal}, aanwezig: € ${groep.cash}).`
          });
        }
        groep.cash -= totaal;
        groep.shares[aandeel] += aantal;
      } else if (actie === "sell") {
        if (groep.shares[aandeel] < aantal) {
          return json(res, 400, {
            error: `${groep.name} heeft maar ${groep.shares[aandeel]} aandelen ${aandeel}.`
          });
        }
        groep.cash += totaal;
        groep.shares[aandeel] -= aantal;
      } else {
        return json(res, 400, { error: "Kies kopen of verkopen." });
      }

      state.transactions.unshift({
        at: new Date().toISOString(),
        group: groep.name,
        action: actie,
        stock: aandeel,
        qty: aantal,
        price: koers,
        total: totaal,
        station
      });
      state.transactions = state.transactions.slice(0, 100);

      stuurUpdate();
      return json(res, 200, { ok: true, total: totaal, state });
    }

    serveFile(req, res);
  } catch (error) {
    json(res, 400, { error: error.message || "Er ging iets mis." });
  }
});

// Houd de live-verbindingen open (sommige routers/telefoons sluiten stille verbindingen).
setInterval(() => clients.forEach((c) => c.write(": ping\n\n")), 25000);

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

  if (!process.env.BEURS_WACHTWOORD || !process.env.POST_WACHTWOORD) {
    console.log("");
    console.log("  Let op: standaardwachtwoorden in gebruik (beurs123 / post123).");
    console.log("  Stel BEURS_WACHTWOORD en POST_WACHTWOORD in voordat je online gaat.");
  }
});
