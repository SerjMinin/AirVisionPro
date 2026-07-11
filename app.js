/* ============================================================
   AirVision Pro — движок дашборда.
   ============================================================ */

const APP_VERSION = "v1.0";
const OUTDOOR_SN = "OUT-0001";
const INDOOR_SN  = "IN-0001";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentKey = PARAMS[0].key;
let currentRange = "24h";
let offsetSteps = 0;
let chart = null;

const RANGES = {
  "24h":   { sec: 24*3600,     ticks: 24, i18n: "r_24h"   },
  "week":  { sec: 7*24*3600,   ticks: 7,  i18n: "r_week"  },
  "month": { sec: 30*24*3600,  ticks: 30, i18n: "r_month" },
  "year":  { sec: 365*24*3600, ticks: 12, i18n: "r_year"  }
};

/* ---- вход ---- */
async function guard() {
  const { data } = await client.auth.getSession();
  if (!data.session) { window.location.href = "index.html"; return false; }
  return true;
}
async function logout() { await client.auth.signOut(); window.location.href = "index.html"; }

/* ---- тема/язык ---- */
function toggleTheme() { setTheme(getTheme() === "dark" ? "light" : "dark"); }
function onThemeChanged() { renderParam(currentKey); }
function onLangChanged() { buildTabs(); buildRangeBar(); renderParam(currentKey); }

/* ---- вкладки ---- */
function buildTabs() {
  const bar = document.getElementById("tabs");
  if (!bar) return;
  bar.innerHTML = "";
  PARAMS.forEach(p => {
    const tab = document.createElement("button");
    tab.className = "tab" + (p.key === currentKey ? " active" : "");
    tab.textContent = t(p.i18n);
    tab.onclick = () => { currentKey = p.key; offsetSteps = 0; buildTabs(); renderParam(p.key); };
    bar.appendChild(tab);
  });
}

/* ---- панель диапазона: ‹ [24ч Неделя Месяц Год] › (с переводом) ---- */
function buildRangeBar() {
  const bar = document.getElementById("range-bar");
  if (!bar) return;
  bar.innerHTML = "";

  const left = document.createElement("button");
  left.className = "range-btn arrow"; left.textContent = "‹";
  left.title = "‹";
  left.onclick = () => { offsetSteps++; renderParam(currentKey); };

  const right = document.createElement("button");
  right.className = "range-btn arrow" + (offsetSteps === 0 ? " disabled" : "");
  right.textContent = "›"; right.title = t("to_now");
  right.onclick = () => { if (offsetSteps > 0) { offsetSteps--; renderParam(currentKey); } };

  bar.appendChild(left);
  ["24h","week","month","year"].forEach(code => {
    const b = document.createElement("button");
    b.className = "range-btn" + (code === currentRange ? " active" : "");
    b.textContent = t(RANGES[code].i18n);      // ПЕРЕВОД
    b.onclick = () => { currentRange = code; offsetSteps = 0; buildRangeBar(); renderParam(currentKey); };
    bar.appendChild(b);
  });
  bar.appendChild(right);
}

/* ---- загрузка данных ---- */
async function loadSeries(serial, key, from, to) {
  const { data, error } = await client
    .from("measurements")
    .select("val, ts_device, src, provider")
    .eq("serial", serial).eq("key", key)
    .gte("ts_device", from).lte("ts_device", to)
    .order("ts_device", { ascending: true });
  if (error || !data) return [];
  return data;
}

/* ---- окно времени ---- */
function windowRange() {
  const now = Math.floor(Date.now() / 1000);
  const span = RANGES[currentRange].sec;
  const to = now - offsetSteps * span;
  const from = to - span;
  return { from, to, span };
}

/* ---- сглаживание J305 ---- */
function smoothJ305(points) {
  const W = 5;
  return points.map((pt, i) => {
    const from = Math.max(0, i - W + 1);
    const slice = points.slice(from, i + 1).map(p => p.y);
    const avg = slice.reduce((a,b)=>a+b,0) / slice.length;
    const spike = pt.y > avg * 1.8;
    return { x: pt.x, y: spike ? pt.y : avg };
  });
}

/* ============================================================ РЕНДЕР ============================================================ */
async function renderParam(key) {
  const p = PARAMS.find(x => x.key === key);
  if (!p) return;

  if (p.type === "compass") { await renderCompass(p); return; }

  showCanvasGraph();
  const { from, span } = windowRange();
  const ticks = RANGES[currentRange].ticks;
  const step = span / ticks;
  const to = from + span;

  const locBadge = document.getElementById("loc-badge");
  let sources = [];
  if (p.loc === "out" || p.loc === "pressure") { sources = [{ sn: OUTDOOR_SN, tag: t("outdoor") }]; locBadge.textContent = t("outdoor"); }
  else if (p.loc === "in") { sources = [{ sn: INDOOR_SN, tag: t("indoor") }]; locBadge.textContent = t("indoor"); }
  else { sources = [{ sn: OUTDOOR_SN, tag: t("outdoor") }, { sn: INDOOR_SN, tag: t("indoor") }]; locBadge.textContent = t("outdoor") + " + " + t("indoor"); }

  const datasets = [];
  const palette = ["#4db2ff","#ff9d4d","#a0ff6b","#ff6bce","#ffe14d","#b98cff","#6bd2ff"];
  let ci = 0;
  const lineDefs = p.lines ? p.lines : [{ dbkey: p.key, label: null, color: p.color }];

  for (const s of sources) {
    for (const ld of lineDefs) {
      const rows = await loadSeries(s.sn, ld.dbkey, from, to);
      if (rows.length === 0) continue;
      const groups = {};
      rows.forEach(r => { const g = (r.provider || r.src || "sensor"); (groups[g] = groups[g] || []).push(r); });
      for (const gName in groups) {
        let pts = groups[gName].map(r => ({ x: (r.ts_device - from) / step, y: Number(r.val) }));
        if (p.algo === "j305") pts = smoothJ305(pts);
        let label = ld.label ? ld.label : (s.tag + " · " + gName);
        if (p.lines && sources.length > 1) label = s.tag + " " + ld.label;
        datasets.push({
          label, data: pts,
          borderColor: ld.color || palette[ci % palette.length],
          backgroundColor: (ld.color || palette[ci % palette.length]) + "22",
          fill: false, tension: 0.3, pointRadius: 2, spanGaps: false
        });
        ci++;
      }
    }
  }

  document.getElementById("chart-title").textContent = t(p.i18n) + (p.unit ? " (" + p.unit + ")" : "");

  const advice = document.getElementById("advice");
  if (p.comments && datasets.length && datasets[0].data.length) {
    const last = datasets[0].data[datasets[0].data.length - 1].y;
    advice.textContent = t(p.i18n) + ": " + Math.round(last) + " " + p.unit + " — " + commentFor(p, last);
  } else advice.textContent = t("advice_default");

  const isLight = getTheme() === "light";
  const gridColor = isLight ? "rgba(20,60,110,0.12)" : "rgba(120,190,255,0.15)";
  const tickColor = isLight ? "#0d2a4a" : "#eaf4ff";

  const xLabels = [];
  for (let i = 0; i <= ticks; i++) xLabels.push(fmtTick(from + i * step, currentRange));

  if (chart) { chart.destroy(); chart = null; }
  chart = new Chart(document.getElementById("chart"), {
    type: "line",
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false, parsing: false,
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        legend: { labels: { color: tickColor } },
        zoom: { zoom: { wheel:{enabled:true}, pinch:{enabled:true}, mode:"x" }, pan:{ enabled:true, mode:"x" } }
      },
      scales: {
        x: { type: "linear", min: 0, max: ticks, grid: { color: gridColor },
          ticks: { color: tickColor, stepSize: 1, autoSkip: false, maxRotation: 0, callback: v => xLabels[v] ?? "" } },
        y: { grid: { color: gridColor }, ticks: { color: tickColor } }
      }
    }
  });
}

function fmtTick(unix, range) {
  const d = new Date(unix * 1000);
  const p = n => String(n).padStart(2, "0");
  if (range === "24h")  return p(d.getHours());
  if (range === "week") return p(d.getDate()) + "." + p(d.getMonth()+1);
  if (range === "month")return p(d.getDate());
  return p(d.getMonth()+1);
}

/* ============================================================ КОМПАС ============================================================ */
function showCanvasGraph() {
  document.getElementById("chart").style.display = "block";
  document.getElementById("compass").style.display = "none";
}
function showCompass() {
  document.getElementById("chart").style.display = "none";
  document.getElementById("compass").style.display = "block";
}

async function renderCompass(p) {
  showCompass();
  document.getElementById("chart-title").textContent = t(p.i18n);
  document.getElementById("loc-badge").textContent = t("outdoor");
  document.getElementById("advice").textContent = t("advice_default");

  const { from, to } = windowRange();
  const rows = await loadSeries(OUTDOOR_SN, "wind_dir", from, to);

  const bins = new Array(8).fill(0);
  rows.forEach(r => { let deg = ((Number(r.val) % 360) + 360) % 360; bins[Math.round(deg/45)%8]++; });
  const total = rows.length || 1;
  const freq = bins.map(b => b / total);
  const current = rows.length ? Number(rows[rows.length-1].val) : null;

  drawCompass(freq, current);
}

function drawCompass(freq, currentDeg) {
  const cv = document.getElementById("compass");
  const box = cv.parentElement;
  const dpr = window.devicePixelRatio || 1;

  // размер = минимальная сторона доступной области (вписываем без роста)
  const avail = Math.min(box.clientWidth, box.clientHeight) - 24;
  const size = Math.max(120, avail);

  cv.width = size * dpr; cv.height = size * dpr;
  cv.style.width = size + "px"; cv.style.height = size + "px";

  const ctx = cv.getContext("2d");
  ctx.setTransform(1,0,0,1,0,0);   // сброс, чтобы масштаб не накапливался
  ctx.scale(dpr, dpr);

  const isLight = getTheme() === "light";
  const line = isLight ? "#1e7fff" : "#4db2ff";
  const dim  = isLight ? "rgba(20,60,110,0.25)" : "rgba(120,190,255,0.25)";
  const txt  = isLight ? "#0d2a4a" : "#eaf4ff";

  const cx = size/2, cy = size/2, R = size/2 - 30;
  ctx.clearRect(0,0,size,size);
  ctx.font = "14px 'Exo 2', sans-serif"; ctx.textAlign="center"; ctx.textBaseline="middle";

  ctx.strokeStyle = dim; ctx.lineWidth = 1;
  for (let k=1;k<=4;k++){ ctx.beginPath(); ctx.arc(cx,cy,R*k/4,0,Math.PI*2); ctx.stroke(); }

  const labels = t("COMPASS");
  for (let i=0;i<8;i++){
    const ang = (i*45 - 90) * Math.PI/180;
    const x = cx + Math.cos(ang)*R, y = cy + Math.sin(ang)*R;
    ctx.strokeStyle = dim; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(x,y); ctx.stroke();
    const lx = cx + Math.cos(ang)*(R+16), ly = cy + Math.sin(ang)*(R+16);
    ctx.fillStyle = txt; ctx.fillText(labels[i], lx, ly);
  }

  const maxF = Math.max(...freq, 0.0001);
  ctx.fillStyle = line + "55"; ctx.strokeStyle = line; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i=0;i<=8;i++){
    const idx = i%8; const ang = (idx*45 - 90) * Math.PI/180;
    const r = (freq[idx]/maxF) * R;
    const x = cx + Math.cos(ang)*r, y = cy + Math.sin(ang)*r;
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();

  if (currentDeg !== null && !isNaN(currentDeg)) {
    const ang = (currentDeg - 90) * Math.PI/180;
    const x = cx + Math.cos(ang)*(R-6), y = cy + Math.sin(ang)*(R-6);
    ctx.strokeStyle = isLight ? "#d02020" : "#ff6b6b"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(x,y); ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(x,y,5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = txt; ctx.fillText(Math.round(currentDeg)+"°", cx, cy - 10);
    ctx.fillText(t("wind_now"), cx, cy + 10);
  }
}

/* ---- статус/старт ---- */
async function refreshStatus() {
  document.getElementById("ver").textContent = t("version") + " " + APP_VERSION;
}
async function startDashboard() {
  if (!(await guard())) return;
  document.body.style.visibility = "visible";
  await loadSettings();                 // грузим настройки из Supabase/кэша
  buildTabs(); buildRangeBar(); await refreshStatus();
  renderParam(currentKey);
  window.addEventListener("resize", () => renderParam(currentKey));
}