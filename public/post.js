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
  let bankActie = "lenen";

  function naarLogin() {
    location.href = "/login.html?terug=" + encodeURIComponent(location.pathname + location.search);
  }

  function euro(bedrag) {
    return "€ " + Math.round(Number(bedrag)).toLocaleString("nl-NL");
  }

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
    const r = Math.round(bedrag);
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
    return totaal - state.groups.reduce((som, g) => som + (g.shares[a] || 0), 0);
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

  document.querySelectorAll("[data-bank]").forEach((knop) => {
    knop.addEventListener("click", () => {
      bankActie = knop.dataset.bank;
      zetActief("[data-bank]", knop);
      werkAllesBij();
    });
  });

  document.querySelectorAll("[data-stap]").forEach((knop) => {
    knop.addEventListener("click", () => {
      aantalInput.value = Math.max(1, (Number(aantalInput.value) || 0) + Number(knop.dataset.stap));
      werkAllesBij();
    });
  });

  $("#bonusSnel").addEventListener("click", (e) => {
    const knop = e.target.closest("[data-bedrag]");
    if (!knop) return;
    $("#bonusBedrag").value = knop.dataset.bedrag;
    werkAllesBij();
  });

  [aandeelSelect, aantalInput, $("#bonusBedrag"), $("#bonusReden"), $("#bankBedrag")].forEach((el) => {
    el.addEventListener("input", werkAllesBij);
  });

  // --- Samenvattingen ---

  function werkHandelBij() {
    const aandeel = aandeelSelect.value;
    const aantal = Math.floor(Number(aantalInput.value)) || 0;
    const prijs = state.prices[aandeel];
    const totaal = prijs * aantal;
    const groep = gekozen();

    let extra = "";
    if (gekozenActie === "buy" && groep) {
      const vrij = vrijeVoorraad(aandeel);
      if (vrij !== Infinity && aantal > vrij) {
        extra = ` <span class="fout">— ${vrij > 0 ? `er zijn er nog maar ${vrij} te koop` : "uitverkocht!"}</span>`;
      } else if (totaal > groep.cash) {
        extra = ` <span class="fout">— te weinig kasgeld (${euro(groep.cash)})</span>`;
      }
    }
    if (gekozenActie === "sell" && groep && aantal > groep.shares[aandeel]) {
      extra = ` <span class="fout">— groep heeft er maar ${groep.shares[aandeel]}</span>`;
    } else if (gekozenActie === "sell" && groep && aantal > 0) {
      const gem = gemiddeld(groep, aandeel);
      const r = (prijs - gem) * aantal;
      extra = `<br>Gekocht voor gemiddeld ${euro(gem)} → ${r >= 0 ? "winst" : "verlies"} op deze verkoop: <b>${resultaatHtml(r)}</b>`;
    }

    const impact = state.rules && state.rules.koersImpact;
    const reactie = impact && aantal
      ? `<br><small>Na deze ${gekozenActie === "buy" ? "aankoop stijgt" : "verkoop daalt"} de koers ongeveer ${Math.round(impact * aantal * 10) / 10}%.</small>`
      : "";

    const werkwoord = gekozenActie === "buy" ? "koopt" : "verkoopt";
    samenvatting.innerHTML = groep
      ? `${esc(groep.name)} ${werkwoord} <b>${aantal}× ${esc(aandeel)}</b> à ${euro(prijs)} = <b>${euro(totaal)}</b>${extra}${reactie}`
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

  function werkBankBij() {
    const groep = gekozen();
    if (!groep) return;
    const r = state.rules || {};
    const bedrag = Math.round(Number($("#bankBedrag").value)) || 0;
    const lening = groep.loan || 0;
    const max = r.maxLening || 0;

    let tekst = `Lening nu: <b>${euro(lening)}</b>`;
    if (max) tekst += ` · nog te lenen: <b>${euro(Math.max(0, max - lening))}</b>`;
    if (r.renteProcent) tekst += `<br><small>Rente: ${r.renteProcent}% van de lening, elke ${r.renteInterval} minuten.</small>`;

    if (bankActie === "lenen") {
      if (!max) tekst = `<span class="fout">Lenen staat uit in de spelinstellingen.</span>`;
      else if (lening + bedrag > max) tekst += `<br><span class="fout">Zoveel kan deze groep niet lenen.</span>`;
    } else {
      if (!lening) tekst += `<br><span class="fout">Deze groep heeft geen lening.</span>`;
      else if (bedrag > lening) tekst += `<br><span class="fout">De lening is maar ${euro(lening)}.</span>`;
      else if (bedrag > groep.cash) tekst += `<br><span class="fout">Te weinig kasgeld (${euro(groep.cash)}).</span>`;
    }
    $("#bankSamenvatting").innerHTML = tekst;
    $("#bankKnop").textContent = bankActie === "lenen" ? `🏦 Leen ${euro(bedrag)}` : `🏦 Los ${euro(bedrag)} af`;
    $("#bankKnop").className = bankActie === "lenen" ? "" : "verkoop";
  }

  function werkAllesBij() {
    if (!state || !post) return;
    werkHandelBij();
    werkBonusBij();
    werkBankBij();
    const open = handelOpen();
    [verwerkKnop, $("#bonusKnop"), $("#bankKnop")].forEach((k) => { k.disabled = !open; });
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
      : `Nog ${vrij} van ${state.supply[post]} te koop`;

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
          ${esc(a)}: <b>${aantal}</b> ${detail}
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

  function verwerkState(nieuw) {
    const vorigeNieuws = state && state.news[0] && state.news[0].at;
    state = nieuw;
    if (state.serverNow) klokVerschil = state.serverNow - Date.now();
    if (state.posts.join("|") !== aandelen.join("|") || !post) {
      aandelen = state.posts;
      werkPostBij();
    }
    // Bestaat de gekozen groep niet meer (verwijderd in de instellingen)? Kies dan de eerste.
    if (!state.groups.some((g) => g.id === gekozenGroep) && state.groups.length) {
      gekozenGroep = state.groups[0].id;
    }
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
    verstuur("/api/trade", { action: gekozenActie, stock: aandeelSelect.value, qty: aantalInput.value }, verwerkKnop, (inhoud) => {
      aantalInput.value = 1;
      if (inhoud.result === null || inhoud.result === undefined) return "✓ Gekocht voor " + euro(inhoud.total) + ".";
      return inhoud.result >= 0
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

  $("#bankKnop").addEventListener("click", () => {
    verstuur("/api/bank", { action: bankActie, amount: $("#bankBedrag").value }, $("#bankKnop"), () =>
      bankActie === "lenen" ? "✓ Geld geleend." : "✓ Lening (deels) afgelost.");
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
