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
  let gekozenGroep = 1;
  let gekozenActie = "buy";

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

    // Keuzelijst opnieuw vullen, met de gekozen waarde zo mogelijk behouden
    const huidig = aandeelSelect.value;
    aandeelSelect.innerHTML = "";
    aandelen.forEach((a) => aandeelSelect.add(new Option(a, a)));
    aandeelSelect.value = vorigePost !== post || !aandelen.includes(huidig) ? post : huidig;
  }

  function naarLogin() {
    location.href = "/login.html?terug=" + encodeURIComponent(location.pathname + location.search);
  }

  function euro(bedrag) {
    return "€ " + Number(bedrag).toLocaleString("nl-NL");
  }

  function esc(tekst) {
    return String(tekst).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  // --- Keuzeknoppen voor groep en actie (groter en sneller dan dropdowns op een telefoon) ---

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
    werkSamenvattingBij();
  });

  document.querySelectorAll("[data-actie]").forEach((knop) => {
    knop.addEventListener("click", () => {
      gekozenActie = knop.dataset.actie;
      document.querySelectorAll("[data-actie]").forEach((k) => {
        k.classList.toggle("actief", k === knop);
      });
      werkSamenvattingBij();
    });
  });

  document.querySelectorAll("[data-stap]").forEach((knop) => {
    knop.addEventListener("click", () => {
      const nieuw = Math.max(1, (Number(aantalInput.value) || 0) + Number(knop.dataset.stap));
      aantalInput.value = nieuw;
      werkSamenvattingBij();
    });
  });

  aandeelSelect.addEventListener("change", werkSamenvattingBij);
  aantalInput.addEventListener("input", werkSamenvattingBij);

  // --- Weergave ---

  function werkSamenvattingBij() {
    if (!state || !post) return;
    const aandeel = aandeelSelect.value;
    const aantal = Math.floor(Number(aantalInput.value)) || 0;
    const prijs = state.prices[aandeel];
    const totaal = prijs * aantal;
    const groep = state.groups.find((g) => g.id === gekozenGroep);

    let waarschuwing = "";
    if (gekozenActie === "buy" && groep && totaal > groep.cash) {
      waarschuwing = ` <span class="fout">— te weinig kasgeld (${euro(groep.cash)})</span>`;
    }
    if (gekozenActie === "sell" && groep && aantal > groep.shares[aandeel]) {
      waarschuwing = ` <span class="fout">— groep heeft er maar ${groep.shares[aandeel]}</span>`;
    }

    const werkwoord = gekozenActie === "buy" ? "koopt" : "verkoopt";
    samenvatting.innerHTML = groep
      ? `${esc(groep.name)} ${werkwoord} <b>${aantal}× ${esc(aandeel)}</b> à ${euro(prijs)} = <b>${euro(totaal)}</b>${waarschuwing}`
      : "";

    verwerkKnop.textContent = gekozenActie === "buy"
      ? `Koop voor ${euro(totaal)}`
      : `Verkoop voor ${euro(totaal)}`;
    verwerkKnop.className = gekozenActie === "buy" ? "" : "verkoop";
  }

  function tekenGroepen() {
    if (!state || !post) return;

    koers.textContent = euro(state.prices[post]);
    const verschil = state.prices[post] - state.previous[post];
    koers.className = verschil < 0 ? "down" : "";

    groepen.innerHTML = state.groups.map((groep) => {
      const waarde = aandelen.reduce((som, a) => som + (groep.shares[a] || 0) * state.prices[a], 0);

      const bezit = aandelen.map((a) => `
        <span class="${a === post ? "hier" : ""}">
          ${esc(a)}: <b>${groep.shares[a] || 0}</b>
        </span>`).join("");

      return `
        <article class="groepkaart ${groep.id === gekozenGroep ? "gekozen" : ""}">
          <h3>${esc(groep.name)}</h3>
          <div class="kas">${euro(groep.cash)}</div>
          <div class="waarde">Totale waarde: ${euro(groep.cash + waarde)}</div>
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
    werkSamenvattingBij();

    // Laat even zien dat er nieuws binnenkwam
    if (vorigeNieuws && state.news[0] && state.news[0].at !== vorigeNieuws) {
      const balk = $("#nieuwsbalk");
      balk.classList.remove("flits");
      void balk.offsetWidth;
      balk.classList.add("flits");
    }
  }

  // --- Transactie versturen ---

  verwerkKnop.addEventListener("click", async () => {
    verwerkKnop.disabled = true;
    melding.textContent = "";

    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group: gekozenGroep,
          action: gekozenActie,
          stock: aandeelSelect.value,
          qty: aantalInput.value,
          station: post
        })
      });
      if (res.status === 401) return naarLogin();
      const inhoud = await res.json();

      if (!res.ok) {
        melding.textContent = inhoud.error || "De transactie kon niet worden verwerkt.";
        melding.className = "melding fout";
        return;
      }

      melding.textContent = "✓ Transactie verwerkt (" + euro(inhoud.total) + ").";
      melding.className = "melding goed";
      aantalInput.value = 1;
      verwerkState(inhoud.state);
    } catch {
      melding.textContent = "De server is niet bereikbaar.";
      melding.className = "melding fout";
    } finally {
      verwerkKnop.disabled = false;
    }
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
    // Is de inlog verlopen? Dan naar de inlogpagina.
    fetch("/api/me").then((r) => { if (r.status === 401) naarLogin(); }).catch(() => {});
  };
  live.onmessage = (event) => verwerkState(JSON.parse(event.data));
})();
