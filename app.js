"use strict";

/*
 * Deux modes d'affichage :
 *  - navigation : grille de toutes les recettes, recherche, sélection et
 *    création d'un lien de partage ;
 *  - partage    : ?recettes=22046,22114 (ou ?recette=22046) n'affiche que
 *    les recettes demandées, en entier.
 * Les données viennent de recettes.js (window.RECETTES), généré par
 * build_site.py. Tout le contenu est inséré via textContent (pas d'innerHTML).
 */
(() => {
  const RECIPES = Array.isArray(window.RECETTES) ? window.RECETTES : [];
  const byId = new Map(RECIPES.map((r) => [r.id, r]));
  const $ = (id) => document.getElementById(id);

  const selection = new Set();
  const cards = new Map(); // id -> { li, cb, haystack }
  let current = null;      // recette affichée dans la fenêtre de détail

  // ------------------------------------------------------------------
  // Utilitaires
  // ------------------------------------------------------------------

  const normalize = (s) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("aria-") || key.startsWith("data-")) node.setAttribute(key, value);
      else node[key] = value;
    }
    for (const child of children) if (child != null) node.append(child);
    return node;
  }

  const baseUrl = () => location.href.split(/[?#]/)[0];
  const buildLink = (ids) => `${baseUrl()}?recettes=${ids.join(",")}`;

  // ------------------------------------------------------------------
  // Fiche recette complète (détail et mode partage)
  // ------------------------------------------------------------------

  const formatDuration = (min) => {
    if (min == null) return "";
    const h = Math.floor(min / 60), m = min % 60;
    return h ? `${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}` : `${m} min`;
  };

  const durationBadge = (r, cls) =>
    r.duree == null ? null
      : el("span", { class: `duration ${cls}` },
          el("span", { "aria-hidden": "true", text: "⏱ " }),
          el("span", { class: "sr-only", text: "Durée : " }),
          formatDuration(r.duree));

  function nutritionTable(rows) {
    const tbody = el("tbody");
    for (const [label, value, unit] of rows) {
      const sub = label.startsWith("dont ");
      tbody.append(el("tr", sub ? { class: "sub" } : {},
        el("th", { scope: "row", text: label }),
        el("td", { text: `${value} ${unit}` })));
    }
    return el("section", { class: "nutrition" },
      el("h3", { text: "Valeurs nutritionnelles" }),
      el("table", {},
        el("caption", { text: "Pour 100 g" }),
        el("thead", {}, el("tr", {},
          el("th", { scope: "col", text: "Nutriment" }),
          el("th", { scope: "col", text: "Valeur" }))),
        tbody));
  }

  function recipeArticle(r, headingId) {
    const body = el("div", { class: "recipe-body" },
      el("h2", { id: headingId, text: r.nom }));
    const badge = durationBadge(r, "duration-detail");
    if (badge) body.append(el("p", { class: "recipe-meta" }, badge));

    if (r.ingredients.length || r.cuisine.length) {
      const section = el("section", { class: "ingredients" }, el("h3", { text: "Ingrédients" }));
      if (r.ingredients.length) {
        const ul = el("ul");
        for (const [name, qty] of r.ingredients) {
          ul.append(el("li", {}, el("span", { text: name }), el("span", { class: "qty", text: qty })));
        }
        section.append(ul);
      }
      if (r.cuisine.length) {
        section.append(
          el("h4", { text: "De votre cuisine" }),
          el("p", { class: "kitchen", text: r.cuisine.join(", ") }));
      }
      body.append(section);
    }

    if (r.etapes.length) {
      const ol = el("ol", { class: "steps" });
      for (const step of r.etapes) {
        const li = el("li");
        if (step.titre) li.append(el("h4", { text: step.titre }));
        if (step.items.length) {
          const ul = el("ul");
          for (const item of step.items) ul.append(el("li", { text: item }));
          li.append(ul);
        }
        ol.append(li);
      }
      body.append(el("section", { class: "preparation" }, el("h3", { text: "Préparation" }), ol));
    }

    if (r.nutrition && r.nutrition.length) body.append(nutritionTable(r.nutrition));

    const article = el("article", { class: "recipe", "aria-labelledby": headingId });
    if (r.image) article.append(el("img", { class: "recipe-img", src: r.image, alt: "", decoding: "async" }));
    article.append(body);
    return article;
  }

  // ------------------------------------------------------------------
  // Mode navigation
  // ------------------------------------------------------------------

  function renderGrid() {
    const frag = document.createDocumentFragment();
    for (const r of RECIPES) {
      const cb = el("input", { type: "checkbox" });
      cb.addEventListener("change", () => setSelected(r.id, cb.checked));

      const open = el("button", { class: "card-open", type: "button", "aria-haspopup": "dialog" },
        r.image ? el("img", { src: r.image, alt: "", loading: "lazy", decoding: "async" })
                : el("span", { class: "no-img", "aria-hidden": "true" }),
        el("span", { class: "card-title", text: r.nom }));
      open.addEventListener("click", () => openDetail(r));

      const badge = durationBadge(r, "duration-card");
      if (badge) open.append(badge);

      const li = el("li", { class: "card" }, open,
        el("label", { class: "card-check", title: "Sélectionner" }, cb,
          el("span", { class: "sr-only", text: `Sélectionner « ${r.nom} »` })));

      const words = [r.nom, ...r.ingredients.map((i) => i[0]), ...r.cuisine].join(" ");
      cards.set(r.id, { li, cb, haystack: normalize(words), duree: r.duree });
      frag.append(li);
    }
    $("grid").append(frag);
    applyFilters();
  }

  // Curseur de durée : bornes déduites des données, pas de 5 min.
  // En position maximale, aucune limite (les recettes sans durée restent visibles).
  const DURATIONS = RECIPES.map((r) => r.duree).filter((d) => d != null);
  const DUR_MIN = DURATIONS.length ? Math.min(...DURATIONS) : 0;
  const DUR_MAX = DURATIONS.length ? Math.max(...DURATIONS) : 0;

  function maxDuration() {
    const v = Number($("duration").value);
    return v >= DUR_MAX ? Infinity : v;
  }

  function applyFilters() {
    const terms = normalize($("search").value.trim()).split(/\s+/).filter(Boolean);
    const limit = maxDuration();
    let shown = 0;
    for (const { li, haystack, duree } of cards.values()) {
      const okDuration = limit === Infinity || (duree != null && duree <= limit);
      const match = okDuration && terms.every((t) => haystack.includes(t));
      li.hidden = !match;
      if (match) shown++;
    }
    const label = limit === Infinity ? "Toutes durées" : `≤ ${formatDuration(limit)}`;
    $("duration-value").textContent = label;
    $("duration").setAttribute("aria-valuetext", label);
    $("count").textContent = terms.length || limit !== Infinity
      ? `${shown} / ${plural(RECIPES.length, "recette", "recettes")}`
      : plural(RECIPES.length, "recette", "recettes");
  }

  function initDurationFilter() {
    const input = $("duration");
    if (!DURATIONS.length || DUR_MIN === DUR_MAX) {
      $("duration-filter").hidden = true;
      return;
    }
    input.min = DUR_MIN;
    input.max = DUR_MAX;
    input.step = 5;
    input.value = DUR_MAX;
    input.addEventListener("input", applyFilters);
  }

  function setSelected(id, on) {
    if (on) selection.add(id);
    else selection.delete(id);
    const card = cards.get(id);
    if (card) {
      card.cb.checked = on;
      card.li.classList.toggle("selected", on);
    }
    if (current && current.id === id) syncDetailButton();
    updateBar();
  }

  function updateBar() {
    const ids = [...selection];
    $("selection-bar").hidden = ids.length === 0;
    document.body.classList.toggle("has-selection", ids.length > 0);
    $("sel-count").textContent = plural(ids.length, "recette sélectionnée", "recettes sélectionnées");
    const link = ids.length ? buildLink(ids) : "";
    $("share-link").value = link;
    $("btn-open").href = link || "./";
    $("copy-status").textContent = "";
  }

  async function copyLink() {
    const input = $("share-link");
    try {
      await navigator.clipboard.writeText(input.value);
      $("copy-status").textContent = "Lien copié ✓";
    } catch {
      input.focus();
      input.select();
      $("copy-status").textContent = "Copiez le lien sélectionné (Ctrl+C)";
    }
  }

  async function shareLink() {
    const names = [...selection].map((id) => byId.get(id).nom);
    try {
      await navigator.share({ title: names.join(" · "), url: $("share-link").value });
    } catch {
      /* partage annulé */
    }
  }

  // Fenêtre de détail
  function openDetail(r) {
    current = r;
    $("detail-content").replaceChildren(recipeArticle(r, "detail-title"));
    syncDetailButton();
    $("detail").showModal();
    $("detail").scrollTop = 0;
  }

  function syncDetailButton() {
    const on = selection.has(current.id);
    const btn = $("detail-select");
    btn.textContent = on ? "✓ Sélectionnée" : "Ajouter à la sélection";
    btn.setAttribute("aria-pressed", String(on));
    btn.classList.toggle("primary", on);
  }

  function initBrowse() {
    initDurationFilter();
    renderGrid();
    $("search").addEventListener("input", applyFilters);
    $("btn-copy").addEventListener("click", copyLink);
    $("btn-clear").addEventListener("click", () => [...selection].forEach((id) => setSelected(id, false)));
    if (navigator.share) {
      $("btn-share").hidden = false;
      $("btn-share").addEventListener("click", shareLink);
    }

    const dialog = $("detail");
    $("detail-close").addEventListener("click", () => dialog.close());
    $("detail-select").addEventListener("click", () => setSelected(current.id, !selection.has(current.id)));
    // clic sur le fond assombri -> fermeture
    dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener("close", () => { current = null; });
  }

  // ------------------------------------------------------------------
  // Mode partage
  // ------------------------------------------------------------------

  function sharedIds() {
    const params = new URLSearchParams(location.search);
    const raw = params.get("recettes") ?? params.get("recette");
    if (raw == null || !raw.trim()) return null;
    return [...new Set(raw.split(/[\s,;]+/).filter(Boolean))];
  }

  function renderShared(ids) {
    const found = ids.map((id) => byId.get(id)).filter(Boolean);
    const missing = ids.length - found.length;

    $("browse-tools").hidden = true;
    $("grid").hidden = true;
    $("count").hidden = true;
    $("shared-banner").hidden = false;
    document.body.classList.add("shared");

    let text = found.length
      ? plural(found.length, "recette partagée", "recettes partagées")
      : "Aucune recette ne correspond à ce lien.";
    if (missing && found.length) text += ` (${plural(missing, "introuvable", "introuvables")})`;
    $("shared-text").textContent = text;

    if (found.length > 1) {
      const ul = el("ul");
      for (const r of found) ul.append(el("li", {}, el("a", { href: `#r-${r.id}`, text: r.nom })));
      $("shared-toc").append(ul);
      $("shared-toc").hidden = false;
    }

    const list = $("shared-list");
    for (const r of found) {
      const article = recipeArticle(r, `r-${r.id}`);
      article.id = `recette-${r.id}`;
      list.append(article);
    }
    list.hidden = false;
    if (found.length) document.title = `${found.map((r) => r.nom).join(" · ")} – Recettes`;
  }

  // ------------------------------------------------------------------

  if (!RECIPES.length) {
    $("count").textContent = "Aucune recette disponible (recettes.js manquant ?).";
    return;
  }
  const ids = sharedIds();
  if (ids) renderShared(ids);
  else initBrowse();
})();
