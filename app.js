/* ============================================================
   AirVision Pro — общий движок дашборда.
   ============================================================ */

const APP_VERSION = "v1.0";
const OUTDOOR_SN = "OUT-0001";   // временно; позже возьмём из настроек
const INDOOR_SN  = "IN-0001";

// Клиент Supabase:
const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---- Список параметров (вкладок).
   В порции C заменим на полноценные конфиги из params/*.
   Пока — минимум для проверки движка. ---- */
const PARAMS = [
  {
    key: "temp", i18n: "p_temp", unit: "°C", enabled: true,
    series: [{ dbkey: "temp", src: "sensor", color: "#4db2ff", label: "Датчик" }]
  },
  {
    key: "rh", i18n: "p_rh", unit: "%", enabled: true,
    series: [{ dbkey: "rh", src: "sensor", color: "#4dff9d", label: "Датчик" }]
  }
];

let currentParam = PARAMS[0].key;
let chart = null;

/* ---- Охранник входа ---- */
async function guard() {
  const { data } = await client.auth.getSession();
  if (!data.session) { window.location.href = "index.html"; return false; }
  return true;
}

async function logout() {
  await client.auth.signOut();
  window.location.href = "index.html";
}

/* ---- Тема (переключатель в шапке) ---- */
function toggleTheme() {
  setTheme(getTheme() === "dark" ? "light" : "dark");
}
function onThemeChanged() { if (chart) renderParam(currentParam); } // перерисовать под тему

/* ---- Язык сменился → обновить вкладки и график ---- */
function onLangChanged() { buildTabs(); if (chart) renderParam(currentParam); }

/* ---- Вкладки-листы ---- */
function buildTabs() {
  const bar = document.getElementById("tabs");
  if (!bar) return;
  bar.innerHTML = "";
  PARAMS.forEach(p => {
    const tab = document.createElement("button");
    tab.className = "tab" + (p.key === currentParam ? " active" : "") + (p.enabled ? "" : " disabled");
    tab.textContent = t(p.i18n);
    tab.onclick = () => { currentParam = p.key; buildTabs(); renderParam(p.key); };
    bar.appendChild(tab);
  });
}

/* ---- Движок графика: рисует выбранный параметр ---- */
async function renderParam(key) {
  const p = PARAMS.find(x => x.key === key);
  if (!p) return;

  document.getElementById("chart-title").textContent = t(p.i18n) + " (" + p.unit + ")";

  // Загружаем данные для каждого источника (линии):
  const datasets = [];
  let labelsRef = null;

  for (const s of p.series) {
    const { data, error } = await client
      .from("measurements")
      .select("val, ts_device")
      .eq("serial", OUTDOOR_SN)
      .eq("key", s.dbkey)
      .eq("src", s.src)
      .order("ts_device", { ascending: true });

    if (error || !data || data.length === 0) continue;

    if (!labelsRef) {
      labelsRef = data.map(r => {
        const d = new Date(r.ts_device * 1000);
        return d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
      });
    }
    datasets.push({
      label: s.label,
      data: data.map(r => r.val),
      borderColor: s.color,
      backgroundColor: s.color + "22",
      fill: false, tension: 0.3, pointRadius: 2
    });
  }

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
      plugins: { legend: { labels: { color: tickColor } } },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: tickColor } },
        y: { grid: { color: gridColor }, ticks: { color: tickColor } }
      }
    }
  });
}

/* ---- Статусы устройств в шапке (заглушка «нет связи» пока) ---- */
async function refreshStatus() {
  document.getElementById("ver").textContent = t("version") + " " + APP_VERSION;
  // Реальную проверку last_seen подключим в порции C/D.
}

/* ---- Запуск ---- */
async function startDashboard() {
  if (!(await guard())) return;
  document.body.style.visibility = "visible";
  buildTabs();
  await refreshStatus();
  renderParam(currentParam);
}