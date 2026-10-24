(() => {
  // De posten komen uit de spelinstellingen op de server
  let aandelen = [];
  let post = null;

  const params = new URLSearchParams(location.search);
  const gevraagd = params.get("post") || "";

  const $ = (sel) => document.querySelector(sel);

  const koers = $("#koers");
  const groepen = $("#groepen");
  const aandeelSelect = $("#aandeel");
  const aantalInput = $("#aantal");
  const melding = $("#melding");
  const samenvatting = $("#samenvatting");
  const verwerkKnop = $("#verwerk");

  let state = null;
  let klokVerschil = 0;
  let gekozenGroep = 1;
  let gekozenActie = "buy";
  let modus = "handel";
  let bonusSoort = "plus";
  let invoer = "aantal"; // "aantal" of "bedrag"

  function kleinsteDeel() {
    return (state && state.rules && state.rules.kleinsteDeel) || 1;
  }

  // Afronden op het kleinste deel (naar beneden, zodat je nooit meer koopt dan je wilt)
  function opDeel(x) {
    const d = kleinsteDeel();
    return rondAantal(Math.floor(x / d + 1e-9) * d);
  }

  // Het aantal aandelen dat nu ingevoerd is (bij "per bedrag" omgerekend)
  function huidigAantal() {
    if (!state || !post) return 0;
    if (invoer === "bedrag") {
      const prijs = state.prices[aandeelSelect.value];
      return prijs ? opDeel((Number($("#bedrag").value) || 0) / prijs) : 0;
    }
    return rondAantal(Number(aantalInput.value) || 0);
  }

  // Knoppen en stappen aanpassen aan het kleinste deel (1, 0,5, 0,25, 0,1 of 0,01)
  function zetDeelKnoppen() {
    const d = kleinsteDeel();
    const heel = d >= 1;
    document.querySelectorAll(".klein.deel").forEach((k) => {
      k.hidden = heel;
      k.textContent = (k.dataset.stap === "deel" ? "+" : "−") + aantalTekst(d);
    });
    $("#aantalKnoppen").classList.toggle("heel", heel);
    aantalInput.step = d;
    aantalInput.min = d;
    aantalInput.inputMode = heel ? "numeric" : "decimal";
  }

  document.querySelectorAll("[data-invoer]").forEach((knop) => {
    knop.addEventListener("click", () => {
      // Het huidige aantal meenemen naar de andere invoer
      const aantal = huidigAantal();
      invoer = knop.dataset.invoer;
      zetActief("[data-invoer]", knop);
      $("#aantalVeld").hidden = invoer !== "aantal";
      $("#bedragVeld").hidden = invoer !== "bedrag";
      const prijs = state && state.prices[aandeelSelect.value];
      if (invoer === "aantal" && aantal > 0) aantalInput.value = aantal;
      if (invoer === "bedrag" && prijs && aantal > 0) $("#bedrag").value = Math.round(aantal * prijs * 100) / 100;
      werkAllesBij();
    });
  });

  function naarLogin() {
    location.href = "/login.html?terug=" + encodeURIComponent(location.pathname + location.search);
  }

  // € 12 of € 12,50 (centen alleen als het nodig is)
  function euro(bedrag) {
    const b = Math.round(Number(bedrag) * 100) / 100;
    return "€ " + b.toLocaleString("nl-NL", { minimumFractionDigits: Number.isInteger(b) ? 0 : 2, maximumFractionDigits: 2 });
  }

  // 3 of 0,5 aandelen
  const aantalTekst = (x) => Number(x).toLocaleString("nl-NL", { maximumFractionDigits: 4 });
  const rondAantal = (x) => Math.round(x * 10000) / 10000;

  function esc(tekst) {
    return String(tekst).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  function mmss(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, "0")}`;
  }

  // Bedrag met + of − en een kleur: groen voor winst, rood voor verlies
  function resultaatHtml(bedrag) {
    const r = Math.round(Number(bedrag) * 100) / 100;
    if (r > 0) return `<span class="winst">+${euro(r)}</span>`;
    if (r < 0) return `<span class="verlies">−${euro(-r)}</span>`;
    return `<span class="neutraal">€ 0</span>`;
  }

  function gemiddeld(groep, a) {
    const aantal = groep.shares[a] || 0;
    return aantal ? ((groep.cost && groep.cost[a]) || 0) / aantal : 0;
  }

  // Winst/verlies op aandelen die de groep nu nog heeft (als ze nu zouden verkopen)
  function openResultaat(groep, a) {
    const aantal = groep.shares[a] || 0;
    return aantal ? state.prices[a] * aantal - ((groep.cost && groep.cost[a]) || 0) : 0;
  }

  function handelOpen() {
    return state && (state.game.status === "vrij" || state.game.status === "loopt");
  }

  function vrijeVoorraad(a) {
    const totaal = (state.supply && state.supply[a]) || 0;
    if (!totaal) return Infinity;
    return rondAantal(totaal - state.groups.reduce((som, g) => som + (g.shares[a] || 0), 0));
  }

  function gekozen() {
    return state && state.groups.find((g) => g.id === gekozenGroep);
  }

  // Zoek de post uit de link (hoofdletterongevoelig, zodat ?post=sleper ook werkt)
  function werkPostBij() {
    const vorigePost = post;
    post = aandelen.find((a) => a.toLowerCase() === gevraagd.toLowerCase()) || null;

    const bestaat = !!post;
    $("#onbekend").hidden = bestaat;
    $("#inhoud").hidden = !bestaat;

    if (!bestaat) {
      document.title = "Onbekende post · Marktmeesters";
      $("#titel").textContent = "Post niet gevonden";
      $("#subtitel").textContent = "MARKTMEESTERS";
      $("#onbekendNaam").textContent = gevraagd || "(geen naam)";
      return;
    }

    document.title = "Post " + post + " · Marktmeesters";
    $("#titel").textContent = "Post: " + post;
    $("#subtitel").textContent = "MARKTMEESTERS · " + post.toUpperCase();

    const huidig = aandeelSelect.value;
    aandeelSelect.innerHTML = "";
    aandelen.forEach((a) => aandeelSelect.add(new Option(a, a)));
    aandeelSelect.value = vorigePost !== post || !aandelen.includes(huidig) ? post : huidig;
    zetAandeelKeuze();
  }

  // --- Keuzeknoppen ---

  function zetActief(selector, knop) {
    document.querySelectorAll(selector).forEach((k) => k.classList.toggle("actief", k === knop));
  }

  document.querySelectorAll("[data-modus]").forEach((knop) => {
    knop.addEventListener("click", () => {
      modus = knop.dataset.modus;
      zetActief("[data-modus]", knop);
      document.querySelectorAll(".modus").forEach((m) => { m.hidden = m.dataset.voor !== modus; });
      melding.textContent = "";
      werkAllesBij();
    });
  });

  function tekenGroepKnoppen() {
    if (!state) return;
    $("#groepKnoppen").innerHTML = state.groups.map((g) => `
      <button type="button" class="keuzeknop ${g.id === gekozenGroep ? "actief" : ""}" data-groep="${g.id}">
        ${esc(g.name)}
      </button>`).join("");
  }

  $("#groepKnoppen").addEventListener("click", (e) => {
    const knop = e.target.closest("[data-groep]");
    if (!knop) return;
    gekozenGroep = Number(knop.dataset.groep);
    tekenGroepKnoppen();
    tekenGroepen();
    werkAllesBij();
  });

  document.querySelectorAll("[data-actie]").forEach((knop) => {
    knop.addEventListener("click", () => {
      gekozenActie = knop.dataset.actie;
      zetActief("[data-actie]", knop);
      zetAandeelKeuze();
      werkAllesBij();
    });
  });

  document.querySelectorAll("[data-bonus]").forEach((knop) => {
    knop.addEventListener("click", () => {
      bonusSoort = knop.dataset.bonus;
      zetActief("[data-bonus]", knop);
      werkAllesBij();
    });
  });

  document.querySelectorAll("[data-stap]").forEach((knop) => {
    knop.addEventListener("click", () => {
      const d = kleinsteDeel();
      const stap = knop.dataset.stap === "deel" ? d : knop.dataset.stap === "-deel" ? -d : Number(knop.dataset.stap);
      aantalInput.value = rondAantal(Math.max(d, (Number(aantalInput.value) || 0) + stap));
      werkAllesBij();
    });
  });

  // Max: zoveel als de groep kan kopen (geld en voorraad) of alles wat ze heeft (verkopen)
  $("#maxKnop").addEventListener("click", () => {
    const groep = gekozen();
    if (!groep || !state) return;
    const a = aandeelSelect.value;
    let max;
    if (gekozenActie === "buy") {
      max = opDeel(groep.cash / state.prices[a]);
      const vrij = vrijeVoorraad(a);
      if (vrij !== Infinity) max = Math.min(max, opDeel(vrij));
    } else {
      max = rondAantal(groep.shares[a] || 0);
    }
    if (invoer === "bedrag") $("#bedrag").value = Math.round(max * state.prices[a] * 100) / 100;
    else aantalInput.value = max;
    werkAllesBij();
  });

  $("#bonusSnel").addEventListener("click", (e) => {
    const knop = e.target.closest("[data-bedrag]");
    if (!knop) return;
    $("#bonusBedrag").value = knop.dataset.bedrag;
    werkAllesBij();
  });

  [aandeelSelect, aantalInput, $("#bedrag"), $("#bonusBedrag"), $("#bonusReden")].forEach((el) => {
    el.addEventListener("input", werkAllesBij);
  });

  // --- Samenvattingen ---

  // Kopen: alleen het aandeel van deze post. Verkopen: elk aandeel.
  function zetAandeelKeuze() {
    if (!post) return;
    const kopen = gekozenActie === "buy";
    if (kopen) aandeelSelect.value = post;
    aandeelSelect.disabled = kopen;
    $("#aandeelUitleg").textContent = kopen
      ? `Bij deze post kun je alleen ${post} kopen.`
      : "Verkopen kan van elk aandeel dat de groep heeft.";
  }

  function werkHandelBij() {
    const aandeel = aandeelSelect.value;
    const aantal = huidigAantal();
    const prijs = state.prices[aandeel];
    const totaal = Math.round(prijs * aantal * 100) / 100;
    const groep = gekozen();
    const d = kleinsteDeel();

    if (invoer === "bedrag") {
      $("#bedragUitleg").textContent = aantal > 0
        ? `= ${aantalTekst(aantal)} aandeel ${aandeel} (${euro(totaal)})`
        : `Te weinig voor ${aantalTekst(d)} aandeel (${euro(prijs * d)}).`;
    }
    const geldig = aantal >= d - 1e-9 && Math.abs(aantal / d - Math.round(aantal / d)) < 1e-6;

    let extra = "";
    if (gekozenActie === "buy" && groep) {
      const vrij = vrijeVoorraad(aandeel);
      if (vrij !== Infinity && aantal > vrij + 1e-9) {
        extra = ` <span class="fout">— ${vrij > 0 ? `er zijn er nog maar ${aantalTekst(vrij)} te koop` : "uitverkocht!"}</span>`;
      } else if (totaal > groep.cash) {
        extra = ` <span class="fout">— te weinig kasgeld (${euro(groep.cash)})</span>`;
      }
    }
    if (gekozenActie === "sell" && groep && aantal > (groep.shares[aandeel] || 0) + 1e-9) {
      extra = ` <span class="fout">— groep heeft er maar ${aantalTekst(groep.shares[aandeel] || 0)}</span>`;
    } else if (gekozenActie === "sell" && groep && aantal > 0) {
      const gem = gemiddeld(groep, aandeel);
      const r = (prijs - gem) * aantal;
      extra = `<br>Gekocht voor gemiddeld ${euro(gem)} → ${r >= 0 ? "winst" : "verlies"} op deze verkoop: <b>${resultaatHtml(r)}</b>`;
    }

    const impact = state.rules && state.rules.koersImpact;
    const reactie = impact && aantal
      ? `<br><small>Na deze ${gekozenActie === "buy" ? "aankoop stijgt" : "verkoop daalt"} de koers ongeveer ${(Math.round(impact * aantal * 10) / 10).toLocaleString("nl-NL")}%.</small>`
      : "";
    if (!geldig && aantal > 0) {
      extra = ` <span class="fout">— alleen in stappen van ${aantalTekst(d)}</span>`;
    }

    const werkwoord = gekozenActie === "buy" ? "koopt" : "verkoopt";
    samenvatting.innerHTML = groep
      ? `${esc(groep.name)} ${werkwoord} <b>${aantalTekst(aantal)}× ${esc(aandeel)}</b> à ${euro(prijs)} = <b>${euro(totaal)}</b>${extra}${reactie}`
      : "";

    verwerkKnop.textContent = gekozenActie === "buy" ? `Koop voor ${euro(totaal)}` : `Verkoop voor ${euro(totaal)}`;
    verwerkKnop.className = gekozenActie === "buy" ? "" : "verkoop";
  }

  function werkBonusBij() {
    const groep = gekozen();
    const bedrag = Math.round(Number($("#bonusBedrag").value)) || 0;
    const plus = bonusSoort === "plus";
    const reden = $("#bonusReden").value.trim();
    let tekst = groep ? `${esc(groep.name)} ${plus ? "krijgt" : "betaalt"} <b>${euro(bedrag)}</b>${reden ? ` voor "${esc(reden)}"` : ""}.` : "";
    if (!plus && groep && bedrag > groep.cash) {
      tekst += ` <span class="fout">De groep heeft maar ${euro(groep.cash)}; de boete wordt dan ${euro(groep.cash)}.</span>`;
    }
    $("#bonusSamenvatting").innerHTML = tekst;
    $("#bonusKnop").textContent = plus ? `🏅 Geef ${euro(bedrag)} beloning` : `⚠️ Geef ${euro(bedrag)} boete`;
    $("#bonusKnop").className = plus ? "" : "verkoop";
  }

  function werkAllesBij() {
    if (!state || !post) return;
    werkHandelBij();
    werkBonusBij();
    const open = handelOpen();
    [verwerkKnop, $("#bonusKnop")].forEach((k) => { k.disabled = !open; });
  }

  // --- Weergave ---

  function tekenSpeelbalk() {
    if (!state) return;
    const g = state.game;
    const balk = $("#speelbalk");
    let tekst = "", klasse = "speelbalk";
    if (g.status === "loopt") {
      const rest = g.eind - (Date.now() + klokVerschil);
      tekst = `⏱ Nog <b>${mmss(rest)}</b> speeltijd`;
      if (rest <= 300000) { klasse += " slot"; tekst += " · SLOTFASE"; }
    } else if (g.status === "pauze") {
      tekst = `⏸ <b>Gepauzeerd</b> — even geen handel mogelijk`;
      klasse += " dicht";
    } else if (g.status === "gesloten") {
      tekst = `■ <b>De beurs is gesloten</b> — er kan niet meer gehandeld worden`;
      klasse += " dicht";
    }
    balk.className = klasse;
    balk.innerHTML = tekst;
    balk.hidden = !tekst;
  }

  function tekenGroepen() {
    if (!state || !post) return;

    koers.textContent = euro(state.prices[post]);
    const verschil = state.prices[post] - state.previous[post];
    koers.className = verschil < 0 ? "down" : "";

    const vrij = vrijeVoorraad(post);
    $("#voorraad").innerHTML = vrij === Infinity ? "" : vrij <= 0
      ? `<span class="fout">Uitverkocht</span>`
      : `Nog ${aantalTekst(vrij)} van ${state.supply[post]} te koop`;

    groepen.innerHTML = state.groups.map((groep) => {
      const waarde = aandelen.reduce((som, a) => som + (groep.shares[a] || 0) * state.prices[a], 0);
      const totaalOpen = aandelen.reduce((som, a) => som + openResultaat(groep, a), 0);

      const bezit = aandelen.map((a) => {
        const aantal = groep.shares[a] || 0;
        const detail = aantal
          ? `<small>gekocht à ${euro(gemiddeld(groep, a))} · ${resultaatHtml(openResultaat(groep, a))}</small>`
          : "";
        return `
        <span class="${a === post ? "hier" : ""} ${aantal ? "" : "leeg"}">
          ${esc(a)}: <b>${aantalTekst(aantal)}</b> ${detail}
        </span>`;
      }).join("");

      return `
        <article class="groepkaart ${groep.id === gekozenGroep ? "gekozen" : ""}">
          <h3>${esc(groep.name)}</h3>
          <div class="kas">${euro(groep.cash)}</div>
          <div class="waarde">Totale waarde: ${euro(groep.cash + waarde - (groep.loan || 0))}</div>
          ${groep.loan ? `<div class="waarde">Lening: <span class="verlies">${euro(groep.loan)}</span></div>` : ""}
          <div class="resultaten">
            <div>Op aandelen in bezit: <b>${resultaatHtml(totaalOpen)}</b></div>
            <div>Op verkochte aandelen: <b>${resultaatHtml(groep.realized || 0)}</b></div>
          </div>
          <div class="bezit">${bezit}</div>
        </article>`;
    }).join("");
  }

  function tekenNieuws() {
    if (!state || !state.news.length) return;
    const n = state.news[0];
    const effecten = n.changes.map((c) => `${esc(c.stock)} ${c.diff > 0 ? "+" : ""}€ ${c.diff}`).join(" · ");
    $("#nieuwsbalk").innerHTML = `
      <span class="label">LAATSTE NIEUWS</span>
      <b>${esc(n.titel)}</b>${effecten ? " — " + effecten : ""}`;
  }

  function zetThema(t) {
    const link = document.getElementById("thema");
    const href = "/thema.css?thema=" + encodeURIComponent(t);
    if (t && link && link.getAttribute("href") !== href) link.setAttribute("href", href);
  }

  function verwerkState(nieuw) {
    const vorigeNieuws = state && state.news[0] && state.news[0].at;
    state = nieuw;
    zetThema(state.thema);
    if (state.serverNow) klokVerschil = state.serverNow - Date.now();
    if (state.posts.join("|") !== aandelen.join("|") || !post) {
      aandelen = state.posts;
      werkPostBij();
    }
    // Bestaat de gekozen groep niet meer (verwijderd in de instellingen)? Kies dan de eerste.
    if (!state.groups.some((g) => g.id === gekozenGroep) && state.groups.length) {
      gekozenGroep = state.groups[0].id;
    }
    zetDeelKnoppen();
    tekenGroepKnoppen();
    tekenGroepen();
    tekenNieuws();
    tekenSpeelbalk();
    werkAllesBij();

    if (vorigeNieuws && state.news[0] && state.news[0].at !== vorigeNieuws) {
      const balk = $("#nieuwsbalk");
      balk.classList.remove("flits");
      void balk.offsetWidth;
      balk.classList.add("flits");
    }
  }

  setInterval(tekenSpeelbalk, 1000);

  // --- Versturen ---

  async function verstuur(url, data, knop, succes) {
    knop.disabled = true;
    melding.textContent = "";
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, group: gekozenGroep, station: post })
      });
      if (res.status === 401) return naarLogin();
      const inhoud = await res.json();
      if (!res.ok) {
        melding.textContent = inhoud.error || "Dat kon niet worden verwerkt.";
        melding.className = "melding fout";
        return;
      }
      melding.textContent = succes(inhoud);
      melding.className = "melding goed";
      if (inhoud.state) verwerkState(inhoud.state);
    } catch {
      melding.textContent = "De server is niet bereikbaar.";
      melding.className = "melding fout";
    } finally {
      knop.disabled = !handelOpen();
    }
  }

  verwerkKnop.addEventListener("click", () => {
    verstuur("/api/trade", { action: gekozenActie, stock: aandeelSelect.value, qty: huidigAantal() }, verwerkKnop, (inhoud) => {
      aantalInput.value = 1;
      if (inhoud.result === null || inhoud.result === undefined) return "✓ Gekocht voor " + euro(inhoud.total) + ".";
      if (inhoud.result === 0) return "✓ Verkocht voor " + euro(inhoud.total) + " — geen winst of verlies.";
      return inhoud.result > 0
        ? "✓ Verkocht voor " + euro(inhoud.total) + " — " + euro(inhoud.result) + " winst!"
        : "✓ Verkocht voor " + euro(inhoud.total) + " — " + euro(-inhoud.result) + " verlies.";
    });
  });

  $("#bonusKnop").addEventListener("click", () => {
    const bedrag = Math.abs(Math.round(Number($("#bonusBedrag").value)) || 0);
    verstuur("/api/bonus", {
      amount: bonusSoort === "plus" ? bedrag : -bedrag,
      reason: $("#bonusReden").value
    }, $("#bonusKnop"), (inhoud) => {
      $("#bonusReden").value = "";
      return inhoud.amount >= 0
        ? `✓ Beloning van ${euro(inhoud.amount)} gegeven.`
        : `✓ Boete van ${euro(-inhoud.amount)} gegeven.` +
          (inhoud.amount !== inhoud.gevraagd ? " (Meer kasgeld had de groep niet.)" : "");
    });
  });

  // --- Live updates ---

  const verbinding = $("#verbinding");
  const live = new EventSource("/api/events");

  live.onopen = () => {
    verbinding.textContent = "● Live";
    verbinding.className = "verbinding";
  };
  live.onerror = () => {
    verbinding.textContent = "● Geen verbinding";
    verbinding.className = "verbinding weg";
    fetch("/api/me").then((r) => { if (r.status === 401) naarLogin(); }).catch(() => {});
  };
  live.onmessage = (event) => verwerkState(JSON.parse(event.data));
})();
