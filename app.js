/* ============================================================
   AirVision Pro — общий движок дашборда.
   ============================================================ */

const APP_VERSION = "v1.0";
const OUTDOOR_SN = "OUT-0001";
const INDOOR_SN  = "IN-0001";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentKey = PARAMS[0].key;   // стартовая вкладка — температура
let currentRange = "24h";         // 24h | week | month | year
let chart = null;

/* Диапазоны в секундах */
const RANGES = {
  "24h":   24*3600,
  "week":  7*24*3600,
  "month": 30*24*3600,
  "year":  365*24*3600
};

/* ---- Охранник входа ---- */
async function guard() {
  const { data } = await client.auth.getSession();
  if (!data.session) { window.location.href = "index.html"; return false; }
  return true;
}
async function logout() { await client.auth.signOut(); window.location.href = "index.html"; }

/* ---- Тема ---- */
function toggleTheme() { setTheme(getTheme() === "dark" ? "light" : "dark"); }
function onThemeChanged() { if (chart) renderParam(currentKey); }

/* ---- Язык сменился ---- */
function onLangChanged() { buildTabs(); buildRangeBar(); if (chart) renderParam(currentKey); }

/* ---- Вкладки-листы ---- */
function buildTabs() {
  const bar = document.getElementById("tabs");
  if (!bar) return;
  bar.innerHTML = "";
  PARAMS.forEach(p => {
    const tab = document.createElement("button");
    tab.className = "tab" + (p.key === currentKey ? " active" : "");
    tab.textContent = t(p.i18n);
    tab.onclick = () => { currentKey = p.key; buildTabs(); renderParam(p.key); };
    bar.appendChild(tab);
  });
}

/* ---- Кнопки диапазона ---- */
function buildRangeBar() {
  const bar = document.getElementById("range-bar");
  if (!bar) return;
  const items = [["24h", t("r_24h")], ["week", t("r_week")], ["month", t("r_month")], ["year", t("r_year")]];
  bar.innerHTML = "";
  items.forEach(([code, label]) => {
    const b = document.createElement("button");
    b.className = "range-btn" + (code === currentRange ? " active" : "");
    b.textContent = label;
    b.onclick = () => { currentRange = code; buildRangeBar(); renderParam(currentKey); };
    bar.appendChild(b);
  });
}

/* ---- Загрузка серии из базы ----
   serial: устройство; key: параметр; from: unix-секунды начала окна */
async function loadSeries(serial, key, from) {
  const { data, error } = await client
    .from("measurements")
    .select("val, ts_device, src, provider")
    .eq("serial", serial)
    .eq("key", key)
    .gte("ts_device", from)
    .order("ts_device", { ascending: true });
  if (error || !data) return [];
  return data;
}

/* ---- Форматирование метки времени под диапазон ---- */
function fmtTime(unix, range) {
  const d = new Date(unix * 1000);
  const p = n => String(n).padStart(2, "0");
  if (range === "24h")  return p(d.getHours()) + ":" + p(d.getMinutes());
  if (range === "week") return p(d.getDate()) + "." + p(d.getMonth()+1) + " " + p(d.getHours()) + ":00";
  return p(d.getDate()) + "." + p(d.getMonth()+1);
}

/* ---- Спец-алгоритм J305 (ионизирующее излучение):
   скользящее среднее сглаживает фон, но резкий всплеск сохраняется ---- */
function smoothJ305(points) {
  const W = 5; // окно сглаживания
  return points.map((pt, i) => {
    const from = Math.max(0, i - W + 1);
    const slice = points.slice(from, i + 1).map(p => p.val);
    const avg = slice.reduce((a,b)=>a+b,0) / slice.length;
    // если текущее значение резко выше среднего — оставляем всплеск
    const spike = pt.val > avg * 1.8;
    return { ...pt, val: spike ? pt.val : avg };
  });
}

/* ---- Основной рендер параметра ---- */
async function renderParam(key) {
  const p = PARAMS.find(x => x.key === key);
  if (!p) return;

  const now = Math.floor(Date.now() / 1000);
  const from = now - RANGES[currentRange];

  // Заголовок + метка локации:
  const locBadge = document.getElementById("loc-badge");
  let title = t(p.i18n) + " (" + p.unit + ")";

  // Собираем наборы данных (линии):
  const datasets = [];
  let labelsRef = null;
  const palette = ["#4db2ff", "#ff9d4d", "#a0ff6b", "#ff6bce", "#ffe14d", "#b98cff"];

  // Определяем, с каких устройств берём данные:
  //  out      → только уличное
  //  in       → только домашнее
  //  both     → оба (метка выберется ниже; показываем оба на одном графике с подписью в легенде)
  //  pressure → все источники в один «уличный» график
  let sources = [];
  if (p.loc === "out" || p.loc === "pressure") { sources = [{ sn: OUTDOOR_SN, tag: t("outdoor") }]; locBadge.textContent = t("outdoor"); }
  else if (p.loc === "in") { sources = [{ sn: INDOOR_SN, tag: t("indoor") }]; locBadge.textContent = t("indoor"); }
  else { sources = [{ sn: OUTDOOR_SN, tag: t("outdoor") }, { sn: INDOOR_SN, tag: t("indoor") }]; locBadge.textContent = t("outdoor") + " + " + t("indoor"); }

  let ci = 0;
  for (const s of sources) {
    let rows = await loadSeries(s.sn, key, from);
    if (rows.length === 0) continue;

    // группируем по (src, provider) — датчик, Open-Meteo, OWM и т.д.:
    const groups = {};
    rows.forEach(r => {
      const g = (r.provider || r.src || "sensor");
      (groups[g] = groups[g] || []).push(r);
    });

    for (const gName in groups) {
      let pts = groups[gName];
      if (p.algo === "j305") pts = smoothJ305(pts);

      if (!labelsRef) labelsRef = pts.map(r => fmtTime(r.ts_device, currentRange));

      const label = s.tag + " · " + gName;
      datasets.push({
        label,
        data: pts.map(r => Number(r.val.toFixed(p.round === "choice" ? 1 : p.round))),
        borderColor: palette[ci % palette.length],
        backgroundColor: palette[ci % palette.length] + "22",
        fill: false, tension: 0.3, pointRadius: 2
      });
      ci++;
    }
  }

  document.getElementById("chart-title").textContent = title;

  // Умный совет (например, комментарий давления по последнему значению):
  const advice = document.getElementById("advice");
  if (p.comments && datasets.length && datasets[0].data.length) {
    const last = datasets[0].data[datasets[0].data.length - 1];
    advice.textContent = t(p.i18n) + ": " + last + " " + p.unit + " — " + commentFor(p, last);
  } else {
    advice.textContent = t("advice_default");
  }

  // Цвета осей под тему:
  const isLight = getTheme() === "light";
  const gridColor = isLight ? "rgba(20,60,110,0.12)" : "rgba(120,190,255,0.15)";
  const tickColor = isLight ? "#0d2a4a" : "#eaf4ff";

  if (chart) { chart.destroy(); chart = null; }
  const canvas = document.getElementById("chart");
  chart = new Chart(canvas, {
    type: "line",
    data: { labels: labelsRef || [], datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        legend: { labels: { color: tickColor } },
        zoom: {
          zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: "x" },
          pan:  { enabled: true, mode: "x" }
        }
      },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: tickColor, maxRotation: 0, autoSkip: true } },
        y: { grid: { color: gridColor }, ticks: { color: tickColor } }
      }
    }
  });
}

async function refreshStatus() {
  document.getElementById("ver").textContent = t("version") + " " + APP_VERSION;
}

async function startDashboard() {
  if (!(await guard())) return;
  document.body.style.visibility = "visible";
  buildTabs();
  buildRangeBar();
  await refreshStatus();
  renderParam(currentKey);
}