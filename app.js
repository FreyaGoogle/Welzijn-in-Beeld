/* ============================================================
   Welzijn in Beeld – Domus Valuas
   Alles draait lokaal in de browser.
   Geen opslag, geen server, geen tracking.
   ============================================================ */

/* ========================= 1) CONFIG ========================= */
const CONFIG = {
  locationFieldCandidates:  ["Locatie", "Location", "locatie", "location", "Naam", "name"],
  transitieFieldCandidates: ["Transitie", "transitie"],
  regioFieldCandidates:     ["Regio", "regio", "Region", "region", "Gebied", "gebied"],
  eindscoreFieldCandidates: ["Eindscore", "eindscore", "Eindcijfer", "eindcijfer", "FinalScore", "Score"],
  themePrefix: ["T01","T02","T03","T04","T05","T06","T07","T08","T09","T10"],
  decimals: 1,
  phaseThresholds: [
    { phase: 1, maxExclusive: 6.0 },
    { phase: 2, maxExclusive: 7.0 },
    { phase: 3, maxExclusive: 8.0 },
    { phase: 4, maxExclusive: Infinity }
  ],
  boundingRules: [
    { id: "missing_theme",     label: "Onvolledige thema-invoer",          check: (r) => r.themes.some(v => v !== null) && r.themes.some(v => v === null), capTo: 6.9 },
    { id: "very_low_theme",    label: "1 of meer thema's < 4,0",           check: (r) => r.themes.some(v => v !== null && v < 4.0), capTo: 6.9 },
    { id: "transitie_soft_cap",label: "Transitie = ja (zachte cap)",       check: (r) => r.transitie === "ja", capTo: null }
  ]
};

/* ========================= 2) CONSTANTEN ========================= */
const PHASE_LABELS = {
  1: "Fase 1 – Het Fundament",
  2: "Fase 2 – De Opbouw",
  3: "Fase 3 – De Verfijning",
  4: "Fase 4 – Inspiratie & Flow"
};

const TOTAAL_PHASE_INFO = {
  4: { title: "Fase 4: Inspiratie (≥ 8,0)", desc: "Welzijn en zorg zijn volledig versmolten in een natuurlijke, huiselijke flow.", color: "#C8951A" },
  3: { title: "Fase 3: Verfijning (7,0 – 7,9)", desc: "Sterke basis met focus op persoonlijke details en high-end hospitality.", color: "#1A7E7A" },
  2: { title: "Fase 2: De Structuur (6,0 – 6,9)", desc: "Focus op het creëren van rust, prikkelregie en een voorspelbare dagstructuur.", color: "#3A4E96" },
  1: { title: "Fase 1: Het Fundament (< 6,0)", desc: "Aandacht voor basisveiligheid, vertrouwen en dagelijkse stabiliteit.", color: "#4A7040" }
};

const THEME_INTERVENTIONS = [
  "Versterk het thuisgevoel via persoonlijke decoratie, vaste plekken en vertrouwde dagelijkse routines.",
  "Centraliseer welzijn door welzijnsgesprekken structureel in te bedden in dagelijkse zorgmomenten.",
  "Verbeter samenwerking door gestructureerde teamoverleggen en gedeelde verantwoordelijkheid te stimuleren.",
  "Stimuleer respect en reablement door individuele doelstellingen zichtbaar te bewaken en te vieren.",
  "Verhoog hospitaliteit via gastvrijheidstrainingen en bewuste aandacht voor de eerste indruk bij binnenkomst.",
  "Optimaliseer de prikkelbalans door omgevingsaanpassingen, gerichte zonwering en bewuste dagstructuur.",
  "Beheer reëel risico door transparante communicatie met bewoners en gebalanceerde risicobeoordeling.",
  "Implementeer belevingsgerichte werkvormen met vaste openings- en afsluitrituelen voor rust en verbinding.",
  "Verdiep culturele identiteit door cultuureigen activiteiten en persoonsgericht diversiteitsbeleid te verankeren.",
  "Optimaliseer omgevingsondersteuning via ergonomische aanpassingen, logische routing en toegankelijkheid."
];

/* ========================= 3) STATE ========================= */
const state = {
  rows: [],
  filtered: [],
  selectedIndex: null,
  regioField: null,
  charts: { phaseChart: null, themeAvgChart: null, regioChart: null, radarChart: null, regioRadars: [] }
};

/* ========================= 4) DOM-HELPERS ========================= */
const el = (id) => document.getElementById(id);

function setText(id, value) {
  const node = el(id);
  if (node) node.textContent = value;
}

function showError(msg) {
  const box = el("ingestErrors");
  if (!box) return;
  if (!msg) { box.style.display = "none"; box.textContent = ""; return; }
  box.style.display = "block";
  box.textContent = msg;
}

function round1(x) {
  const p = Math.pow(10, CONFIG.decimals);
  return Math.round(x * p) / p;
}

function fmt(x) {
  if (x === null || isNaN(x)) return "–";
  return round1(x).toFixed(CONFIG.decimals).replace(".", ",");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

/* ========================= 5) SCORE-HELPERS ========================= */
function scoreLabel(score) {
  if (score === null || isNaN(score)) return { label:"N/B",    cls:"lbl-na",       bar:"bar-na" };
  if (score < 5.0)  return { label:"Kritiek",   cls:"lbl-critical",  bar:"bar-critical" };
  if (score < 6.0)  return { label:"Aandacht",  cls:"lbl-attention", bar:"bar-attention" };
  if (score < 7.0)  return { label:"Stabiel",   cls:"lbl-stable",    bar:"bar-stable" };
  if (score < 8.0)  return { label:"Sterk",     cls:"lbl-strong",    bar:"bar-strong" };
  if (score < 9.0)  return { label:"Zeer sterk",cls:"lbl-vstrong",   bar:"bar-vstrong" };
  return              { label:"Uitstekend", cls:"lbl-excellent", bar:"bar-excellent" };
}

function getThemeName(themeField, i) {
  if (!themeField) return `Thema ${i + 1}`;
  return themeField.replace(/^T\d{2}[_\s-]*/i, "").replace(/_/g, " ") || themeField;
}

function buildGaugeSvg(score) {
  const r = 44, cx = 60, cy = 60;
  const circ = 2 * Math.PI * r;
  const arcLen = circ * 0.75;                   // 270° arc
  const gapLen = circ - arcLen;
  const pct = score === null ? 0 : Math.min(Math.max(score / 10, 0), 1);
  const fill = arcLen * pct;

  let color = "#4393FF";
  if (score !== null) {
    if (score < 5)  color = "#C0392B";
    else if (score < 6) color = "#C07A30";
    else if (score < 7) color = "#7AACAA";
    else if (score < 8) color = "#4393FF";
    else color = "#1A7E7A";
  }

  const display = score !== null ? score.toFixed(1).replace(".", ",") : "–";
  return `<svg viewBox="0 0 120 120" class="gauge-svg">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#E8EBF2" stroke-width="10"
      stroke-dasharray="${arcLen.toFixed(1)} ${gapLen.toFixed(1)}"
      transform="rotate(135 ${cx} ${cy})" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="10"
      stroke-dasharray="${fill.toFixed(1)} ${(circ - fill).toFixed(1)}"
      transform="rotate(135 ${cx} ${cy})" stroke-linecap="round"
      class="gauge-fill-circle"/>
    <text x="${cx}" y="${cy + 8}" text-anchor="middle"
      font-size="26" font-weight="700" fill="#1E2745"
      font-family="DM Sans, system-ui, sans-serif">${display}</text>
  </svg>`;
}

/* ========================= 6) CSV INLEZEN ========================= */
function detectField(headers, candidates) {
  const lower = headers.map(h => String(h).trim().toLowerCase());
  for (const c of candidates) {
    const idx = lower.indexOf(String(c).trim().toLowerCase());
    if (idx >= 0) return headers[idx];
  }
  return null;
}

function detectThemeFields(headers) {
  return CONFIG.themePrefix.map(prefix =>
    headers.find(h => String(h).trim().toUpperCase().startsWith(prefix)) || null
  );
}

function normalizeYesNo(v) {
  if (!v) return "";
  const s = String(v).trim().toLowerCase();
  if (["ja","yes","y","true"].includes(s)) return "ja";
  if (["nee","no","n","false"].includes(s)) return "nee";
  return s;
}

function parseNL(v) {
  if (v === null || v === undefined) return null;
  const raw = String(v).trim();
  if (!raw) return null;
  const num = Number(raw.replace(",", "."));
  return Number.isFinite(num) ? num : null;
}

function computeBase(themes) {
  const valid = themes.filter(v => v !== null);
  if (!valid.length) return null;
  // Gewogen formule: T01, T03, T04, T08 tellen dubbel (deler = 14)
  // Formule: ((T01+T03+T04+T08)*2 + T02+T05+T06+T07+T09+T10) / 14
  if (valid.length === 10) {
    const [t1,t2,t3,t4,t5,t6,t7,t8,t9,t10] = themes;
    return ((t1+t3+t4+t8)*2 + t2+t5+t6+t7+t9+t10) / 14;
  }
  // Fallback bij ontbrekende thema's: gewoon gemiddelde
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function applyBounding(row) {
  let cap = null;
  const reasons = [];
  for (const rule of CONFIG.boundingRules) {
    if (!rule.capTo && rule.capTo !== 0) continue;
    try {
      if (rule.check(row)) { reasons.push(rule.label); cap = cap === null ? rule.capTo : Math.min(cap, rule.capTo); }
    } catch { /* ignore */ }
  }
  if (cap === null) return { finalScore: row.baseScore, bounded: false, cap: null, reasons: [] };
  if (row.baseScore === null) return { finalScore: null, bounded: true, cap, reasons };
  return { finalScore: Math.min(row.baseScore, cap), bounded: row.baseScore > cap, cap, reasons };
}

function phaseFor(score) {
  if (score === null) return null;
  for (const t of CONFIG.phaseThresholds) { if (score < t.maxExclusive) return t.phase; }
  return 4;
}

function ingestCsvText(text) {
  showError("");
  Papa.parse(text, {
    header: true, skipEmptyLines: true,
    complete: (result) => {
      const data = result.data || [];
      const fields = (result.meta && result.meta.fields) || [];
      if (!fields.length) { showError("Geen headers gevonden in CSV."); return; }

      const locField        = detectField(fields, CONFIG.locationFieldCandidates);
      const transField      = detectField(fields, CONFIG.transitieFieldCandidates);
      const regioField      = detectField(fields, CONFIG.regioFieldCandidates);
      const eindscoreField  = detectField(fields, CONFIG.eindscoreFieldCandidates);
      const themeFields     = detectThemeFields(fields);

      if (!locField) { showError("Kolom voor locatie ontbreekt. Gebruik 'Locatie'."); return; }
      const missing = themeFields.map((f,i) => f ? null : CONFIG.themePrefix[i]).filter(Boolean);
      if (missing.length) { showError(`Thema-kolommen ontbreken: ${missing.join(", ")}.`); return; }

      state.regioField = regioField;

      const rows = data.map((r, idx) => {
        const location      = String(r[locField] ?? "").trim();
        const transitie     = normalizeYesNo(transField ? r[transField] : "");
        const regio         = regioField ? String(r[regioField] ?? "").trim() : "";
        const themes        = themeFields.map(f => parseNL(r[f]));
        const baseScore     = computeBase(themes);
        const manualScore   = eindscoreField ? parseNL(r[eindscoreField]) : null;
        const row = {
          id: idx, location, transitie, regio, themes, themeFields,
          baseScore: baseScore === null ? null : round1(baseScore),
          finalScore: null, bounded: false, boundCap: null, boundReasons: [],
          phase: null, manualScore: manualScore !== null
        };
        if (manualScore !== null) {
          row.finalScore = round1(manualScore);
        } else {
          const b = applyBounding(row);
          row.finalScore   = b.finalScore === null ? null : round1(b.finalScore);
          row.bounded      = b.bounded;
          row.boundCap     = b.cap;
          row.boundReasons = b.reasons;
        }
        row.phase = phaseFor(row.finalScore);
        return row;
      }).filter(r => r.location.length > 0);

      state.rows = rows;
      state.selectedIndex = null;
      setText("ingestStatus", `Ingelezen: ${rows.length} locatie${rows.length !== 1 ? "s" : ""}.`);
      applyFiltersAndRender();
    },
    error: () => showError("CSV kon niet worden ingelezen.")
  });
}

/* ========================= 7) FILTERS + RENDER ========================= */
function applyFiltersAndRender() {
  // Regio filter visibility + populate
  const regioWrap = el("filterRegioWrap");
  const regioSelect = el("filterRegio");
  const hasRegio = state.rows.some(r => r.regio);
  if (regioWrap) regioWrap.style.display = hasRegio ? "" : "none";
  if (hasRegio && regioSelect) {
    const regios = [...new Set(state.rows.map(r => r.regio).filter(Boolean))].sort();
    const cur = regioSelect.value;
    regioSelect.innerHTML = '<option value="all">Alle regio\'s</option>' +
      regios.map(r => `<option value="${escapeHtml(r)}"${cur === r ? " selected" : ""}>${escapeHtml(r)}</option>`).join("");
  }

  const faseF   = el("filterFase")?.value ?? "all";
  const regioF  = regioSelect?.value ?? "all";
  const search  = (el("filterSearch")?.value ?? "").trim().toLowerCase();

  let filtered = [...state.rows];
  if (faseF !== "all") { const f = Number(faseF); filtered = filtered.filter(r => r.phase === f); }
  if (regioF !== "all") filtered = filtered.filter(r => r.regio === regioF);
  if (search) filtered = filtered.filter(r => r.location.toLowerCase().includes(search));

  state.filtered = filtered;

  renderKpis();
  renderTotaaloverzicht();
  renderPhaseChart();
  renderThemeAvgChart();
  renderVergelijk();
  renderRegioChart();
  renderRegioRadars();
  renderHeatmap();
  renderDetail(null);
  renderLocationReport(null);
}

/* ========================= 8) KPI RENDER ========================= */
function renderKpis() {
  const total   = state.rows.length;
  const valid   = state.rows.filter(r => r.finalScore !== null).length;
  const bounded = state.rows.filter(r => r.boundReasons.length > 0).length;
  const vals    = state.rows.map(r => r.finalScore).filter(v => v !== null);
  const avg     = vals.length ? vals.reduce((a,b) => a+b, 0) / vals.length : null;
  const pc      = [1,2,3,4].map(p => state.rows.filter(r => r.phase === p).length);

  setText("kpiValid",  String(valid));
  setText("kpiTotal",  `Totaal ingelezen: ${total}`);
  setText("kpiAvg",    avg !== null ? fmt(avg) : "–");
  setText("kpiBounded",String(bounded));
  setText("kpiPhases", total ? `${pc[0]} · ${pc[1]} · ${pc[2]} · ${pc[3]}` : "–");
}

/* ========================= 9) CHARTS ========================= */
function destroyChart(c) { try { if (c) c.destroy(); } catch { /* */ } }

const DV_COLORS = {
  fase: ["#4A7040","#3A4E96","#1A7E7A","#C8951A"],
  blue: "#4393FF",
  sand: "#D0BB91",
  navy: "#1E2745"
};

function renderPhaseChart() {
  const ctx = el("phaseChart"); if (!ctx) return;
  const counts = [1,2,3,4].map(p => state.filtered.filter(r => r.phase === p).length);
  destroyChart(state.charts.phaseChart);
  state.charts.phaseChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Fase 1","Fase 2","Fase 3","Fase 4"],
      datasets: [{ data: counts, backgroundColor: DV_COLORS.fase, borderRadius: 6 }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "rgba(30,39,69,0.06)" } },
                x: { grid: { display: false } } }
    }
  });
}

function renderThemeAvgChart() {
  const ctx = el("themeAvgChart"); if (!ctx) return;
  const means = CONFIG.themePrefix.map((_, i) => {
    const vals = state.filtered.map(r => r.themes[i]).filter(v => v !== null);
    return vals.length ? round1(vals.reduce((a,b) => a+b,0) / vals.length) : 0;
  });
  destroyChart(state.charts.themeAvgChart);
  state.charts.themeAvgChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: CONFIG.themePrefix,
      datasets: [{ data: means, backgroundColor: DV_COLORS.blue, borderRadius: 6 }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, suggestedMax: 10, grid: { color: "rgba(30,39,69,0.06)" } },
                x: { grid: { display: false } } }
    }
  });
}

function populateVergelijkSelects() {
  const selA = el("vergelijkA");
  const selB = el("vergelijkB");
  if (!selA || !selB) return;

  const valA = selA.value, valB = selB.value;
  const opts = state.filtered
    .filter(r => r.finalScore !== null)
    .sort((a, b) => a.location.localeCompare(b.location, "nl"))
    .map(r => `<option value="${r.id}">${escapeHtml(r.location)}</option>`)
    .join("");

  selA.innerHTML = `<option value="">Kies locatie A…</option>${opts}`;
  selB.innerHTML = `<option value="">Kies locatie B…</option>${opts}`;
  selA.value = valA; selB.value = valB;
}

function renderVergelijk() {
  const card   = el("vergelijkCard");
  const result = el("vergelijkResult");
  if (!card || !result) return;

  const hasData = state.filtered.some(r => r.finalScore !== null);
  if (!hasData) { card.style.display = "none"; return; }
  card.style.display = "";

  populateVergelijkSelects();

  const idA = el("vergelijkA")?.value;
  const idB = el("vergelijkB")?.value;

  if (!idA || !idB || idA === idB) {
    result.innerHTML = `<p class="muted vergelijk-hint">Selecteer twee verschillende locaties om de vergelijking te zien.</p>`;
    return;
  }

  const rowA = state.filtered.find(r => String(r.id) === idA);
  const rowB = state.filtered.find(r => String(r.id) === idB);
  if (!rowA || !rowB) { result.innerHTML = ""; return; }

  const diff = rowA.finalScore - rowB.finalScore;
  const diffStr = (diff > 0 ? "+" : "") + diff.toFixed(1).replace(".", ",");
  const winner = diff > 0 ? rowA.location : diff < 0 ? rowB.location : null;

  const rows = CONFIG.themePrefix.map((lbl, i) => {
    const a = rowA.themes[i], b = rowB.themes[i];
    if (a === null && b === null) return null;
    const d = (a ?? 0) - (b ?? 0);
    return { lbl, a, b, d };
  }).filter(Boolean);

  // Sorteer op absolute delta, grootste verschil eerst
  rows.sort((x, y) => Math.abs(y.d) - Math.abs(x.d));

  const maxVal = 10;

  result.innerHTML = `
    <div class="verg-summary">
      <div class="verg-loc verg-a"><span class="verg-dot dot-a"></span>${escapeHtml(rowA.location)}<strong>${fmt(rowA.finalScore)}</strong></div>
      <div class="verg-diff ${diff > 0 ? "diff-pos" : diff < 0 ? "diff-neg" : "diff-tie"}">${winner ? diffStr : "="}</div>
      <div class="verg-loc verg-b"><span class="verg-dot dot-b"></span>${escapeHtml(rowB.location)}<strong>${fmt(rowB.finalScore)}</strong></div>
    </div>
    <div class="verg-rows">
      ${rows.map(({lbl, a, b, d}) => {
        const pctA = Math.round(((a ?? 0) / maxVal) * 100);
        const pctB = Math.round(((b ?? 0) / maxVal) * 100);
        const absDiff = Math.abs(d);
        const diffLabel = (d > 0 ? "+" : "") + d.toFixed(1).replace(".", ",");
        const cls = absDiff >= 1.5 ? "verg-big" : absDiff >= 0.5 ? "verg-mid" : "verg-small";
        return `
        <div class="verg-row ${cls}">
          <div class="verg-theme">${lbl}</div>
          <div class="verg-bars">
            <div class="verg-bar-wrap">
              <div class="verg-bar bar-a" style="width:${pctA}%"></div>
            </div>
            <div class="verg-bar-wrap">
              <div class="verg-bar bar-b" style="width:${pctB}%"></div>
            </div>
          </div>
          <div class="verg-scores">
            <span class="vs-a">${a !== null ? fmt(a) : "–"}</span>
            <span class="vs-sep">/</span>
            <span class="vs-b">${b !== null ? fmt(b) : "–"}</span>
          </div>
          <div class="verg-delta ${d > 0.1 ? "delta-pos" : d < -0.1 ? "delta-neg" : "delta-tie"}">${absDiff < 0.05 ? "=" : diffLabel}</div>
        </div>`;
      }).join("")}
    </div>`;
}

function renderRegioChart() {
  const card = el("regioChartCard");
  const themeCard = el("themeAvgCard");
  const ctx  = el("regioChart");
  if (!ctx) return;
  const hasRegio = state.filtered.some(r => r.regio);
  if (card) card.style.display = hasRegio ? "" : "none";
  if (themeCard) themeCard.style.display = "";
  if (!hasRegio) { destroyChart(state.charts.regioChart); return; }

  const regios = [...new Set(state.filtered.map(r => r.regio).filter(Boolean))].sort();
  const means = regios.map(reg => {
    const vals = state.filtered.filter(r => r.regio === reg).map(r => r.finalScore).filter(v => v !== null);
    return vals.length ? round1(vals.reduce((a,b) => a+b,0) / vals.length) : 0;
  });

  destroyChart(state.charts.regioChart);
  state.charts.regioChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: regios,
      datasets: [{ data: means, backgroundColor: DV_COLORS.sand, borderRadius: 6 }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, suggestedMax: 10, grid: { color: "rgba(30,39,69,0.06)" } },
                x: { grid: { display: false } } }
    }
  });
}

/* ========================= 10) REGIO RADAR VERGELIJKING ========================= */
const REGIO_COLORS = {
  "Oost":  { border: "#3A4E96", bg: "rgba(58,78,150,0.13)" },
  "West":  { border: "#1A7E7A", bg: "rgba(26,126,122,0.13)" },
  "Noord": { border: "#C8951A", bg: "rgba(200,149,26,0.13)" }
};
const REGIO_FALLBACK = [
  { border: "#4393FF", bg: "rgba(67,147,255,0.13)" },
  { border: "#1A7E7A", bg: "rgba(26,126,122,0.13)" },
  { border: "#C8951A", bg: "rgba(200,149,26,0.13)" }
];

function renderRegioRadars() {
  const section = el("regioRadarSection");
  if (!section) return;

  const hasRegio = state.filtered.some(r => r.regio);
  const regios = hasRegio
    ? [...new Set(state.filtered.map(r => r.regio).filter(Boolean))].sort()
    : [];

  // destroy old charts
  state.charts.regioRadars.forEach(c => destroyChart(c));
  state.charts.regioRadars = [];

  if (!hasRegio || regios.length < 2) { section.hidden = true; return; }
  section.hidden = false;

  const themeLabels = (state.rows[0]?.themeFields || []).map((f, i) => getThemeName(f, i));

  const container = el("regioRadars");
  if (!container) return;

  container.innerHTML = regios.map(r =>
    `<div class="regio-radar-item">
       <div class="regio-radar-label regio-label-${r.toLowerCase()}">${escapeHtml(r)}</div>
       <div class="regio-radar-count">${state.filtered.filter(x => x.regio === r && x.finalScore !== null).length} locaties</div>
       <canvas id="rr_${escapeHtml(r)}" height="250"></canvas>
     </div>`
  ).join("");

  regios.forEach((regio, idx) => {
    const rows = state.filtered.filter(r => r.regio === regio);
    const means = CONFIG.themePrefix.map((_, i) => {
      const vals = rows.map(r => r.themes[i]).filter(v => v !== null);
      return vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
    });
    const col = REGIO_COLORS[regio] || REGIO_FALLBACK[idx % REGIO_FALLBACK.length];
    const ctx = document.getElementById(`rr_${regio}`);
    if (!ctx) return;

    const chart = new Chart(ctx, {
      type: "radar",
      data: {
        labels: themeLabels.length ? themeLabels : CONFIG.themePrefix,
        datasets: [{
          label: regio,
          data: means,
          backgroundColor: col.bg,
          borderColor: col.border,
          pointBackgroundColor: col.border,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) => `${c.label}: ${String(c.raw).replace(".", ",")}`,
              title: () => regio
            }
          }
        },
        scales: {
          r: {
            beginAtZero: false,
            min: 4, max: 10,
            ticks: { stepSize: 2, font: { size: 9 }, color: "rgba(30,39,69,0.5)", backdropColor: "transparent" },
            pointLabels: { font: { size: 10 }, color: "#1E2745" },
            grid: { color: "rgba(30,39,69,0.08)" },
            angleLines: { color: "rgba(30,39,69,0.08)" }
          }
        }
      }
    });
    state.charts.regioRadars.push(chart);
  });
}

/* ========================= 11) HEATMAP ========================= */
function cellClass(s) {
  if (s === null) return "cell cell-na";
  if (s < 6.0)   return "cell cell-low";
  if (s < 7.0)   return "cell cell-mid";
  if (s < 8.0)   return "cell cell-good";
  return "cell cell-high";
}

function renderHeatmap() {
  const head = el("heatmapHead"), body = el("heatmapBody");
  if (!head || !body) return;

  const labels = state.rows[0]
    ? state.rows[0].themeFields.map((h,i) => h || CONFIG.themePrefix[i])
    : CONFIG.themePrefix;

  const hasRegio = state.rows.some(r => r.regio);

  head.innerHTML = `<tr>
    <th>Locatie</th>
    ${hasRegio ? "<th>Regio</th>" : ""}
    <th>Trans.</th>
    <th>Score</th>
    ${labels.map((_,i) => `<th>${CONFIG.themePrefix[i]}</th>`).join("")}
  </tr>`;

  body.innerHTML = "";
  state.filtered.forEach((r, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.index = String(idx);
    const sel = state.selectedIndex !== null &&
      state.filtered[state.selectedIndex]?.id === r.id;
    if (sel) tr.classList.add("selected");

    tr.innerHTML = `
      <td>${escapeHtml(r.location)}</td>
      ${hasRegio ? `<td>${escapeHtml(r.regio)}</td>` : ""}
      <td>${escapeHtml(r.transitie || "")}</td>
      <td><strong>${fmt(r.finalScore)}</strong></td>
      ${r.themes.map(v => `<td class="${cellClass(v)}">${fmt(v)}</td>`).join("")}
    `;
    tr.addEventListener("click", () => {
      state.selectedIndex = idx;
      renderHeatmap();
      renderDetail(r);
      renderLocationReport(r);
    });
    body.appendChild(tr);
  });

  injectHeatmapStyles();
}

let _heatStylesDone = false;
function injectHeatmapStyles() {
  if (_heatStylesDone) return;
  _heatStylesDone = true;
  const s = document.createElement("style");
  s.textContent = `.cell{font-weight:700;border-radius:6px}
    .cell-na{color:rgba(30,39,69,.4)}
    .cell-low{background:rgba(192,57,43,.12);color:#8B2010}
    .cell-mid{background:rgba(208,187,145,.4)}
    .cell-good{background:rgba(67,147,255,.12);color:#1E5AA8}
    .cell-high{background:rgba(67,147,255,.22);color:#1050A0}`;
  document.head.appendChild(s);
}

/* ========================= 11) DETAIL + RADAR ========================= */
function renderDetail(row) {
  const empty = el("detailEmpty"), panel = el("detailPanel");
  if (!row) {
    if (empty) empty.style.display = "block";
    if (panel) panel.hidden = true;
    destroyChart(state.charts.radarChart);
    state.charts.radarChart = null;
    return;
  }
  if (empty) empty.style.display = "none";
  if (panel) panel.hidden = false;

  setText("detailName",  row.location);
  setText("detailScore", fmt(row.finalScore));
  setText("detailBase",  fmt(row.baseScore));

  const pb = el("detailPhaseBadge");
  if (pb) pb.textContent = row.phase ? `Fase ${row.phase}` : "Fase";

  const rb = el("detailRegioBadge");
  if (rb) { rb.hidden = !row.regio; if (!rb.hidden) rb.textContent = row.regio; }

  const bounded = el("detailBounded"), reasons = el("detailReasons");
  const moreBtn = el("detailMoreBtn"), acc = el("detailAccordion");
  if (row.boundReasons?.length) {
    if (bounded) bounded.hidden = false;
    if (reasons) reasons.textContent = row.boundReasons.join("; ");
    if (acc) acc.hidden = true;
    if (moreBtn) {
      moreBtn.textContent = "Toon details";
      moreBtn.onclick = () => {
        const h = acc.hidden; acc.hidden = !h;
        moreBtn.textContent = h ? "Verberg details" : "Toon details";
      };
    }
  } else {
    if (bounded) bounded.hidden = true;
    if (acc) acc.hidden = true;
  }

  const dt = el("detailTable");
  if (dt) {
    const themeRows = row.themes.map((v,i) =>
      `<tr><th>${escapeHtml(row.themeFields[i] || CONFIG.themePrefix[i])}</th><td>${fmt(v)}</td></tr>`
    ).join("");
    const boundInfo = row.boundReasons.length
      ? `<tr><th>Begrenzing</th><td>Ja (cap: ${row.boundCap !== null ? fmt(row.boundCap) : ""})</td></tr>
         <tr><th>Reden</th><td>${escapeHtml(row.boundReasons.join("; "))}</td></tr>`
      : `<tr><th>Begrenzing</th><td>Nee</td></tr>`;
    dt.innerHTML = `<tbody>
      <tr><th>Locatie</th><td>${escapeHtml(row.location)}</td></tr>
      <tr><th>Regio</th><td>${escapeHtml(row.regio || "–")}</td></tr>
      <tr><th>Transitie</th><td>${escapeHtml(row.transitie || "–")}</td></tr>
      <tr><th>Basis</th><td>${fmt(row.baseScore)}</td></tr>
      <tr><th>Eindscore</th><td>${fmt(row.finalScore)}</td></tr>
      <tr><th>Fase</th><td>${row.phase ?? "–"}</td></tr>
      ${boundInfo}${themeRows}
    </tbody>`;
  }

  renderRadar(row);
}

function renderRadar(row) {
  const ctx = el("radarChart"); if (!ctx) return;
  const data = row.themes.map(v => v === null ? 0 : v);
  destroyChart(state.charts.radarChart);
  state.charts.radarChart = new Chart(ctx, {
    type: "radar",
    data: {
      labels: CONFIG.themePrefix,
      datasets: [{ label: "Score", data,
        backgroundColor: "rgba(67,147,255,0.12)",
        borderColor: "#4393FF", pointBackgroundColor: "#4393FF" }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { r: { beginAtZero: true, min: 0, max: 10, ticks: { stepSize: 2 },
        grid: { color: "rgba(30,39,69,0.08)" } } }
    }
  });
}

/* ========================= 12) TOTAALOVERZICHT ========================= */
function renderTotaaloverzicht() {
  const section = el("totaalSection");
  if (!section) return;

  const valid = state.filtered.filter(r => r.finalScore !== null);
  if (valid.length === 0) { section.hidden = true; return; }
  section.hidden = false;

  // Title with month/year
  const now = new Date();
  const month = now.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
  setText("totaalTitle", `Welzijn in Beeld: Totaaloverzicht Locaties (${month.charAt(0).toUpperCase() + month.slice(1)})`);

  // Bandbreedte
  const scores = valid.map(r => r.finalScore);
  const minS = Math.min(...scores), maxS = Math.max(...scores);
  const meta = el("totaalMeta");
  if (meta) {
    meta.innerHTML = `
      <div class="breedte-label">Bandbreedte</div>
      <div class="breedte-range">van <strong>${fmt(minS)}</strong> tot <strong>${fmt(maxS)}</strong></div>
      <div class="breedte-desc">Locaties variëren van een kritieke basis tot een excellente voorbeeldfunctie.</div>`;
  }

  // Sort descending, group by phase
  const sorted = [...valid].sort((a,b) => (b.finalScore||0) - (a.finalScore||0));
  const groups = el("totaalGroups");
  if (!groups) return;

  groups.innerHTML = [4,3,2,1].map(phase => {
    const rows = sorted.filter(r => r.phase === phase);
    if (!rows.length) return "";
    const info = TOTAAL_PHASE_INFO[phase];

    const rowsHtml = rows.map(r => {
      const w = r.finalScore !== null ? ((r.finalScore / 10) * 100).toFixed(1) : 0;
      const hasRegio = r.regio ? ` <span class="totaal-regio">${escapeHtml(r.regio)}</span>` : "";
      return `<div class="totaal-row">
        <div class="totaal-loc">${escapeHtml(r.location)}${hasRegio}</div>
        <div class="totaal-bar-wrap">
          <div class="totaal-bar tbar-${phase}" data-w="${w}%" style="width:0%">
            <span class="totaal-bar-score">${fmt(r.finalScore)}</span>
          </div>
        </div>
      </div>`;
    }).join("");

    const topNote = (phase === 4 && rows.length > 0)
      ? `<div class="phase-top-note">Topsegment in Beeld: ${rows.length} locatie${rows.length > 1 ? "s" : ""} in Fase 4.</div>`
      : "";

    return `<div class="phase-group phase-g-${phase}">
      <div class="phase-rows">${rowsHtml}</div>
      <div class="phase-info-box pib-${phase}">
        <div class="pib-title">${escapeHtml(info.title)}</div>
        <div class="pib-desc">${escapeHtml(info.desc)}</div>
        ${topNote}
      </div>
    </div>`;
  }).join("");

  // Animate bars
  requestAnimationFrame(() => requestAnimationFrame(() => {
    groups.querySelectorAll(".totaal-bar[data-w]").forEach(b => {
      b.style.width = b.dataset.w;
    });
  }));
}

/* ========================= 13) LOCATIE RAPPORT ========================= */
function renderLocationReport(row) {
  const section = el("locationReport");
  if (!section) return;

  if (!row) { section.hidden = true; return; }
  section.hidden = false;

  setText("reportName", row.location);

  const date = new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
  setText("reportDate", date);

  const gauge = el("reportGauge");
  setText("reportGaugeName", row.location);
  if (gauge) gauge.innerHTML = buildGaugeSvg(row.finalScore);

  const phaseText = row.phase ? `${PHASE_LABELS[row.phase] || "Fase " + row.phase}` : "";
  setText("reportPhaseLabel", `Status: ${phaseText}`);

  // Animate gauge fill after insert
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const circle = gauge?.querySelector(".gauge-fill-circle");
    if (circle) {
      const r = 44, circ = 2 * Math.PI * r, arcLen = circ * 0.75;
      const pct = row.finalScore !== null ? Math.min(Math.max(row.finalScore / 10, 0), 1) : 0;
      const fill = arcLen * pct;
      circle.style.transition = "stroke-dasharray 0.9s cubic-bezier(0.25,0.46,0.45,0.94)";
      circle.setAttribute("stroke-dasharray", `0 ${circ.toFixed(1)}`);
      setTimeout(() => {
        circle.setAttribute("stroke-dasharray", `${fill.toFixed(1)} ${(circ - fill).toFixed(1)}`);
      }, 50);
    }
  }));

  // Theme bars
  const barsEl = el("reportThemeBars");
  if (barsEl) {
    barsEl.innerHTML = row.themes.map((score, i) => {
      const name = getThemeName(row.themeFields[i], i);
      const lbl  = scoreLabel(score);
      const pct  = score !== null ? Math.round(score * 10) : 0;
      return `<div class="tbar-row">
        <div class="tbar-label">
          <span class="tbar-num">${i+1}.</span>
          <span class="tbar-name">${escapeHtml(name)}</span>
        </div>
        <span class="tbar-score">${fmt(score)}</span>
        <div class="tbar-track">
          <div class="tbar-fill ${lbl.bar}" data-w="${pct}%" style="width:0%"></div>
        </div>
        <span class="tbar-pct">${pct}%</span>
        <span class="score-lbl ${lbl.cls}">${lbl.label}</span>
      </div>`;
    }).join("");

    requestAnimationFrame(() => requestAnimationFrame(() => {
      barsEl.querySelectorAll(".tbar-fill[data-w]").forEach(b => { b.style.width = b.dataset.w; });
    }));
  }

  // Sort themes by score
  const ranked = row.themes
    .map((s, i) => ({ s, i, name: getThemeName(row.themeFields[i], i) }))
    .filter(t => t.s !== null)
    .sort((a, b) => b.s - a.s);

  // Strengths (top 5)
  const sEl = el("reportStrengths");
  if (sEl) sEl.innerHTML = ranked.slice(0, 5).map(t =>
    `<li><span class="str-check">✓</span>${escapeHtml(t.name)}</li>`).join("");

  // Development (bottom 5)
  const dEl = el("reportDevelopment");
  if (dEl) dEl.innerHTML = [...ranked].reverse().slice(0, 5).map(t =>
    `<li><span class="dev-dot">•</span>${escapeHtml(t.name)}</li>`).join("");

  // Hefboom vs Risico
  const lEl = el("reportLeverage");
  if (lEl) {
    const hefbomen = ranked.slice(0, 2);
    const risicos  = [...ranked].reverse().slice(0, 2);
    lEl.innerHTML = `<div class="lev-grid">
      <div>
        <div class="lev-title">Hefbomen</div>
        <ul class="lev-list">${hefbomen.map(t => `<li>${escapeHtml(t.name)}</li>`).join("")}</ul>
      </div>
      <div>
        <div class="lev-title risico">Risico's</div>
        <ul class="lev-list">${risicos.map(t => `<li>${escapeHtml(t.name)}</li>`).join("")}</ul>
      </div>
    </div>`;
  }

  // Strategic intervention (lowest theme)
  const lowest = [...ranked].reverse()[0];
  const intEl = el("reportIntervention");
  const intTitle = el("reportInterventionTitle");
  if (intEl && lowest) {
    const text = THEME_INTERVENTIONS[lowest.i] || "Focus op het laagst scorende thema voor gerichte verbetering.";
    if (intTitle) intTitle.textContent = `Strategische Interventie: ${lowest.name}`;
    intEl.innerHTML = `<div class="int-text">${escapeHtml(text)}</div>`;
  }

  section.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ========================= 14) SAMPLE CSV + EVENTS ========================= */
function buildSampleCsv() {
  const headers = ["Locatie","Regio",
    "T01_Thuisvoelen","T02_Welzijn_centraal","T03_Samenwerking","T04_Respect_Reablement",
    "T05_Hospitality","T06_Prikkelbalans","T07_Reeel_risico","T08_Belevingsgericht_werken",
    "T09_Culturele_identiteit","T10_Omgevingsondersteuning","Eindscore"];
  const rows = [
    // Oost                                          T01  T02  T03  T04  T05  T06  T07  T08  T09  T10  Eindscore (gewogen)
    ["De Boschstede",               "Oost",           7,   8,   7,   8,   7,   7,   8,   7,   7,   8,  7.4],
    ["Groot Bijstervelt",           "Oost",           8,   9,   8,   9,   8,   8,   9,   8,   8,   8,  8.3],
    ["Huis ter Weegen",             "Oost",           6,   7,   6,   7,   6,   6,   7,   6,   6,   7,  6.4],
    ["Huis Welgelegen",             "Oost",           7,   7,   7,   8,   7,   7,   7,   7,   7,   8,  7.2],
    ["Landgoed Klein Engelenburg",  "Oost",           9,   9,   8,   9,   9,   8,   9,   9,   8,   9,  8.7],
    ["De Lindeborg",                "Oost",           7,   7,   6,   7,   7,   6,   7,   7,   6,   7,  6.7],
    ["Villa Molenenk",              "Oost",           8,   7,   8,   8,   7,   8,   7,   8,   7,   8,  7.7],
    ["Villa le Monde",              "Oost",           5,   5,   6,   5,   5,   6,   5,   5,   5,   5,  5.2],
    ["Villa Pavia",                 "Oost",           8,   8,   7,   8,   8,   7,   8,   8,   8,   8,  7.8],
    ["De Sterrenschans",            "Oost",           6,   6,   7,   6,   6,   7,   6,   6,   6,   7,  6.3],
    ["De Wulperhorst",              "Oost",           9,   8,   9,   8,   9,   8,   9,   8,   8,   9,  8.5],
    ["Residence Anna Theresia",     "Oost",           7,   8,   7,   7,   8,   7,   7,   8,   7,   7,  7.3],
    // West
    ["Koetshuys Erica",             "West",           5,   5,   5,   4,   5,   5,   5,   5,   4,   5,  4.8],
    ["Residence Haganum",           "West",           8,   8,   9,   8,   8,   9,   8,   8,   8,   8,  8.2],
    ["Holland",                     "West",           7,   6,   7,   6,   7,   6,   7,   6,   7,   6,  6.5],
    ["De Magistraat",               "West",           7,   7,   8,   7,   7,   8,   7,   7,   7,   7,  7.2],
    ["Marienhaven",                 "West",           8,   8,   7,   8,   8,   7,   8,   8,   7,   8,  7.7],
    ["Villa Oranjepark",            "West",           6,   7,   6,   6,   7,   6,   6,   7,   6,   6,  6.3],
    ["Sint Jozefpaviljoen",         "West",           5,   4,   5,   5,   4,   5,   5,   5,   4,   5,  4.8],
    ["Slingerbosch",                "West",           7,   7,   7,   8,   7,   7,   7,   7,   7,   7,  7.1],
    ["Villa Walgaerde",             "West",           8,   8,   8,   8,   8,   8,   8,   8,   8,   8,  8.0],
    ["Het Witte Huis",              "West",           7,   7,   7,   6,   7,   7,   7,   7,   6,   7,  6.8],
    // Noord
    ["Boarnsterhim Staete",         "Noord",          7,   6,   7,   7,   6,   7,   7,   6,   7,   7,  6.7],
    ["Residence Coestraete",        "Noord",          8,   8,   7,   8,   8,   7,   8,   8,   8,   7,  7.7],
    ["Het Hendrickszhuys",          "Noord",          7,   8,   7,   8,   7,   7,   8,   7,   8,   7,  7.4],
    ["Hildebrand",                  "Noord",          9,   8,   8,   9,   8,   8,   9,   8,   8,   9,  8.4],
    ["De Meerlhorst",               "Noord",          6,   6,   7,   6,   6,   7,   6,   6,   6,   6,  6.2],
    ["De Uylenburgh",               "Noord",          5,   6,   5,   5,   6,   5,   5,   6,   5,   5,  5.3],
    ["De Vermeer",                  "Noord",          8,   7,   8,   7,   8,   7,   8,   7,   8,   7,  7.5],
    ["Fleurage Residences",         "Noord",          8,   8,   8,   8,   8,   8,   8,   8,   8,   9,  8.1],
  ];
  return [headers.join(",")].concat(rows.map(r => r.join(","))).join("\n");
}

function downloadTextFile(name, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  a.remove(); URL.revokeObjectURL(url);
}

function wireEvents() {
  const fi = el("csvFile");
  if (fi) fi.addEventListener("change", (e) => {
    showError("");
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload  = () => ingestCsvText(String(r.result || ""));
    r.onerror = () => showError("Bestand kon niet worden gelezen.");
    r.readAsText(f);
  });

  el("downloadSample")?.addEventListener("click", (e) => {
    e.preventDefault();
    downloadTextFile("sample-welzijn-in-beeld.csv", buildSampleCsv());
  });

  el("printDashboardBtn")?.addEventListener("click", () => {
    document.body.classList.remove("print-report");
    window.print();
  });

  el("printReportBtn")?.addEventListener("click", () => {
    document.body.classList.add("print-report");
    window.print();
  });

  window.addEventListener("afterprint", () => {
    document.body.classList.remove("print-report");
  });

  ["filterFase","filterSearch"].forEach(id =>
    el(id)?.addEventListener(id === "filterSearch" ? "input" : "change", applyFiltersAndRender)
  );
  el("filterRegio")?.addEventListener("change", applyFiltersAndRender);

  ["vergelijkA","vergelijkB"].forEach(id =>
    el(id)?.addEventListener("change", renderVergelijk)
  );
}

/* ========================= 15) INIT ========================= */
(function init() {
  wireEvents();
  setText("ingestStatus", "Nog geen bestand geüpload.");
  showError("");
})();
