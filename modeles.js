"use strict";

/*
 * Moteur de rendu des 5 modèles PDF, 100 % navigateur.
 *
 *   PdfModeles.render(container, numeroModele, ["19376", ...], { imgBase })
 *
 * Construit les pages dans `container`, règle le format @page du modèle, puis
 * réduit la police (pas de 0,25 pt, entre `base` et `min`) jusqu'à ce que le
 * contenu tienne. Renvoie un rapport par recette :
 *   modèles à feuilles fixes : { id, feuilles: [{ police, deborde }] }
 *   modèles en flux          : { id, police, deborde, hauteurMm, limiteMm }
 *
 * Données : window.RECETTES (site/recettes.js). Tout le texte est inséré en
 * nœuds texte (pas d'innerHTML).
 */
(() => {
  const MM = 96 / 25.4; // px CSS par mm
  const A4_H = 297;
  const A4_W = 210;

  const MODELES = {
    1: { nom: "Classique", format: "A4", page: "A4", marge: 0, type: "feuilles", base: 9.5, min: 7, pages: 1 },
    2: { nom: "Fiche compacte", format: "A4", page: "A4", marge: 14, type: "flux", base: 10, min: 8, pages: 1 },
    3: { nom: "Magazine", format: "A4", page: "A4", marge: 0, type: "feuilles", base: 9.5, min: 7, pages: 1 },
    4: { nom: "Carte recto/verso", format: "A6 paysage", page: "A6 landscape", marge: 0, type: "feuilles", base: 8.5, min: 6, pages: 2, repli: { nutRecto: true } },
    5: { nom: "Mode cuisine", format: "A4", page: "A4", marge: 12, type: "flux", base: 13, min: 11, pages: 2 },
  };

  // ------------------------------------------------------------------
  // Utilitaires
  // ------------------------------------------------------------------

  function el(tag, cls, ...kids) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    for (const kid of kids) if (kid != null && kid !== false) node.append(kid);
    return node;
  }

  const fmtDur = (min) => {
    const h = Math.floor(min / 60), m = min % 60;
    return h ? `${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}` : `${m} min`;
  };

  const stepText = (step) => step.items.join(" ");

  function photo(r, img, cls = "pm-photo-box") {
    const box = el("div", cls);
    if (r.image) {
      const im = el("img", "pm-photo");
      im.src = img + r.image;
      im.alt = "";
      box.append(im);
    }
    return box;
  }

  function ingList(r, style) {
    const ul = el("ul", "pm-ing");
    for (const [name, qty] of r.ingredients) {
      if (style === "row") ul.append(el("li", null, el("span", null, name), el("span", "q", qty)));
      else if (style === "dot") ul.append(el("li", null, name, qty ? el("span", "q", ` · ${qty}`) : null));
      else if (style === "qty") ul.append(el("li", null, qty ? el("b", null, `${qty} `) : null, name));
    }
    return ul;
  }

  // Énergie kJ + kcal fusionnées sur une ligne ; lignes « dont » en retrait.
  function nutRows(r) {
    const rows = [], energy = [];
    for (const [label, value, unit] of r.nutrition || []) {
      if (label === "Énergie") energy.push(`${value} ${unit}`);
      else rows.push([label, `${value} ${unit}`, label.startsWith("dont ")]);
    }
    if (energy.length) rows.unshift(["Énergie", energy.join(" / "), false]);
    return rows;
  }

  // Libellés courts pour les colonnes étroites (carte, encadré magazine).
  const SHORT = {
    "Matières grasses": "Mat. grasses",
    "dont acides gras saturés": "dont saturés",
  };

  function nutTable(r, court = false) {
    const table = el("table", "pm-nut");
    const tbody = el("tbody");
    for (const [label, value, sub] of nutRows(r)) {
      if (court && label === "Énergie") {
        // une valeur par ligne pour ne pas déborder
        for (const v of value.split(" / ")) tbody.append(el("tr", null, el("td", null, label), el("td", null, v)));
        continue;
      }
      tbody.append(el("tr", sub ? "sub" : null, el("td", null, court ? SHORT[label] || label : label), el("td", null, value)));
    }
    table.append(tbody);
    return table;
  }

  function nutLine(r) {
    const parts = [];
    for (const [label, value, sub] of nutRows(r)) {
      if (sub && parts.length) parts[parts.length - 1] += ` (${label} ${value})`;
      else parts.push(label === "Énergie" ? value : `${label} ${value}`);
    }
    return parts.join(" · ");
  }

  // ------------------------------------------------------------------
  // Modèles
  // ------------------------------------------------------------------

  function buildClassique(r, o) {
    const sheet = el("section", "pm-sheet pm-a4 m1");
    if (r.image) sheet.append(photo(r, o.img)); // sans photo : pas de bandeau vide

    const left = el("div", "pm-left", el("h3", null, "Ingrédients"), ingList(r, "row"));
    if (r.cuisine.length) left.append(el("p", "pm-kitchen", el("b", null, "De votre cuisine : "), r.cuisine.join(", ")));
    if (r.nutrition.length) left.append(el("div", "pm-nutbox", el("h3", null, "Nutrition · pour 100 g"), nutTable(r)));

    const steps = el("div", "pm-steps");
    r.etapes.forEach((s, i) => {
      const block = el("div", "pm-step");
      if (s.titre) block.append(el("h4", null, `${i + 1}. ${s.titre}`));
      if (s.items.length) block.append(el("ul", null, ...s.items.map((t) => el("li", null, t))));
      steps.append(block);
    });
    const right = el("div", "pm-right", el("h3", null, "Préparation"), steps);

    sheet.append(el("div", "pm-body pm-fit",
      el("h2", null, r.nom),
      r.duree != null ? el("p", "pm-dur", `⏱ ${fmtDur(r.duree)}`) : null,
      el("div", "pm-cols", left, right)));
    return [sheet];
  }

  function buildCompacte(r) {
    const meta = el("p", "pm-meta");
    if (r.duree != null) meta.append(el("span", null, el("b", null, "Durée "), fmtDur(r.duree)));
    meta.append(el("span", null, el("b", null, "Étapes "), String(r.etapes.length)));
    meta.append(el("span", null, el("b", null, "Ingrédients "),
      r.cuisine.length ? `${r.ingredients.length} + ${r.cuisine.length}` : String(r.ingredients.length)));

    const check = el("ul", "pm-check");
    for (const [name, qty] of r.ingredients) check.append(el("li", null, qty ? `${name} — ${qty}` : name));
    for (const item of r.cuisine) check.append(el("li", null, item));

    const ol = el("ol");
    for (const s of r.etapes) ol.append(el("li", null, s.titre ? el("b", null, `${s.titre}. `) : null, stepText(s)));

    return el("article", "m2-recipe",
      el("h2", null, r.nom), meta,
      el("h3", null, "Ingrédients"), check,
      el("h3", null, "Préparation"), ol,
      r.nutrition.length ? el("p", "pm-nutline", el("b", null, "Pour 100 g : "), nutLine(r)) : null);
  }

  function buildMagazine(r, o) {
    const sheet = el("section", "pm-sheet pm-a4 m3");
    const info = [r.duree != null ? `⏱ ${fmtDur(r.duree)}` : null,
      `${r.etapes.length} étape${r.etapes.length > 1 ? "s" : ""}`].filter(Boolean).join(" · ");
    sheet.append(el("div", "pm-hero", photo(r, o.img),
      el("div", "pm-title", el("p", "pm-dur", info), el("h2", null, r.nom))));

    const steps = el("ol", "pm-steps");
    for (const s of r.etapes) steps.append(el("li", null, s.titre ? el("h4", null, s.titre) : null, el("p", null, stepText(s))));

    const aside = el("aside", null, el("h3", null, "Ingrédients"), ingList(r, "dot"));
    aside.append(el("p", "pm-kitchen", r.cuisine.length ? `+ ${r.cuisine.join(", ")}` : ""));
    if (r.nutrition.length) aside.append(el("h3", null, "Pour 100 g"), nutTable(r, true));

    sheet.append(el("div", "pm-body pm-fit", steps, aside));
    return [sheet];
  }

  // o.nutRecto (repli) : nutrition en une ligne au recto, étapes sur toute la
  // largeur du verso.
  function buildCarte(r, o) {
    const nutOnRecto = o.nutRecto && r.nutrition.length;
    const recto = el("section", "pm-sheet pm-a6l m4 pm-recto");
    recto.append(photo(r, o.img), el("div", "pm-r pm-fit",
      el("h2", null, r.nom),
      r.duree != null ? el("span", "pm-pill", `⏱ ${fmtDur(r.duree)}`) : null,
      ingList(r, "row"),
      r.cuisine.length ? el("p", "pm-kitchen", `+ ${r.cuisine.join(", ")}`) : null,
      nutOnRecto ? el("p", "pm-nutline", el("b", null, "Pour 100 g : "), nutLine(r)) : null));

    const verso = el("section", "pm-sheet pm-a6l m4 pm-verso");
    const steps = el("div", "pm-v-steps pm-fit");
    r.etapes.forEach((s, i) => {
      steps.append(el("h4", null, s.titre ? `${i + 1} · ${s.titre}` : `${i + 1}`), el("p", null, stepText(s)));
    });
    verso.append(steps);
    if (r.nutrition.length && !nutOnRecto) verso.append(el("div", "pm-v-nut pm-fit", el("h4", null, "Pour 100 g"), nutTable(r, true)));
    return [recto, verso];
  }

  function buildCuisine(r, o) {
    const ing = ingList(r, "qty");
    for (const item of r.cuisine) ing.append(el("li", null, item));

    const block = el("article", "m5-recipe",
      el("div", "pm-head", photo(r, o.img),
        el("div", null, el("h2", null, r.nom),
          r.duree != null ? el("p", "pm-dur", `⏱ ${fmtDur(r.duree)}`) : null)),
      ing);
    r.etapes.forEach((s, i) => {
      const box = el("div", "pm-box");
      box.dataset.n = String(i + 1);
      if (s.titre) box.append(el("h4", null, s.titre));
      if (s.items.length) box.append(el("ul", null, ...s.items.map((t) => el("li", null, t))));
      block.append(box);
    });
    if (r.nutrition.length) block.append(el("div", "pm-nutbox", el("h3", null, "Valeurs nutritionnelles · pour 100 g"), nutTable(r)));
    return block;
  }

  const BUILDERS = { 1: buildClassique, 2: buildCompacte, 3: buildMagazine, 4: buildCarte, 5: buildCuisine };

  // ------------------------------------------------------------------
  // Ajustement de la police
  // ------------------------------------------------------------------

  function fitFont(node, base, min, overflows) {
    let size = base;
    node.style.fontSize = `${size}pt`;
    while (overflows(node) && size - 0.25 >= min - 1e-9) {
      size -= 0.25;
      node.style.fontSize = `${size}pt`;
    }
    return { police: size, deborde: overflows(node) };
  }

  const sheetOverflows = (sheet) =>
    [...sheet.querySelectorAll(".pm-fit")].some((e) => e.scrollHeight > e.clientHeight + 1);

  function setPageStyle(m) {
    let style = document.getElementById("pm-page-style");
    if (!style) {
      style = el("style");
      style.id = "pm-page-style";
      document.head.append(style);
    }
    style.textContent = `@page { size: ${m.page}; margin: ${m.marge}mm; }`;
  }

  // ------------------------------------------------------------------
  // API
  // ------------------------------------------------------------------

  function render(container, numero, ids, opts = {}) {
    const m = MODELES[numero];
    if (!m) throw new Error(`Modèle inconnu : ${numero}`);
    const o = { img: opts.imgBase ?? "../site/" };
    const byId = new Map((window.RECETTES || []).map((r) => [r.id, r]));
    const recipes = ids.map((id) => byId.get(String(id))).filter(Boolean);

    setPageStyle(m);
    container.replaceChildren();
    container.className = "pm-root pm-out";
    const rapport = [];

    if (m.type === "feuilles") {
      for (const r of recipes) {
        let sheets = BUILDERS[numero](r, o);
        container.append(...sheets);
        let feuilles = sheets.map((s) => fitFont(s, m.base, m.min, sheetOverflows));
        let repli = false;
        // Mise en page de repli si le contenu déborde même à la police minimale
        if (m.repli && feuilles.some((f) => f.deborde)) {
          sheets.forEach((s) => s.remove());
          sheets = BUILDERS[numero](r, { ...o, ...m.repli });
          container.append(...sheets);
          feuilles = sheets.map((s) => fitFont(s, m.base, m.min, sheetOverflows));
          repli = true;
        }
        rapport.push({ id: r.id, feuilles, repli });
      }
      return rapport;
    }

    // Flux : la page est gérée par le navigateur ; on vise au plus m.pages
    // pages par recette, avec une marge de sécurité pour les sauts de page
    // (blocs insécables) quand plusieurs pages sont autorisées.
    const usable = A4_H - 2 * m.marge;
    const limit = usable * m.pages - (m.pages > 1 ? 25 : 2);
    const paper = el("div", "pm-paper");
    paper.style.setProperty("--marge", `${m.marge}mm`);
    const doc = el("div", `pm-flowdoc m${numero}`);
    doc.style.width = `${A4_W - 2 * m.marge}mm`;
    doc.style.setProperty("--page-h", `${usable}mm`);
    paper.append(doc);
    container.append(paper);

    for (const r of recipes) {
      const block = BUILDERS[numero](r, o);
      doc.append(block);
      const height = () => block.getBoundingClientRect().height / MM;
      const res = fitFont(block, m.base, m.min, () => height() > limit);
      rapport.push({ id: r.id, ...res, hauteurMm: Math.round(height()), limiteMm: limit });
    }
    return rapport;
  }

  window.PdfModeles = { MODELES, render };
})();
