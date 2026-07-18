/* AirVision Pro — движок дашборда. */

const APP_VERSION = "v1.0";
const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentKey = PARAMS[0].key;
let currentRange = "24h";
let offsetSteps = 0;
let chart = null;
let currentView = "param";
let TZ_OFFSET = 0;   // смещение часового пояса координат локации (сек)

const RANGES = {
  "24h":   { sec: 24*3600,     ticks: 12, i18n: "r_24h"   },  // 0,2…24
  "week":  { sec: 7*24*3600,   ticks: 7,  i18n: "r_week"  },  // 7 дней
  "month": { sec: 28*24*3600,  ticks: 4,  i18n: "r_month" },  // 4 недели
  "year":  { sec: 365*24*3600, ticks: 12, i18n: "r_year"  }   // 12 месяцев
};

const MONTHS_FULL = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];

function bgDateLabel(unix){
  const d = locDate(unix);
  if (currentRange==="year")  return "";
  if (currentRange==="month") return String(d.getUTCFullYear());
  return MONTHS_FULL[d.getUTCMonth()] + " " + d.getUTCFullYear();   // неделя и 24ч
}

const paramWmPlugin = {
  id:"paramwm",
  afterDraw(chart){
    if(!chart.$bgLabel) return;
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.fillStyle="rgba(150,170,200,0.4)";
    ctx.textAlign="right"; ctx.textBaseline="top";
    ctx.font="600 34px 'Exo 2',sans-serif";
    ctx.fillText(chart.$bgLabel, chartArea.right-8, chartArea.top+6);
    ctx.restore();
  }
};

const TOP_TITLE = {
  no2:"Диоксид азота NO₂", so2:"Диоксид серы SO₂", no:"Монооксид азота NO",
  co2:"Углекислый газ CO₂", co:"Угарный газ CO", o3:"Озон O₃",
  nh3:"Аммиак NH₃", hcho:"Формальдегид CH₂O", aqi:"AQI - Индекс качества воздуха"
};
function paramTopTitle(p) { return TOP_TITLE[p.key] || t(p.i18n); }

async function guard() {
  const { data } = await client.auth.getSession();
  if (!data.session) { window.location.href = "index.html"; return false; }
  return true;
}
async function logout() { await client.auth.signOut(); window.location.href = "index.html"; }

function toggleTheme() { setTheme(getTheme() === "dark" ? "light" : "dark"); }
function onThemeChanged() { if (chartLikeView()) refreshView(); }
function onLangChanged() { buildTabs(); buildRangeBar(); refreshView(); }

function chartLikeView() { return currentView === "param" || currentView === "geomag"; }

/* часовой пояс по координатам (Open-Meteo) */
async function loadTimezone() {
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${SETTINGS.lat}&longitude=${SETTINGS.lon}&timezone=auto&forecast_days=1`);
    const j = await r.json();
    if (typeof j.utc_offset_seconds === "number") TZ_OFFSET = j.utc_offset_seconds;
  } catch(e) { console.warn("tz:", e); }
}
function locDate(unix) { return new Date((unix + TZ_OFFSET) * 1000); }

function buildTabs() {
  const bar = document.getElementById("tabs");
  if (!bar) return;
  bar.innerHTML = "";
  PARAMS.forEach(p => {
    if (SETTINGS && SETTINGS.tabs && SETTINGS.tabs[p.key] === false) return;
    const tab = document.createElement("button");
    tab.className = "tab" + (currentView==="param" && p.key === currentKey ? " active" : "");
    tab.textContent = t(p.i18n);
    tab.onclick = () => { currentView="param"; currentKey = p.key; offsetSteps = 0; buildTabs(); refreshView(); };
    bar.appendChild(tab);
  });
  const sep = document.createElement("span"); sep.className = "tab-sep"; bar.appendChild(sep);
  EXTRA_TABS.forEach(it => {
    if (SETTINGS && SETTINGS.tabs && SETTINGS.tabs[it.id] === false) return;
    const label = it.label || t(it.i18n);
    const tab = document.createElement("button");
    tab.className = "tab tab-extra" + (currentView===it.id ? " active" : "");
    tab.textContent = label;
    tab.onclick = () => { currentView=it.id; offsetSteps=0; buildTabs(); refreshView(); };
    bar.appendChild(tab);
  });
}

function scrollTabs(dir) {
  const el = document.getElementById("tabs");
  const tab = el.querySelector(".tab");
  const step = tab ? tab.getBoundingClientRect().width + 8 : 120;
  el.scrollBy({ left: dir * step, behavior: "smooth" });
}

function buildRangeBar() {
  const bar = document.getElementById("range-bar");
  if (!bar) return;
  bar.innerHTML = "";
  if (!chartLikeView()) return;
  const render = () => currentView==="param" ? renderParam(currentKey) : renderGeomag();
  const rerender = () => { buildRangeBar(); render(); };   // перестраиваем панель → стрелки обновляют состояние
  const left = document.createElement("button");
  left.className = "range-btn arrow"; left.textContent = "‹";
  left.onclick = () => { offsetSteps++; rerender(); };
  const right = document.createElement("button");
  right.className = "range-btn arrow" + (offsetSteps === 0 ? " disabled" : "");
  right.textContent = "›"; right.title = t("to_now");
  right.onclick = () => { if (offsetSteps > 0) { offsetSteps--; rerender(); } };
  bar.appendChild(left);
  ["24h","week","month","year"].forEach(code => {
    const b = document.createElement("button");
    b.className = "range-btn" + (code === currentRange ? " active" : "");
    b.textContent = t(RANGES[code].i18n);
    b.onclick = () => { currentRange = code; offsetSteps = 0; rerender(); };
    bar.appendChild(b);
  });
  bar.appendChild(right);
}

function openViewSettings() {
  if (currentView === "param") openParamSettings();
  else if (currentView === "geomag") openGeomagSettings();
}

function refreshView() {
  const chartArea = document.getElementById("chart-box-wrap");
  const extra = document.getElementById("extra-view");
  const gear = document.getElementById("param-gear");
  buildRangeBar();
  if (chartLikeView()) {
    chartArea.style.display = "flex"; extra.style.display = "none"; gear.style.display = "flex";
    if (currentView === "param") renderParam(currentKey); else renderGeomag();
  } else {
    chartArea.style.display = "none"; extra.style.display = "block"; gear.style.display = "none";
    if (currentView === "api")       { document.getElementById("chart-title").textContent = "API OUT"; buildApiOut(); showExtra("api"); }
    if (currentView === "advice")    { document.getElementById("chart-title").textContent = t("tab_advice"); buildAdvice(); showExtra("advice"); }
    if (currentView === "smarthome") { document.getElementById("chart-title").textContent = t("tab_smart"); buildSmartHome(); showExtra("smarthome"); }
  }
}
function showExtra(which) {
  const ids = ["api-panel","advice-panel","smarthome-panel"];
  const map = { api:"api-panel", advice:"advice-panel", smarthome:"smarthome-panel" };
  ids.forEach(id => document.getElementById(id).style.display = (map[which]===id) ? "block" : "none");
}

async function loadSeries(serial, key, from, to) {
  const { data, error } = await client.from("measurements")
    .select("val, ts_device, src, provider")
    .eq("serial", serial).eq("key", key)
    .gte("ts_device", from).lte("ts_device", to)
    .order("ts_device", { ascending: true });
  if (error || !data) return [];
  return data;
}

/* окно для компаса (выравнивание не нужно) */
function windowRange() {
  const now = Math.floor(Date.now() / 1000);
  const span = RANGES[currentRange].sec;
  const to = now - offsetSteps * span;
  return { from: to - span, to, span };
}

/* окно графиков-параметров: привязано к локальной полуночи координат, шаг = ровно период */
function viewWindow() {
  const day = 86400;
  const now = Math.floor(Date.now()/1000);
  const midnight = Math.floor((now + TZ_OFFSET)/day)*day - TZ_OFFSET;
  const span = RANGES[currentRange].sec;
  const to = midnight + day - offsetSteps*span;
  const from = to - span;
  return { from, to, span };
}

/* подписи делений */
function tickLabel(v, from, step) {
  const p = n => String(n).padStart(2,"0");
  if (currentRange==="24h") return String(v*2);              // 0,2,…24
  const N = RANGES[currentRange].ticks;
  if (currentRange==="year") {
    if (v>=N) return "";
    const m = (locDate(from).getUTCMonth() + v) % 12;
    return MONTHS_ABBR[m];                                   // 12 месяцев
  }
  if (v>=N) return "";                                       // неделя/месяц: даты
  const d = locDate(from + v*step);
  return p(d.getUTCDate())+"."+p(d.getUTCMonth()+1);
}

function smoothJ305(points) {
  const W = 5;
  return points.map((pt, i) => {
    const from = Math.max(0, i - W + 1);
    const slice = points.slice(from, i + 1).map(p => p.y);
    const avg = slice.reduce((a,b)=>a+b,0) / slice.length;
    return { x: pt.x, y: pt.y > avg*1.8 ? pt.y : avg };
  });
}

async function renderParam(key) {
  if (currentView !== "param") return;
  const p = PARAMS.find(x => x.key === key);
  if (!p) return;
  if (p.type === "compass") { await renderCompass(p); return; }
  showCanvasGraph();

  const { from, span } = viewWindow();
  const ticks = RANGES[currentRange].ticks;
  const step = span / ticks;
  const to = from + span;

  const g = PARAM_UNIT_GROUP[p.key];
  const unitId = g ? SETTINGS.units[g] : null;
  const uLabel = paramUnitDisplay(p);
  const ci_ = SETTINGS.config_items;

  let sources = [];
  const outOk = ci_.dev_out !== false, inOk = ci_.dev_in !== false;
  if (p.loc === "out" || p.loc === "pressure") { if (outOk) sources = [{ sn:SETTINGS.sn_out, tag:t("outdoor") }]; }
  else if (p.loc === "in") { if (inOk) sources = [{ sn:SETTINGS.sn_in, tag:t("indoor") }]; }
  else { if (outOk) sources.push({ sn:SETTINGS.sn_out, tag:t("outdoor") }); if (inOk) sources.push({ sn:SETTINGS.sn_in, tag:t("indoor") }); }

  const provOk = prov => {
    if (prov.includes("meteo")) return ci_.open_meteo !== false;
    if (prov.includes("owm") || prov.includes("weather")) return ci_.owm !== false;
    if (prov.includes("yandex")) return ci_.yandex !== false;
    return true;
  };

  const datasets = [];
  const palette = ["#4db2ff","#ff9d4d","#a0ff6b","#ff6bce","#ffe14d","#b98cff","#6bd2ff"];
  let ci = 0;
  const lineDefs = p.lines ? p.lines : [{ dbkey: p.key, label: null, color: p.color }];

  for (const s of sources) {
    for (const ld of lineDefs) {
      const rows = await loadSeries(s.sn, ld.dbkey, from, to);
      if (rows.length === 0) continue;
      const groups = {};
      rows.forEach(r => {
        const prov = (r.provider || r.src || "sensor");
        if (!provOk(prov)) return;
        (groups[prov] = groups[prov] || []).push(r);
      });
      for (const gName in groups) {
        let pts = groups[gName].map(r => ({ x:(r.ts_device-from)/step, y: convertUnit(Number(r.val), g, unitId) }));
        if (p.algo === "j305") pts = smoothJ305(pts);
        let label = ld.label ? ld.label : (s.tag + " · " + gName);
        if (p.lines && sources.length > 1) label = s.tag + " " + ld.label;
        datasets.push({ label, data: pts, borderColor: ld.color||palette[ci%palette.length],
          backgroundColor:(ld.color||palette[ci%palette.length])+"22", fill:false, tension:0.3, pointRadius:2, spanGaps:false });
        ci++;
      }
    }
  }

  document.getElementById("chart-title").textContent = paramTopTitle(p) + (uLabel ? " (" + uLabel + ")" : "");
  document.getElementById("advice").textContent = t("advice_default");

  const isLight = getTheme() === "light";
  const gridColor = isLight ? "rgba(20,60,110,0.12)" : "rgba(120,190,255,0.15)";
  const tickColor = isLight ? "#0d2a4a" : "#eaf4ff";
  const xLabels = [];
  for (let i=0;i<=ticks;i++) xLabels.push(tickLabel(i, from, step));

  if (chart) { chart.destroy(); chart = null; }
  chart = new Chart(document.getElementById("chart"), {
    type:"line", data:{ datasets },
    options:{ responsive:true, maintainAspectRatio:false, parsing:false,
      interaction:{ mode:"nearest", intersect:false },
      plugins:{ legend:{ labels:{ color:tickColor } } },
      scales:{ x:{ type:"linear", min:0, max:ticks, grid:{ color:gridColor },
          ticks:{ color:tickColor, stepSize:1, autoSkip:false, maxRotation:0, callback:v=>xLabels[v]??"" } },
        y:{ grid:{ color:gridColor }, ticks:{ color:tickColor } } }
    },
    plugins:[paramWmPlugin]
  });
  chart.$bgLabel = bgDateLabel(from);
}

function fmtTick(unix, range) {
  const d = locDate(unix); const p = n => String(n).padStart(2,"0");
  if (range==="24h")  return p(d.getUTCHours());
  if (range==="week") return p(d.getUTCDate())+"."+p(d.getUTCMonth()+1);
  if (range==="month")return p(d.getUTCDate());
  return p(d.getUTCMonth()+1);
}

function showCanvasGraph() { document.getElementById("chart").style.display="block"; document.getElementById("compass").style.display="none"; }
function showCompass()     { document.getElementById("chart").style.display="none"; document.getElementById("compass").style.display="block"; }

async function renderCompass(p) {
  showCompass();
  document.getElementById("chart-title").textContent = t(p.i18n);
  document.getElementById("advice").textContent = t("advice_default");
  const { from, to } = windowRange();
  const rows = await loadSeries(SETTINGS.sn_out, "wind_dir", from, to);
  const bins = new Array(8).fill(0);
  rows.forEach(r => { let deg=((Number(r.val)%360)+360)%360; bins[Math.round(deg/45)%8]++; });
  const total = rows.length||1;
  drawCompass(bins.map(b=>b/total), rows.length ? Number(rows[rows.length-1].val) : null);
}

function drawCompass(freq, currentDeg) {
  const cv = document.getElementById("compass");
  const box = cv.parentElement;
  const dpr = window.devicePixelRatio||1;
  const avail = Math.min(box.clientWidth, box.clientHeight) - 24;
  const size = Math.max(120, avail);
  cv.width=size*dpr; cv.height=size*dpr; cv.style.width=size+"px"; cv.style.height=size+"px";
  const ctx = cv.getContext("2d"); ctx.setTransform(1,0,0,1,0,0); ctx.scale(dpr,dpr);
  const isLight=getTheme()==="light";
  const line=isLight?"#1e7fff":"#4db2ff", dim=isLight?"rgba(20,60,110,0.25)":"rgba(120,190,255,0.25)", txt=isLight?"#0d2a4a":"#eaf4ff";
  const cx=size/2, cy=size/2, R=size/2-30;
  ctx.clearRect(0,0,size,size); ctx.font="14px 'Exo 2',sans-serif"; ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.strokeStyle=dim; ctx.lineWidth=1;
  for(let k=1;k<=4;k++){ ctx.beginPath(); ctx.arc(cx,cy,R*k/4,0,Math.PI*2); ctx.stroke(); }
  const labels=t("COMPASS");
  for(let i=0;i<8;i++){ const ang=(i*45-90)*Math.PI/180; const x=cx+Math.cos(ang)*R,y=cy+Math.sin(ang)*R;
    ctx.strokeStyle=dim; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(x,y); ctx.stroke();
    ctx.fillStyle=txt; ctx.fillText(labels[i], cx+Math.cos(ang)*(R+16), cy+Math.sin(ang)*(R+16)); }
  const maxF=Math.max(...freq,0.0001);
  ctx.fillStyle=line+"55"; ctx.strokeStyle=line; ctx.lineWidth=2; ctx.beginPath();
  for(let i=0;i<=8;i++){ const idx=i%8; const ang=(idx*45-90)*Math.PI/180; const r=(freq[idx]/maxF)*R;
    const x=cx+Math.cos(ang)*r,y=cy+Math.sin(ang)*r; if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  if(currentDeg!==null && !isNaN(currentDeg)){ const ang=(currentDeg-90)*Math.PI/180;
    const x=cx+Math.cos(ang)*(R-6),y=cy+Math.sin(ang)*(R-6);
    ctx.strokeStyle=isLight?"#d02020":"#ff6b6b"; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(x,y); ctx.stroke();
    ctx.fillStyle=ctx.strokeStyle; ctx.beginPath(); ctx.arc(x,y,5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=txt; ctx.fillText(Math.round(currentDeg)+"°",cx,cy-10); ctx.fillText(t("wind_now"),cx,cy+10); }
}

async function refreshStatus() {
  document.getElementById("ver").textContent = t("version") + " " + APP_VERSION;
  document.getElementById("sn-out").textContent = SETTINGS.sn_out;
  document.getElementById("sn-in").textContent = SETTINGS.sn_in;
}

/* индикаторы устройств: красный, если нет данных дольше 3× интервала */
async function refreshDeviceDots() {
  const interval = (SETTINGS.send_interval_min || 5) * 60;
  const thr = 3 * interval;
  const now = Math.floor(Date.now()/1000);
  const list = [
    { sn:SETTINGS.sn_out, dot:"dot-out", on:SETTINGS.config_items.dev_out !== false },
    { sn:SETTINGS.sn_in,  dot:"dot-in",  on:SETTINGS.config_items.dev_in  !== false }
  ];
  for (const d of list) {
    const el = document.getElementById(d.dot);
    if (!el) continue;
    if (!d.on) { el.className = "dot dot-off"; continue; }
    try {
      const { data } = await client.from("measurements").select("ts_device")
        .eq("serial", d.sn).order("ts_device", { ascending:false }).limit(1);
      const fresh = data && data[0] && (now - Number(data[0].ts_device)) <= thr;
      el.className = "dot " + (fresh ? "dot-ok" : "dot-bad");
    } catch(e) { el.className = "dot dot-bad"; }
  }
}

async function startDashboard() {
  if (!(await guard())) return;
  document.body.style.visibility = "visible";
  await loadSettings();
  await loadTimezone();
  buildTabs(); buildRangeBar(); await refreshStatus();
  refreshView();
  refreshDeviceDots();
  setInterval(refreshDeviceDots, 60000);
  window.addEventListener("resize", () => { if (currentView==="param") renderParam(currentKey); });
}