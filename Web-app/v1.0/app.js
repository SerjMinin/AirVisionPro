/* 
 * Copyright (c) 2026 Минин Сергей Александрович.
 * Licensed under the GNU Affero General Public License v3.0.
 * See LICENSE file in the project root for full license information.
 */
/* AirVisionPro — движок дашборда. */

const APP_VERSION = "v1.0";
const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentKey = PARAMS[0].key;
let currentRange = "24h";
let offsetSteps = 0;
let fwdSteps = 0;   // на сколько суток вперёд реально есть прогноз
let chart = null;
let currentView = "param";
let TZ_OFFSET = 0;   // смещение часового пояса координат локации (сек)

const RANGES = {
  "24h":   { sec: 24*3600,     ticks: 12, i18n: "r_24h"   },  // 0,2…24
  "week":  { sec: 7*24*3600,   ticks: 7,  i18n: "r_week"  },  // 7 дней
  "month": { sec: 28*24*3600,  ticks: 4,  i18n: "r_month" },  // 4 недели
  "year":  { sec: 365*24*3600, ticks: 12, i18n: "r_year"  }   // 12 месяцев
};
const MONTHS_ABBR = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];
const MONTHS_FULL = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];

function bgDateLabel(unix){
  const d = locDate(unix);
  if (currentRange==="year")  return "";
  if (currentRange==="month") return String(d.getUTCFullYear());
  if (currentRange==="24h") return d.getUTCDate() + " " + MONTHS_FULL[d.getUTCMonth()] + " " + d.getUTCFullYear();
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
  hcho:"Формальдегид CH₂O", ch4:"Метан CH₄", co:"Угарный газ CO",
  co2:"Углекислый газ CO₂", nh3:"Аммиак NH₃", no:"Монооксид азота NO",
  no2:"Диоксид азота NO₂", o3:"Озон O₃", so2:"Диоксид серы SO₂",
  aqi:"AQI - Индекс качества воздуха"
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
function showLoader(){ const el=document.getElementById("loader"); if(el) el.classList.add("show"); }
function hideLoader(){ const el=document.getElementById("loader"); if(el) el.classList.remove("show"); }
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
    if (it.id === "geomag" && SETTINGS && SETTINGS.config_items && SETTINGS.config_items.geomag === false) return;
    if (SETTINGS && SETTINGS.tabs && SETTINGS.tabs[it.id] === false) return;
    const label = it.label || t(it.i18n);
    const tab = document.createElement("button");
    tab.className = "tab tab-extra" + (currentView===it.id ? " active" : "");
    tab.textContent = label;
    tab.onclick = () => { currentView=it.id; offsetSteps=0; buildTabs(); refreshView(); };
    bar.appendChild(tab);
  });
}

function scrollTabs(dir){
  const box = document.getElementById('tabs');
  if(!box) return;
  const tabs = box.querySelectorAll('.tab');
  if(!tabs.length) return;
  const left = box.scrollLeft, eps = 2;
  if(dir > 0){
    for(const t of tabs){
      if(t.offsetLeft + t.offsetWidth > left + box.clientWidth + eps){
        box.scrollTo({ left:t.offsetLeft, behavior:'smooth' }); return;
      }
    }
    box.scrollTo({ left:box.scrollWidth, behavior:'smooth' });
  } else {
    const goal = left - box.clientWidth;
    let target = 0;
    for(const t of tabs){ if(t.offsetLeft >= goal){ target = t.offsetLeft; break; } }
    box.scrollTo({ left:target, behavior:'smooth' });
  }
}

function buildRangeBar() {
  const bar = document.getElementById("range-bar");
  if (!bar) return;
  bar.innerHTML = "";
  if (!chartLikeView()) return;
  const render = () => currentView==="param" ? renderParam(currentKey) : renderGeomag();
  const rerender = () => { buildRangeBar(); render(); };   // перестраиваем панель → стрелки обновляют состояние
  const left = document.createElement("button");
  left.className = "range-btn arrow";
  left.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 6l-6 6 6 6"/></svg>';
  left.onclick = () => { offsetSteps++; rerender(); };
  const right = document.createElement("button");
  const fwd = (currentRange === "24h" && currentView !== "param") ? fwdSteps : 0;
  right.className = "range-btn arrow" + (offsetSteps <= -fwd ? " disabled" : "");
  right.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 6l6 6-6 6"/></svg>';
  right.title = t("to_now");
  right.onclick = () => { if (offsetSteps > -fwd) { offsetSteps--; rerender(); } };
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
  {
    const tabsOff = (SETTINGS && SETTINGS.tabs) || {};
    const cfgOff  = (SETTINGS && SETTINGS.config_items) || {};
    const hidden =
      (currentView === "param"  && tabsOff[currentKey] === false) ||
      (currentView === "geomag" && cfgOff.geomag === false) ||
      (currentView !== "param" && currentView !== "geomag" && tabsOff[currentView] === false);
    if (hidden) {
      const firstParam = PARAMS.find(p => tabsOff[p.key] !== false);
      if (firstParam) { currentView = "param"; currentKey = firstParam.key; }
      buildTabs();
    }
  }
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

async function loadWeatherSeries(source, param, from, to) {
  const fromIso = new Date(from*1000).toISOString();
  const toIso   = new Date(to*1000).toISOString();
  const all = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await client.from("weather")
      .select("val, ts_utc")
      .eq("source", source).eq("param", param).eq("kind", "current")
      .gte("ts_utc", fromIso).lte("ts_utc", toIso)
      .order("ts_utc", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error || !data || !data.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
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
  const fcst = (currentRange !== "24h" && offsetSteps === 0) ? 3*day : 0;
  const to = midnight + day + fcst - offsetSteps*span;
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

let renderParamToken = 0;
async function renderParam(key) {
  if (currentView !== "param") return;
  const myToken = ++renderParamToken;
  const p = PARAMS.find(x => x.key === key);
  if (!p) return;
  if (p.type === "compass") { await renderCompass(p); return; }
  showCanvasGraph();
  showLoader();

  const { from, span } = viewWindow();
  const ticks = RANGES[currentRange].ticks;
  const step = span / ticks;
  const to = from + span;
  const nowSec = Math.floor(Date.now()/1000);
  const g = PARAM_UNIT_GROUP[p.key];
  const unitId = g ? SETTINGS.units[g] : null;
  const uLabel = paramUnitDisplay(p);
  const ci_ = SETTINGS.config_items;

  const datasets = [];
  const palette = ["#4db2ff","#ff9d4d","#a0ff6b","#ff6bce","#ffe14d","#b98cff","#6bd2ff"];
  let ci = 0;

  // ===== реальные устройства (таблица measurements), по карте «параметр → вкладка вывода» =====
  for (const which of ["out","in"]) {
    if (ci_["dev_"+which] !== true) continue;
    const sn = which === "out" ? SETTINGS.sn_out : SETTINGS.sn_in;
    if (!sn) continue;
    const dmap = (SETTINGS.devices && SETTINGS.devices[which] && SETTINGS.devices[which].map) || {};
    for (const dk in dmap) {
      if (dmap[dk] === "no") continue;
      if (dmap[dk] !== p.key) continue;
      const rows = await loadSeries(sn, dk, from, to);
      if (!rows.length) continue;
      let pts = rows.map(r => ({ x:(r.ts_device - from)/step, y: convertUnit(Number(r.val), g, unitId) }));
      if (p.algo === "j305") pts = smoothJ305(pts);
      const col = palette[ci % palette.length];
      datasets.push({ label: dk, data: pts, borderColor: col,
        backgroundColor: col+"22", fill:false, tension:0.3, pointRadius:2, spanGaps:false });
      ci++;
    }
  }

  // ===== интернет-источники (таблица weather), ФАКТ = сплошная линия =====
  const WEATHER_SOURCES = [
    { source:"open-meteo",     cfg:"open_meteo",     prefix:"iOM_",
      names:(typeof OPENMETEO_NAMES!=="undefined"?OPENMETEO_NAMES:{}),
      defMap:(typeof OPENMETEO_DEFAULT_MAP!=="undefined"?OPENMETEO_DEFAULT_MAP:{}) },
    { source:"open-meteo-air", cfg:"open_meteo_air", prefix:"iOA_",
      names:(typeof AIRQUALITY_NAMES!=="undefined"?AIRQUALITY_NAMES:{}),
      defMap:(typeof AIRQUALITY_DEFAULT_MAP!=="undefined"?AIRQUALITY_DEFAULT_MAP:{}) },
    { source:"owm",            cfg:"owm",            prefix:"iOWM_",
      names:(typeof OWM_NAMES!=="undefined"?OWM_NAMES:{}),
      defMap:(typeof OWM_DEFAULT_MAP!=="undefined"?OWM_DEFAULT_MAP:{}) }
  ];
  for (const ws of WEATHER_SOURCES) {
    if (ci_[ws.cfg] === false) continue;
    const gs = (SETTINGS.weather_sources && SETTINGS.weather_sources[ws.source]) || {};
    const wmap = (gs.map && Object.keys(gs.map).length) ? gs.map : ws.defMap;
    for (const param in wmap) {
      if (wmap[param] === "no") continue;
      if (wmap[param] !== p.key) continue;
      const rows = await loadWeatherSeries(ws.source, param, from, to);
      const factPts = rows.map(r => ({ x:(Date.parse(r.ts_utc)/1000 - from)/step, y:convertUnit(Number(r.val), g, unitId) }));
      let fcstPts = [];
      if (offsetSteps === 0) {                       // прогноз только на «сейчас», при перемотке назад — нет
       const fRows = await loadWeatherForecast(ws.source, param);
        const lastFactTs = rows.length ? Math.floor(Date.parse(rows[rows.length-1].ts_utc)/1000) : nowSec;
        fcstPts = fRows
          .filter(o => o.ts > lastFactTs && o.ts <= to)  // держим в пределах окна, дальше — за горизонт
          .map(o => ({ x:(o.ts - from)/step, y:convertUnit(Number(o.val), g, unitId) }));
      }
      let pts = factPts.concat(fcstPts).sort((a,b)=>a.x-b.x);
      if (!pts.length) continue;
      const gapX = (6*3600)/step;                 // дыра в данных > 6 часов → разрыв линии
      const withGaps = [];
      for (let i=0;i<pts.length;i++){
        if (i>0 && pts[i].x - pts[i-1].x > gapX) withGaps.push({ x:(pts[i-1].x+pts[i].x)/2, y:null });
        withGaps.push(pts[i]);
      }
      pts = withGaps;
      const col = palette[ci % palette.length];
      const nm = (param in ws.names ? ws.names[param] : param);
      const nowXw = (nowSec - from)/step;
      datasets.push({ label: ws.prefix + nm, data: pts,
        borderColor: col, backgroundColor: col+"22", fill:false, tension:0.3,
        pointRadius:2, spanGaps:false,
        segment:{ borderDash: c => (c.p1.parsed.x > nowXw ? [6,4] : undefined) } });
      ci++;
    }
  }

  document.getElementById("chart-title").textContent = paramTopTitle(p) + (uLabel ? " (" + uLabel + ")" : "");
  document.getElementById("advice").textContent = t("advice_default");

  const isLight = getTheme() === "light";
  const gridColor = isLight ? "rgba(20,60,110,0.12)" : "rgba(120,190,255,0.15)";
  const tickColor = isLight ? "#0d2a4a" : "#eaf4ff";
  await addFeelsLike(p, datasets, from, to, step, g, unitId, nowSec);
  visApply(p, datasets);
  const xLabels = [];
  for (let i=0;i<=ticks;i++) xLabels.push(tickLabel(i, from, step));
  if (myToken !== renderParamToken) { hideLoader(); return; }

  const savedColors = (SETTINGS.line_colors && SETTINGS.line_colors[p.key]) || {};
    datasets.forEach(ds => {
      const c = savedColors[ds.label];
      if (c){ ds.borderColor = c; ds.backgroundColor = c + "22";
        if (ds.pointBackgroundColor) ds.pointBackgroundColor = c;
        if (ds.pointBorderColor) ds.pointBorderColor = c; }
    });

  if (chart) { chart.destroy(); chart = null; }
  chart = new Chart(document.getElementById("chart"), {
    type:"line", data:{ datasets },
    options:{ responsive:true, maintainAspectRatio:false, parsing:false,
      interaction:{ mode:"nearest", intersect:false },
      plugins:{ legend:{
        onClick:(e,item,leg)=>handleLineLegendClick(leg.chart,item.datasetIndex),
        labels:{ color:tickColor, usePointStyle:true, pointStyle:"line", boxWidth:28 } } },
      scales:{ x:{ type:"linear", min:0, max:ticks, grid:{ color:gridColor },
          ticks:{ color:tickColor, stepSize:1, autoSkip:false, maxRotation:0, callback:v=>xLabels[v]??"" } },
        y:{ grid:{ color:gridColor }, ticks:{ color:tickColor } } }
    },
    plugins:[paramWmPlugin, zeroLinePlugin]
  });
  chart.$bgLabel = bgDateLabel(from);
  chart.$zeroY = (g === "temp") ? convertUnit(0, g, unitId) : null;
  chart.$zeroText = (g === "temp") ? (Math.round(convertUnit(0, g, unitId)) + (uLabel ? " " + uLabel : "")) : "";
  hideLoader();
}

/* линия 0 °C (точка замерзания): рисуется, только если 0 попадает в видимую шкалу */
const zeroLinePlugin = {
  id:"zeroline",
  beforeDatasetsDraw(chart){
    if (chart.$zeroY === null || chart.$zeroY === undefined) return;
    const y = chart.scales.y;
    if (!y || chart.$zeroY < y.min || chart.$zeroY > y.max) return;
    const { ctx, chartArea } = chart;
    const py = y.getPixelForValue(chart.$zeroY);
    const isLight = getTheme() === "light";
    const col = isLight ? "rgba(30,110,200,0.85)" : "rgba(140,210,255,0.85)";
    ctx.save();
    ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    ctx.setLineDash([10,4,2,4]);
    ctx.beginPath(); ctx.moveTo(chartArea.left, py); ctx.lineTo(chartArea.right, py); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = col; ctx.font = "11px 'Exo 2',sans-serif";
    ctx.textAlign = "right"; ctx.textBaseline = "bottom";
    ctx.fillText(chart.$zeroText, chartArea.right - 4, py - 2);
    ctx.restore();
  }
};

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
  showLoader();
  document.getElementById("chart-title").textContent = t(p.i18n);
  document.getElementById("advice").textContent = t("advice_default");
  const { from, to } = windowRange();
  const ci_ = SETTINGS.config_items;
  const palette = ["#4db2ff","#ff9d4d","#a0ff6b","#ff6bce","#ffe14d","#b98cff","#6bd2ff"];
  const saved = (SETTINGS.line_colors && SETTINGS.line_colors[p.key]) || {};
  const series = [];
  let ci = 0;
  const pushSeries = (label, rows, getTs, getVal) => {
    if (!rows || !rows.length) return;
    const vals = rows.map(r => ({ ts:getTs(r), val:Number(getVal(r)) })).filter(v => !isNaN(v.val));
    if (!vals.length) return;
    vals.sort((a,b) => a.ts - b.ts);
    series.push({ label, color: saved[label] || palette[ci % palette.length], vals });
    ci++;
  };

  // реальные устройства (по карте)
  for (const which of ["out","in"]) {
    if (ci_["dev_"+which] !== true) continue;
    const sn = which === "out" ? SETTINGS.sn_out : SETTINGS.sn_in;
    if (!sn) continue;
    const dmap = (SETTINGS.devices && SETTINGS.devices[which] && SETTINGS.devices[which].map) || {};
    for (const dk in dmap) {
      if (dmap[dk] !== p.key) continue;
      const rows = await loadSeries(sn, dk, from, to);
      pushSeries(dk, rows, r => Number(r.ts_device), r => r.val);
    }
  }
  // интернет-источники (по карте)
  const WSRC = [
    { source:"open-meteo",     cfg:"open_meteo",     prefix:"iOM_",  names:(typeof OPENMETEO_NAMES!=="undefined"?OPENMETEO_NAMES:{}),   defMap:(typeof OPENMETEO_DEFAULT_MAP!=="undefined"?OPENMETEO_DEFAULT_MAP:{}) },
    { source:"open-meteo-air", cfg:"open_meteo_air", prefix:"iOA_",  names:(typeof AIRQUALITY_NAMES!=="undefined"?AIRQUALITY_NAMES:{}),  defMap:(typeof AIRQUALITY_DEFAULT_MAP!=="undefined"?AIRQUALITY_DEFAULT_MAP:{}) },
    { source:"owm",            cfg:"owm",            prefix:"iOWM_", names:(typeof OWM_NAMES!=="undefined"?OWM_NAMES:{}),         defMap:(typeof OWM_DEFAULT_MAP!=="undefined"?OWM_DEFAULT_MAP:{}) }
  ];
  for (const ws of WSRC) {
    if (ci_[ws.cfg] === false) continue;
    const gs = (SETTINGS.weather_sources && SETTINGS.weather_sources[ws.source]) || {};
    const wmap = (gs.map && Object.keys(gs.map).length) ? gs.map : ws.defMap;
    for (const param in wmap) {
      if (wmap[param] !== p.key) continue;
      const rows = await loadWeatherSeries(ws.source, param, from, to);
      const nm = (param in ws.names ? ws.names[param] : param);
      pushSeries(ws.prefix + nm, rows, r => Date.parse(r.ts_utc)/1000, r => r.val);
    }
  }

  drawCompass(series);
  hideLoader();
}

/* ===== клики по легенде компаса ===== */
let compassSeries = [], compassLegendRects = [], compassHidden = {}, compassClickBound = false;
let cmpLastLabel = null, cmpLastTime = 0, cmpTimer = null;

function bindCompassLegend(){
  if (compassClickBound) return;
  compassClickBound = true;
  const cv = document.getElementById("compass");
  cv.addEventListener("click", e => {
    const rect = cv.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const hit = compassLegendRects.find(r => x>=r.x0 && x<=r.x1 && y>=r.y0 && y<=r.y1);
    if (!hit) return;
    const now = Date.now();
    if (hit.label === cmpLastLabel && now - cmpLastTime < 300){   // двойной → скрыть/показать
      clearTimeout(cmpTimer); cmpLastTime = 0; cmpLastLabel = null;
      compassHidden[hit.label] = !compassHidden[hit.label];
      renderParam(currentKey);
      return;
    }
    cmpLastLabel = hit.label; cmpLastTime = now;               // одиночный → палитра
    cmpTimer = setTimeout(() => { cmpLastTime = 0; cmpLastLabel = null; openLineColorCompass(hit.label, hit.color); }, 300);
  });
}

function openLineColorCompass(label, colorHex){
  lcIdx = -1; lcLabel = label;
  document.getElementById("linecolor-title").textContent = label;
  setLineColorPreview(normHex(colorHex) || "#4db2ff");
  buildLineSwatches();
  document.getElementById("linecolor-modal").classList.add("open");
}

function smoothClosed(ctx, pts){
  const n = pts.length;
  ctx.beginPath();
  ctx.moveTo((pts[n-1].x+pts[0].x)/2, (pts[n-1].y+pts[0].y)/2);
  for (let i=0;i<n;i++){
    const p1=pts[i], p2=pts[(i+1)%n];
    ctx.quadraticCurveTo(p1.x, p1.y, (p1.x+p2.x)/2, (p1.y+p2.y)/2);
  }
  ctx.closePath();
}

function drawWindStar(ctx, cx, cy, R, isLight, line){
  const light = isLight ? "#dbe9ff" : "#cfe6ff";
  const dark  = isLight ? "#0d2a4a" : "#12406e";
  const baseR = R*0.13;
  const drawPoint = (i, tipR) => {
    const at=(i*45-90)*Math.PI/180, aL=((i*45-45)-90)*Math.PI/180, aR=((i*45+45)-90)*Math.PI/180;
    const tx=cx+Math.cos(at)*tipR, ty=cy+Math.sin(at)*tipR;
    const lx=cx+Math.cos(aL)*baseR, ly=cy+Math.sin(aL)*baseR;
    const rx=cx+Math.cos(aR)*baseR, ry=cy+Math.sin(aR)*baseR;
    ctx.strokeStyle=line; ctx.lineWidth=1;
    ctx.fillStyle=light; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(lx,ly); ctx.lineTo(tx,ty); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle=dark;  ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(tx,ty); ctx.lineTo(rx,ry); ctx.closePath(); ctx.fill(); ctx.stroke();
  };
  for(let i=1;i<8;i+=2) drawPoint(i, R*0.55);
  for(let i=0;i<8;i+=2) drawPoint(i, R);
  ctx.lineWidth=1;
}

function drawCompass(series) {
  const cv = document.getElementById("compass");
  const box = cv.parentElement;
  const dpr = window.devicePixelRatio||1;
  const avail = Math.min(box.clientWidth, box.clientHeight) - 24;
  const size = Math.max(120, avail);
  cv.width=size*dpr; cv.height=size*dpr; cv.style.width=size+"px"; cv.style.height=size+"px";
  const ctx = cv.getContext("2d"); ctx.setTransform(1,0,0,1,0,0); ctx.scale(dpr,dpr);
  const isLight=getTheme()==="light";
  const dim=isLight?"rgba(20,60,110,0.25)":"rgba(120,190,255,0.25)", txt=isLight?"#0d2a4a":"#eaf4ff";
  const line=isLight?"#1e7fff":"#4db2ff";
  const topPad = 34;
  const cx = size/2;
  const cy = topPad + (size - topPad)/2;
  const R = (size - topPad)/2 - 30;
  ctx.clearRect(0,0,size,size); ctx.font="14px 'Exo 2',sans-serif"; ctx.textAlign="center"; ctx.textBaseline="middle";
  // кольца
  ctx.strokeStyle=dim; ctx.lineWidth=1;
  for(let k=1;k<=4;k++){ ctx.beginPath(); ctx.arc(cx,cy,R*k/4,0,Math.PI*2); ctx.stroke(); }
  // стороны света + спицы
  const labels=t("COMPASS");
  for(let i=0;i<8;i++){ const ang=(i*45-90)*Math.PI/180; const x=cx+Math.cos(ang)*R,y=cy+Math.sin(ang)*R;
    ctx.strokeStyle=dim; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(x,y); ctx.stroke();
    ctx.fillStyle=txt; ctx.fillText(labels[i], cx+Math.cos(ang)*(R+16), cy+Math.sin(ang)*(R+16)); }
  // звезда-подложка
  drawWindStar(ctx, cx, cy, R, isLight, line);
  // ===== линии источников поверх =====
  compassSeries = series || [];
  (series||[]).forEach(s => {
    if (compassHidden[s.label]) return;
    const bins = new Array(8).fill(0);
    s.vals.forEach(v => { let deg=((v.val%360)+360)%360; bins[Math.round(deg/45)%8]++; });
    const maxF = Math.max(...bins, 1);
    const pts = [];
    for(let i=0;i<8;i++){ const ang=(i*45-90)*Math.PI/180; const r=(bins[i]/maxF)*R;
      pts.push({ x:cx+Math.cos(ang)*r, y:cy+Math.sin(ang)*r }); }
    smoothClosed(ctx, pts);
    ctx.fillStyle=s.color+"22"; ctx.fill();
    ctx.strokeStyle=s.color; ctx.lineWidth=2.5; ctx.stroke();
  });

  // ===== легенда источников (по центру сверху, в ряд) =====
  ctx.textBaseline="middle"; ctx.font="13px 'Exo 2',sans-serif";
  const items = (series||[]).map(s => ({ label:s.label, color:s.color, w: ctx.measureText(s.label).width }));
  const lineGap = 8, swatch = 22, itemGap = 22;
  const totalW = items.reduce((a,it) => a + swatch + lineGap + it.w + itemGap, 0) - itemGap;
  let lx = cx - totalW/2;
  const ly = 12;
  ctx.textAlign="left";
  compassLegendRects = [];
  items.forEach(it => {
    const hidden = compassHidden[it.label];
    ctx.globalAlpha = hidden ? 0.4 : 1;
    ctx.strokeStyle=it.color; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx+swatch, ly); ctx.stroke();
    ctx.fillStyle=txt; ctx.fillText(it.label, lx+swatch+lineGap, ly);
    if (hidden){
      ctx.strokeStyle=txt; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(lx+swatch+lineGap, ly); ctx.lineTo(lx+swatch+lineGap+it.w, ly); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    compassLegendRects.push({ label:it.label, color:it.color, x0:lx, x1:lx+swatch+lineGap+it.w, y0:ly-9, y1:ly+9 });
    lx += swatch + lineGap + it.w + itemGap;
  });
  bindCompassLegend();
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
    { sn:SETTINGS.sn_out, key:SETTINGS.sn_out_key, dot:"dot-out", on:SETTINGS.config_items.dev_out === true },
    { sn:SETTINGS.sn_in,  key:SETTINGS.sn_in_key,  dot:"dot-in",  on:SETTINGS.config_items.dev_in  === true }
  ];
  for (const d of list) {
    const el = document.getElementById(d.dot);
    if (!el) continue;
    if (!d.on || !d.sn || !d.key) { el.className = "dot dot-off"; continue; }
    try {
      const { data } = await client.from("measurements").select("ts_device")
        .eq("serial", d.sn).order("ts_device", { ascending:false }).limit(1);
      const fresh = data && data[0] && (now - Number(data[0].ts_device)) <= thr;
      el.className = "dot " + (fresh ? "dot-ok" : "dot-bad");
    } catch(e) { el.className = "dot dot-bad"; }
  }
}

/* ===== цвет линии графика ===== */
let lcIdx = -1, lcTimer = null, lcLastIdx = -1, lcLastTime = 0, lcLabel = null;

function handleLineLegendClick(ch, idx){
  const now = Date.now();
  if (idx === lcLastIdx && now - lcLastTime < 300){   // двойной клик → спрятать/показать
    clearTimeout(lcTimer); lcLastTime = 0; lcLastIdx = -1;
    ch.setDatasetVisibility(idx, !ch.isDatasetVisible(idx)); ch.update();
    return;
  }
  lcLastIdx = idx; lcLastTime = now;                  // одиночный клик → палитра
  lcTimer = setTimeout(() => { lcLastTime = 0; lcLastIdx = -1; openLineColor(idx); }, 300);
}

function normHex(c){
  if (typeof c !== "string") return null;
  c = c.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c.toLowerCase();
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? rgbToHex(+m[1],+m[2],+m[3]) : null;
}
function rgbToHex(r,g,b){ return "#"+[r,g,b].map(x=>Math.max(0,Math.min(255,x|0)).toString(16).padStart(2,"0")).join(""); }
function hexToRgb(h){ return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]; }
function setLineColorPreview(hex){
  document.getElementById("linecolor-preview").style.background = hex;
  const [r,g,b] = hexToRgb(hex);
  document.getElementById("lc_r").value = r;
  document.getElementById("lc_g").value = g;
  document.getElementById("lc_b").value = b;
}
function lcCurrentHex(){ return rgbToHex(+document.getElementById("lc_r").value,+document.getElementById("lc_g").value,+document.getElementById("lc_b").value); }
function lcOnRgbInput(){ document.getElementById("linecolor-preview").style.background = lcCurrentHex(); }
function buildLineSwatches(){
  const cols = ["#d41a1a","#c45e5e","#d80aab","#bd53af","#da6d00","#db922b","#d3bb8e","#d3c89a",
                "#0c19d4","#4c54c4","#8384ce","#03d3c8","#4bd6d6","#8bdad2","#0adf11","#63ca5f"];
  const box = document.getElementById("linecolor-swatches");
  box.style.display = "grid";
  box.style.gridTemplateColumns = "repeat(8, 1fr)";
  box.style.gap = "8px";
  box.innerHTML = cols.map(c =>
    `<button type="button" onclick="setLineColorPreview('${c}')" style="width:100%;aspect-ratio:1;border-radius:6px;border:1px solid rgba(255,255,255,0.25);background:${c};cursor:pointer;"></button>`
  ).join("");
}
function openLineColor(idx){
  if (!chart || !chart.data.datasets[idx]) return;
  lcIdx = idx;
  const ds = chart.data.datasets[idx];
  lcLabel = ds.label;
  document.getElementById("linecolor-title").textContent = ds.label;
  setLineColorPreview(normHex(ds.borderColor) || "#4db2ff");
  buildLineSwatches();
  document.getElementById("linecolor-modal").classList.add("open");
}
function closeLineColor(){ document.getElementById("linecolor-modal").classList.remove("open"); }
async function saveLineColor(){
  if (!lcLabel) return;
  const hex = lcCurrentHex();
  const label = lcLabel;
  if (!SETTINGS.line_colors) SETTINGS.line_colors = {};
  if (!SETTINGS.line_colors[currentKey]) SETTINGS.line_colors[currentKey] = {};
  SETTINGS.line_colors[currentKey][label] = hex;
  await saveSettings();
  closeLineColor();
  renderParam(currentKey);
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
/* ===== Температура: линия «AV_Ощущается как» ===== */
function feelsLikeC0(T, rh, windMs) {
  let dWC = 0, dHI = 0;
  if (windMs != null) {
    const V = windMs * 3.6;
    if (V > 4.8) {
      const v = Math.pow(V, 0.16);
      dWC = Math.min(0, 13.12 + 0.6215*T - 11.37*v + 0.3965*T*v - T);
    }
  }
  if (rh != null) {
    const F = T*9/5 + 32;
    let hi = (0.5*(F + 61 + (F-68)*1.2 + rh*0.094) + F) / 2;
    if (hi >= 80) {
      hi = -42.379 + 2.04901523*F + 10.14333127*rh - 0.22475541*F*rh - 0.00683783*F*F
         - 0.05481717*rh*rh + 0.00122874*F*F*rh + 0.00085282*F*rh*rh - 0.00000199*F*F*rh*rh;
    }
    dHI = Math.max(0, (hi - 32)*5/9 - T);
  }
  const w = Math.min(1, Math.max(0, (T - 10) / 17));
  return T + (1 - w)*dWC + w*dHI;
}
function tdWebParam(source, kind) {
  const defs = { "open-meteo": (typeof OPENMETEO_DEFAULT_MAP !== "undefined" ? OPENMETEO_DEFAULT_MAP : {}),
                 "owm": (typeof OWM_DEFAULT_MAP !== "undefined" ? OWM_DEFAULT_MAP : {}) };
  const gs = (SETTINGS.weather_sources && SETTINGS.weather_sources[source]) || {};
  const map = (gs.map && Object.keys(gs.map).length) ? gs.map : (defs[source] || {});
  const skip = /apparent|feels|dew|gust/i;
  for (const k in map) if (map[k] === kind && !skip.test(k)) return k;
  return null;
}
async function tdWeb(source, kind, from, to) {
  const cfgId = source === "owm" ? "owm" : "open_meteo";
  if (SETTINGS.config_items[cfgId] === false) return [];
  const param = tdWebParam(source, kind);
  if (!param) return [];
  const k = (source === "open-meteo" && kind === "wind_spd") ? 1 : 1;
  const rows = await loadWeatherSeries(source, param, from, to);
  const out = rows.map(r => ({ ts: Date.parse(r.ts_utc)/1000, val: Number(r.val)*k }));
  if (offsetSteps === 0 && typeof loadWeatherForecast === "function") {
    const last = out.length ? out[out.length-1].ts : Math.floor(Date.now()/1000);
    const f = await loadWeatherForecast(source, param);
    (f || []).forEach(o => { if (o.ts > last && o.ts <= to) out.push({ ts: o.ts, val: Number(o.val)*k }); });
  }
  return out;
}
function tdWebParam0(source, kind) {
  const defs = { "open-meteo": (typeof OPENMETEO_DEFAULT_MAP !== "undefined" ? OPENMETEO_DEFAULT_MAP : {}),
                 "owm": (typeof OWM_DEFAULT_MAP !== "undefined" ? OWM_DEFAULT_MAP : {}) };
  const gs = (SETTINGS.weather_sources && SETTINGS.weather_sources[source]) || {};
  const map = (gs.map && Object.keys(gs.map).length) ? gs.map : (defs[source] || {});
  for (const k in map) if (map[k] === kind) return k;
  return null;
}
async function tdWeb0(source, kind, from, to) {
  const cfgId = source === "owm" ? "owm" : "open_meteo";
  if (SETTINGS.config_items[cfgId] === false) return [];
  const param = tdWebParam(source, kind);
  if (!param) return [];
  const rows = await loadWeatherSeries(source, param, from, to);
  const out = rows.map(r => ({ ts: Date.parse(r.ts_utc)/1000, val: Number(r.val) }));
  if (offsetSteps === 0 && typeof loadWeatherForecast === "function") {
    const last = out.length ? out[out.length-1].ts : Math.floor(Date.now()/1000);
    const f = await loadWeatherForecast(source, param);
    (f || []).forEach(o => { if (o.ts > last && o.ts <= to) out.push({ ts: o.ts, val: Number(o.val) }); });
  }
  return out;
}
async function tdDev(kind, from, to) {
  if (SETTINGS.config_items.dev_out !== true || !SETTINGS.sn_out) return [];
  const dmap = (SETTINGS.devices && SETTINGS.devices.out && SETTINGS.devices.out.map) || {};
  for (const dk in dmap) if (dmap[dk] === kind) {
    const rows = await loadSeries(SETTINGS.sn_out, dk, from, to);
    return rows.map(r => ({ ts: Number(r.ts_device), val: Number(r.val) }));
  }
  return [];
}
async function tdSeries(kind, src, from, to) {
  if (src === "dev") return tdDev(kind, from, to);
  if (src === "open-meteo" || src === "owm") return tdWeb(src, kind, from, to);
  const dev = await tdDev(kind, from, to);
  const om  = await tdWeb("open-meteo", kind, from, to);
  if (!dev.length) return om;
  const last = dev[dev.length-1].ts;
  return dev.concat(om.filter(o => o.ts > last));
}
function tdNear(arr, ts) {
  if (!arr.length) return null;
  let lo = 0, hi = arr.length - 1;
  while (lo < hi) { const m = Math.floor((lo + hi) / 2); if (arr[m].ts < ts) lo = m + 1; else hi = m; }
  let best = arr[lo];
  if (lo > 0 && Math.abs(arr[lo-1].ts - ts) < Math.abs(best.ts - ts)) best = arr[lo-1];
  return Math.abs(best.ts - ts) <= 5400 ? best.val : null;
}
async function addFeelsLike(p, datasets, from, to, step, g, unitId, nowSec) {
  if (g !== "temp") return;
  const cfg = SETTINGS.temp_danger || {};
  if (cfg.on === false) return;
  const clean = a => a.filter(o => !isNaN(o.val)).sort((x, y) => x.ts - y.ts);
  const T = clean(await tdSeries("temp", cfg.temp || "auto", from, to));
  if (!T.length) return;
  const RH = clean(await tdSeries("rh", cfg.rh || "auto", from, to));
  const W  = clean(await tdSeries("wind_spd", cfg.wind || "auto", from, to));
  const gapX = (6*3600) / step;
  const pts = [];
  T.forEach(o => {
    const x = (o.ts - from) / step;
    if (pts.length && x - pts[pts.length-1].x > gapX) pts.push({ x: (pts[pts.length-1].x + x) / 2, y: null });
    pts.push({ x, y: convertUnit(feelsLikeC(o.val, tdNear(RH, o.ts), tdNear(W, o.ts)), "temp", unitId) });
  });
  const nowX = (nowSec - from) / step;
  const col = "#ff4d4d";
  datasets.push({ label: "AV_" + t("td_feels"), data: pts, borderColor: col, backgroundColor: col + "22",
    fill: false, tension: 0.3, pointRadius: 0, spanGaps: false,
    segment: { borderDash: c => (c.p1.parsed.x > nowX ? [6,4] : undefined) } });
}
/* надпись линии «AV_Ощущается как» на 11 языках */
const I18N_FEELS = { en:"Feels like", ru:"Ощущается как", "zh-CN":"体感温度", "zh-TW":"體感溫度",
  es:"Sensación térmica", ar:"درجة الحرارة المحسوسة", hi:"महसूस होता है", "pt-BR":"Sensação térmica",
  fr:"Ressenti", de:"Gefühlt", ja:"体感温度" };
for (const l in I18N_FEELS) I18N[l].td_feels = I18N_FEELS[l];
/* «Ощущается как»: поправка на ветер включается плавно, без ступеньки */
function feelsLikeC(T, rh, windMs) {
  let dWC = 0, dHI = 0;
  if (windMs != null) {
    const V = windMs * 3.6;
    if (V > 0) {
      const v = Math.pow(Math.max(V, 4.8), 0.16);
      const wc = 13.12 + 0.6215*T - 11.37*v + 0.3965*T*v - T;
      dWC = Math.min(0, wc) * Math.min(1, V / 4.8);
    }
  }
  if (rh != null) {
    const F = T*9/5 + 32;
    let hi = (0.5*(F + 61 + (F-68)*1.2 + rh*0.094) + F) / 2;
    if (hi >= 80) {
      hi = -42.379 + 2.04901523*F + 10.14333127*rh - 0.22475541*F*rh - 0.00683783*F*F
         - 0.05481717*rh*rh + 0.00122874*F*F*rh + 0.00085282*F*rh*rh - 0.00000199*F*F*rh*rh;
    }
    dHI = Math.max(0, (hi - 32)*5/9 - T);
  }
  const w = Math.min(1, Math.max(0, (T - 10) / 17));
  return T + (1 - w)*dWC + w*dHI;
}
// Пыльца: шкала снизу всегда от нуля, без отрицательных значений
if (typeof Chart !== "undefined") {
  Chart.register({
    id: "pollenZeroBase",
    beforeUpdate: function (chart) {
      if (typeof currentKey === "undefined" || (currentKey !== "pollen" && currentKey !== "precip")) return;
      var sc = chart.options && chart.options.scales;
      if (!sc) return;
      Object.keys(sc).forEach(function (id) {
        if (id.charAt(0) === "x" || (sc[id] && sc[id].axis === "x")) return;
        sc[id].min = 0;
        sc[id].beginAtZero = true;
        if (sc[id].suggestedMax === undefined) sc[id].suggestedMax = 1;
      });
    }
  });
}
/* ===== Видимость: пыль и AOD умножаются, чтобы лежать рядом с видимостью (м) ===== */
function visKs() {
  const k = SETTINGS.vis_k || {};
  return { dust: (k.dust > 0 ? k.dust : 100), aod: (k.aod > 0 ? k.aod : 1000) };
}
function visApply(p, datasets) {
  if (!p || p.key !== "vis") return;
  const k = visKs();
  datasets.forEach(ds => {
    let m = 1;
    if (/depth|aod|оптич|плотн|толщ/i.test(ds.label)) m = k.aod;
    else if (/dust|пыль/i.test(ds.label)) m = k.dust;
    if (m === 1) return;
    ds.$k = m;
    ds.data = ds.data.map(pt => pt.y == null ? pt : { x: pt.x, y: pt.y * m });
  });
}
/* подсказка при наведении: настоящее значение (без множителя) */
if (typeof Chart !== "undefined") {
  Chart.defaults.plugins.tooltip.callbacks.label = function (ctx) {
    let l = ctx.dataset.label || "";
    if (l) l += ": ";
    let y = ctx.parsed.y;
    if (y != null) {
      if (ctx.dataset.$k) l += Math.round(y / ctx.dataset.$k * 100) / 100;
      else l += ctx.formattedValue;
    }
    return l;
  };
}
/* заголовок вкладки «Видимость» */
const _renderParamBase = renderParam;
renderParam = async function (key) {
  await _renderParamBase(key);
  if (key === "vis" && currentView === "param" && currentKey === "vis") {
    const k = visKs();
    const el = document.getElementById("chart-title");
    if (el) el.textContent = t("p_vis") + " (" + t("vis_m") + ") / " + t("vis_dust") + " × " + k.dust +
      " (" + t("vis_ug") + ") / AOD × " + k.aod;
  }
};
/* переводы (11 языков) */
const I18N_VIS = {
  vis_title: { en:"Chart scale", ru:"Масштаб на графике", "zh-CN":"图表比例", "zh-TW":"圖表比例", es:"Escala en el gráfico", ar:"مقياس الرسم", hi:"ग्राफ़ का स्केल", "pt-BR":"Escala no gráfico", fr:"Échelle du graphique", de:"Maßstab im Diagramm", ja:"グラフの倍率" },
  vis_dust:  { en:"Dust", ru:"Пыль", "zh-CN":"沙尘", "zh-TW":"沙塵", es:"Polvo", ar:"الغبار", hi:"धूल", "pt-BR":"Poeira", fr:"Poussière", de:"Staub", ja:"ダスト" },
  vis_aod:   { en:"Aerosol optical depth (AOD)", ru:"Оптическая плотность (AOD)", "zh-CN":"气溶胶光学厚度 (AOD)", "zh-TW":"氣溶膠光學厚度 (AOD)", es:"Profundidad óptica de aerosoles (AOD)", ar:"العمق البصري للهباء الجوي (AOD)", hi:"एरोसोल ऑप्टिकल डेप्थ (AOD)", "pt-BR":"Profundidade óptica de aerossóis (AOD)", fr:"Épaisseur optique des aérosols (AOD)", de:"Aerosol-Optische-Dicke (AOD)", ja:"エアロゾル光学的厚さ (AOD)" },
  vis_m:     { en:"m", ru:"м", "zh-CN":"米", "zh-TW":"公尺", es:"m", ar:"م", hi:"मी", "pt-BR":"m", fr:"m", de:"m", ja:"m" },
  vis_ug:    { en:"µg/m³", ru:"мкг/м³", "zh-CN":"微克/立方米", "zh-TW":"微克/立方公尺", es:"µg/m³", ar:"µg/m³", hi:"µg/m³", "pt-BR":"µg/m³", fr:"µg/m³", de:"µg/m³", ja:"µg/m³" },
  vis_dust_d: {
    en:"Near-ground dust: sandstorms, desert dust. Usually 0–50 µg/m³, hundreds in a dust storm. The line is drawn multiplied by this factor so it is visible next to visibility in metres. The real value is shown in the tooltip on hover.",
    ru:"Пыль у земли: песчаные бури, пыль из пустынь. Обычно 0–50 мкг/м³, при пылевой буре — сотни. Линия рисуется умноженной на этот множитель, чтобы быть видной рядом с видимостью в метрах. Настоящее значение — в подсказке при наведении.",
    "zh-CN":"近地面沙尘：沙尘暴、沙漠扬尘。通常为 0–50 µg/m³，沙尘暴时可达数百。曲线按此倍数放大显示，以便与以米为单位的能见度对照。鼠标悬停时提示框显示真实数值。",
    "zh-TW":"近地面沙塵：沙塵暴、沙漠揚塵。通常為 0–50 µg/m³，沙塵暴時可達數百。曲線依此倍數放大顯示，以便與以公尺為單位的能見度對照。滑鼠懸停時提示框顯示真實數值。",
    es:"Polvo cerca del suelo: tormentas de arena, polvo del desierto. Normalmente 0–50 µg/m³; en una tormenta de polvo, cientos. La línea se dibuja multiplicada por este factor para que se vea junto a la visibilidad en metros. El valor real aparece al pasar el cursor.",
    ar:"الغبار قرب سطح الأرض: العواصف الرملية وغبار الصحراء. عادةً 0–50 µg/m³ وتصل إلى مئات أثناء العاصفة الغبارية. يُرسم الخط مضروبًا في هذا المعامل ليظهر بجانب الرؤية بالأمتار. تظهر القيمة الحقيقية في التلميح عند تمرير المؤشر.",
    hi:"ज़मीन के पास की धूल: रेतीले तूफ़ान, रेगिस्तानी धूल। आमतौर पर 0–50 µg/m³, धूल भरी आँधी में सैकड़ों। रेखा को इस गुणक से गुणा करके दिखाया जाता है ताकि वह मीटर में दृश्यता के पास दिखे। असली मान कर्सर ले जाने पर दिखता है।",
    "pt-BR":"Poeira perto do solo: tempestades de areia, poeira do deserto. Normalmente 0–50 µg/m³; em tempestade de poeira, centenas. A linha é desenhada multiplicada por este fator para aparecer junto da visibilidade em metros. O valor real aparece ao passar o cursor.",
    fr:"Poussière près du sol : tempêtes de sable, poussière du désert. Généralement 0–50 µg/m³, des centaines lors d'une tempête de poussière. La courbe est tracée multipliée par ce facteur pour être visible à côté de la visibilité en mètres. La valeur réelle s'affiche au survol.",
    de:"Staub in Bodennähe: Sandstürme, Wüstenstaub. Meist 0–50 µg/m³, bei Staubsturm Hunderte. Die Linie wird mit diesem Faktor multipliziert gezeichnet, damit sie neben der Sichtweite in Metern sichtbar ist. Der echte Wert steht im Tooltip beim Darüberfahren.",
    ja:"地表付近のダスト：砂嵐や砂漠の砂塵。通常は 0–50 µg/m³、砂嵐では数百になります。メートル単位の視程と並べて見えるよう、線はこの倍率を掛けて描かれます。実際の値はカーソルを合わせたときのヒントに表示されます。"
  },
  vis_aod_d: {
    en:"Shows how much haze, smoke and dust weaken sunlight. No units. Up to 0.1 — clean air; 0.1–0.4 — light haze; 0.4–1 — heavy haze or smog; above 1 — wildfire smoke or dust storm. The line is drawn multiplied by the factor; the real value is in the tooltip on hover.",
    ru:"Показывает, насколько дымка, дым и пыль ослабляют солнечный свет. Единиц нет. До 0,1 — чистый воздух; 0,1–0,4 — лёгкая дымка; 0,4–1 — сильная дымка или смог; выше 1 — дым пожаров или пылевая буря. Линия рисуется умноженной на множитель; настоящее значение — в подсказке при наведении.",
    "zh-CN":"表示霾、烟和沙尘对阳光的削弱程度，无单位。0.1 以下：空气洁净；0.1–0.4：轻度霾；0.4–1：重度霾或烟雾；1 以上：山火烟尘或沙尘暴。曲线按倍数放大显示，鼠标悬停时提示框显示真实数值。",
    "zh-TW":"表示霾、煙與沙塵對陽光的削弱程度，無單位。0.1 以下：空氣潔淨；0.1–0.4：輕度霾；0.4–1：重度霾或煙霧；1 以上：山火煙塵或沙塵暴。曲線依倍數放大顯示，滑鼠懸停時提示框顯示真實數值。",
    es:"Indica cuánto debilitan la luz solar la bruma, el humo y el polvo. Sin unidades. Hasta 0,1: aire limpio; 0,1–0,4: bruma ligera; 0,4–1: bruma intensa o smog; más de 1: humo de incendios o tormenta de polvo. La línea se dibuja multiplicada por el factor; el valor real aparece al pasar el cursor.",
    ar:"يبيّن مقدار إضعاف الضباب الدخاني والدخان والغبار لضوء الشمس. بلا وحدات. حتى 0.1: هواء نظيف؛ 0.1–0.4: ضباب خفيف؛ 0.4–1: ضباب كثيف أو سموغ؛ فوق 1: دخان حرائق أو عاصفة غبار. يُرسم الخط مضروبًا في المعامل، وتظهر القيمة الحقيقية في التلميح عند تمرير المؤشر.",
    hi:"बताता है कि धुंध, धुआँ और धूल सूरज की रोशनी को कितना कम करते हैं। इकाई नहीं। 0.1 तक: साफ़ हवा; 0.1–0.4: हल्की धुंध; 0.4–1: घनी धुंध या स्मॉग; 1 से ऊपर: जंगल की आग का धुआँ या धूल भरी आँधी। रेखा गुणक से गुणा करके दिखाई जाती है; असली मान कर्सर ले जाने पर दिखता है।",
    "pt-BR":"Mostra quanto a névoa, a fumaça e a poeira enfraquecem a luz solar. Sem unidade. Até 0,1: ar limpo; 0,1–0,4: névoa leve; 0,4–1: névoa forte ou smog; acima de 1: fumaça de incêndios ou tempestade de poeira. A linha é desenhada multiplicada pelo fator; o valor real aparece ao passar o cursor.",
    fr:"Indique à quel point la brume, la fumée et la poussière atténuent la lumière du soleil. Sans unité. Jusqu'à 0,1 : air pur ; 0,1–0,4 : brume légère ; 0,4–1 : forte brume ou smog ; au-delà de 1 : fumée d'incendies ou tempête de poussière. La courbe est multipliée par le facteur ; la valeur réelle s'affiche au survol.",
    de:"Zeigt, wie stark Dunst, Rauch und Staub das Sonnenlicht abschwächen. Ohne Einheit. Bis 0,1: saubere Luft; 0,1–0,4: leichter Dunst; 0,4–1: starker Dunst oder Smog; über 1: Waldbrandrauch oder Staubsturm. Die Linie wird mit dem Faktor multipliziert gezeichnet; der echte Wert steht im Tooltip.",
    ja:"もや・煙・ダストが太陽光をどれだけ弱めるかを示します。単位はありません。0.1 まで：きれいな空気、0.1–0.4：軽いもや、0.4–1：濃いもややスモッグ、1 超：山火事の煙や砂嵐。線は倍率を掛けて描かれ、実際の値はカーソルを合わせたときのヒントに表示されます。"
  }
};
for (const k in I18N_VIS) for (const l in I18N_VIS[k]) if (I18N[l]) I18N[l][k] = I18N_VIS[k][l];
/* Давление: пять пунктирных линий порогов (по высоте из настроек) */
Chart.register({
  id: "pressureThrLines5",
  beforeDatasetsDraw(chart) {
    if (typeof currentKey === "undefined" || currentKey !== "pressure") return;
    const ys = Object.values(chart.scales).find(s => s.axis === "y");
    if (!ys) return;
    const ca = chart.chartArea;
    const u = SETTINGS.units.pressure;
    const thr = effectivePressureThresholds(SETTINGS);
    const dec = (u === "inHg") ? 2 : 0;
    const RED = "255,77,77", ORANGE = "255,159,28", GREEN = "61,220,110";
    const list = [
      { k: "anom_high", c: RED },
      { k: "high",      c: ORANGE },
      { k: "normal",    c: GREEN },
      { k: "low",       c: ORANGE },
      { k: "anom_low",  c: RED }
    ];
    const ctx = chart.ctx;
    list.forEach(it => {
      const v = convertUnit(thr[it.k], "pressure", u);
      if (v == null || isNaN(v) || v < ys.min || v > ys.max) return;
      const y = ys.getPixelForValue(v);
      ctx.save();
      ctx.beginPath();
      ctx.rect(ca.left, ca.top, ca.right - ca.left, ca.bottom - ca.top);
      ctx.clip();
      ctx.strokeStyle = "rgba(" + it.c + ",0.85)";
      ctx.lineWidth = 1;
      ctx.setLineDash([10, 4, 2, 4]);
      ctx.beginPath();
      ctx.moveTo(ca.left, y);
      ctx.lineTo(ca.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(" + it.c + ",0.95)";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(t("thr_" + it.k), ca.right - 4, y - 2);
      ctx.restore();
    });
  }
});
/* Температура: пороги опасности. Авто — кривые по влажности и ветру точки, свои — прямые линии */
let tdDanger = null;      // кривые порогов текущего графика
let tdDangerLast = null;  // последние известные влажность и ветер (для окна настроек)
const TEMP_THR_STD = { cold: [-28, -40, -48], heat: [27, 32, 41, 54] };
const TD_LEVELS = [
  { v: 54, c: "255,77,77" }, { v: 41, c: "255,77,77" },
  { v: 32, c: "255,159,28" }, { v: 27, c: "255,159,28" },
  { v: -28, c: "255,159,28" }, { v: -40, c: "255,77,77" }, { v: -48, c: "255,77,77" }
];
function tempThrNow() {
  if (SETTINGS.temp_thr_auto === false && SETTINGS.temp_thr) {
    const c = (SETTINGS.temp_thr.cold || []).map(Number);
    const h = (SETTINGS.temp_thr.heat || []).map(Number);
    const ok = c.length === 3 && h.length === 4 &&
      c.every(v => isFinite(v) && v !== 0) && h.every(v => isFinite(v) && v !== 0) &&
      c[0] > c[1] && c[1] > c[2] && h[0] < h[1] && h[1] < h[2] && h[2] < h[3];
    if (ok) return { cold: c, heat: h };
  }
  return TEMP_THR_STD;
}
/* при какой температуре воздуха «ощущается как» достигнет уровня (при данных влажности и ветре) */
function tdSolveAir(level, rh, wind) {
  let lo = -90, hi = 70;
  if (feelsLikeC(lo, rh, wind) > level) return null;
  if (feelsLikeC(hi, rh, wind) < level) return null;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (feelsLikeC(mid, rh, wind) < level) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
/* текущие расчётные значения для окна настроек: жара 4,3,2,1, холод 1,2,3 */
function tdDangerNowList() {
  return TD_LEVELS.map(it => {
    if (!tdDangerLast) return it.v;
    const s = tdSolveAir(it.v, tdDangerLast.rh, tdDangerLast.w);
    return s == null ? it.v : Math.round(s * 10) / 10;
  });
}
async function addFeelsLike(p, datasets, from, to, step, g, unitId, nowSec) {
  tdDanger = null;
  if (g !== "temp") return;
  const cfg = SETTINGS.temp_danger || {};
  if (cfg.on === false) return;
  const clean = a => a.filter(o => !isNaN(o.val)).sort((x, y) => x.ts - y.ts);
  const T = clean(await tdSeries("temp", cfg.temp || "auto", from, to));
  if (!T.length) return;
  const RH = clean(await tdSeries("rh", cfg.rh || "auto", from, to));
  const W  = clean(await tdSeries("wind_spd", cfg.wind || "auto", from, to));
  const gapX = (6*3600) / step;
  const pts = [];
  const curves = TD_LEVELS.map(it => ({ v: it.v, c: it.c, pts: [] }));
  T.forEach(o => {
    const x = (o.ts - from) / step;
    const rh = tdNear(RH, o.ts), w = tdNear(W, o.ts);
    if (pts.length && x - pts[pts.length-1].x > gapX) {
      const gx = (pts[pts.length-1].x + x) / 2;
      pts.push({ x: gx, y: null });
      curves.forEach(cv => cv.pts.push({ x: gx, y: null }));
    }
    pts.push({ x, y: convertUnit(feelsLikeC(o.val, rh, w), "temp", unitId) });
    curves.forEach(cv => {
      const s = tdSolveAir(cv.v, rh, w);
      cv.pts.push({ x, y: s == null ? null : convertUnit(s, "temp", unitId) });
    });
  });
  const rhNow = tdNear(RH, nowSec), wNow = tdNear(W, nowSec);
  if (rhNow != null || wNow != null) tdDangerLast = { rh: rhNow, w: wNow };
  tdDanger = { curves };
  const nowX = (nowSec - from) / step;
  const col = "#ff4d4d";
  datasets.push({ label: "AV_" + t("td_feels"), data: pts, borderColor: col, backgroundColor: col + "22",
    fill: false, tension: 0.3, pointRadius: 0, spanGaps: false,
    segment: { borderDash: c => (c.p1.parsed.x > nowX ? [6,4] : undefined) } });
}
Chart.register({
  id: "tempThrLines",
  beforeDatasetsDraw(chart) {
    if (typeof currentKey === "undefined" || currentKey !== "temp") return;
    if (SETTINGS.temp_danger && SETTINGS.temp_danger.on === false) return;
    const ys = Object.values(chart.scales).find(s => s.axis === "y");
    const xs = Object.values(chart.scales).find(s => s.axis === "x");
    if (!ys || !xs) return;
    const ca = chart.chartArea;
    const u = SETTINGS.units.temp;
    const ctx = chart.ctx;
    const dec = v => Math.round(v) + "°";
    ctx.save();
    ctx.beginPath();
    ctx.rect(ca.left, ca.top, ca.right - ca.left, ca.bottom - ca.top);
    ctx.clip();
    ctx.lineWidth = 1;
    ctx.font = "10px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    if (SETTINGS.temp_thr_auto !== false) {
      if (tdDanger) tdDanger.curves.forEach(cv => {
        ctx.strokeStyle = "rgba(" + cv.c + ",0.85)";
        ctx.setLineDash([10, 4, 2, 4]);
        ctx.beginPath();
        let pen = false, last = null;
        cv.pts.forEach(pt => {
          if (pt.y == null) { pen = false; return; }
          const px = xs.getPixelForValue(pt.x), py = ys.getPixelForValue(pt.y);
          if (pen) ctx.lineTo(px, py); else { ctx.moveTo(px, py); pen = true; }
          if (pt.y >= ys.min && pt.y <= ys.max && pt.x >= xs.min && pt.x <= xs.max) last = { px, py };
        });
        ctx.stroke();
        ctx.setLineDash([]);
        if (last) {
          ctx.fillStyle = "rgba(" + cv.c + ",0.95)";
          ctx.fillText(dec(convertUnit(cv.v, "temp", u)), Math.min(last.px, ca.right - 4), last.py - 2);
        }
      });
    } else {
      const thr = tempThrNow();
      const list = [];
      thr.cold.forEach((v, i) => list.push({ v, c: i === 0 ? "255,159,28" : "255,77,77" }));
      thr.heat.forEach((v, i) => list.push({ v, c: i < 2 ? "255,159,28" : "255,77,77" }));
      list.forEach(it => {
        const v = convertUnit(it.v, "temp", u);
        if (v == null || isNaN(v) || v < ys.min || v > ys.max) return;
        const y = ys.getPixelForValue(v);
        ctx.strokeStyle = "rgba(" + it.c + ",0.85)";
        ctx.setLineDash([10, 4, 2, 4]);
        ctx.beginPath();
        ctx.moveTo(ca.left, y);
        ctx.lineTo(ca.right, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(" + it.c + ",0.95)";
        ctx.fillText(dec(v), ca.right - 4, y - 2);
      });
    }
    ctx.restore();
  }
});
/* ===== Газы: пунктирная линия порога опасности ===== */
Chart.register({
  id: "gasThrLine",
  afterDatasetsDraw: function (chart) {
    try {
      const key = (typeof currentKey !== "undefined") ? currentKey : null;
      if (!key || typeof GAS_INFO === "undefined" || !GAS_INFO[key]) return;
      const g = SETTINGS.gas || {};
      if (g.on === false) return;
      const custom = g.thr ? Number(g.thr[key]) : NaN;
      const base = custom > 0 ? custom : gasDefault(key, g.norm || "strict", g.mode || "home");
      if (!(base > 0)) return;
      const grp = PARAM_UNIT_GROUP[key];
      const v = grp ? convertUnit(base, grp, SETTINGS.units[grp]) : base;
      const y = chart.scales.y || Object.values(chart.scales).find(function (s) { return s.axis === "y"; });
      if (!y || !isFinite(v) || v < y.min || v > y.max) return;
      const a = chart.chartArea;
      const py = y.getPixelForValue(v);
      const col = { ok: "#ffcf4d", danger: "#ff9d4d", bad: "#ff4d4d" }[GAS_INFO[key].d];
      const ctx = chart.ctx;
      ctx.save();
      ctx.beginPath(); ctx.rect(a.left, a.top, a.right - a.left, a.bottom - a.top); ctx.clip();
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.setLineDash([10, 4, 2, 4]);
      ctx.beginPath(); ctx.moveTo(a.left, py); ctx.lineTo(a.right, py); ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.fillStyle = col; ctx.font = "11px 'Exo 2', sans-serif";
      ctx.textAlign = "right"; ctx.textBaseline = "bottom";
      ctx.fillText(String(+v.toPrecision(3)), a.right - 4, py - 3);
      ctx.restore();
    } catch (e) {}
  }
});
/* ===== AQI: линия «AV_AQI» — индекс качества воздуха по правилам US EPA ===== */
let AQI_STATUS = null;   // для окна настроек: что используется и чего не хватает

const AQI_KEYS = ["pm25", "pm10", "o3", "co", "so2", "no2"];
const AQI_POLL = {
  pm25: { dev: ["pm25", "pm2_5"], web: ["pm2_5", "pm25"] },
  pm10: { dev: ["pm10"],          web: ["pm10"] },
  o3:   { dev: ["o3"],            web: ["ozone", "o3"] },
  co:   { dev: ["co"],            web: ["carbon_monoxide", "co"] },
  so2:  { dev: ["so2"],           web: ["sulphur_dioxide", "so2"] },
  no2:  { dev: ["no2"],           web: ["nitrogen_dioxide", "no2"] }
};
/* таблицы EPA (редакция 2024): [конц. от, конц. до, индекс от, индекс до]
   PM — мкг/м³, CO — ppm, остальные газы — ppb */
const AQI_BP = {
  pm25: [[0,9.0,0,50],[9.1,35.4,51,100],[35.5,55.4,101,150],[55.5,125.4,151,200],[125.5,225.4,201,300],[225.5,325.4,301,500]],
  pm10: [[0,54,0,50],[55,154,51,100],[155,254,101,150],[255,354,151,200],[355,424,201,300],[425,504,301,400],[505,604,401,500]],
  co:   [[0,4.4,0,50],[4.5,9.4,51,100],[9.5,12.4,101,150],[12.5,15.4,151,200],[15.5,30.4,201,300],[30.5,40.4,301,400],[40.5,50.4,401,500]],
  so2:  [[0,35,0,50],[36,75,51,100],[76,185,101,150],[186,304,151,200],[305,604,201,300],[605,804,301,400],[805,1004,401,500]],
  no2:  [[0,53,0,50],[54,100,51,100],[101,360,101,150],[361,649,151,200],[650,1249,201,300],[1250,1649,301,400],[1650,2049,401,500]],
  o3_8: [[0,54,0,50],[55,70,51,100],[71,85,101,150],[86,105,151,200],[106,200,201,300]],
  o3_1: [[125,164,101,150],[165,204,151,200],[205,404,201,300],[405,504,301,400],[505,604,401,500]]
};

/* концентрация → частный индекс по таблице (null, если не применимо) */
function aqiSub(tab, c) {
  if (c == null || !isFinite(c) || c < tab[0][0]) return null;
  for (const r of tab) {
    if (c <= r[1]) {
      if (c < r[0]) c = r[0];
      return Math.round((r[3] - r[2]) / (r[1] - r[0]) * (c - r[0]) + r[2]);
    }
  }
  return 500;
}

/* NowCast (EPA) для частиц: a[0] — текущий час, a[11] — 11 часов назад */
function aqiNowCast(a) {
  let have = 0;
  for (let i = 0; i < 3; i++) if (a[i] != null) have++;
  if (have < 2) return null;
  let mn = Infinity, mx = -Infinity;
  a.forEach(v => { if (v != null) { if (v < mn) mn = v; if (v > mx) mx = v; } });
  let w = mx > 0 ? mn / mx : 1;
  if (w < 0.5) w = 0.5;
  let s = 0, d = 0;
  a.forEach((v, i) => { if (v != null) { const k = Math.pow(w, i); s += v * k; d += k; } });
  return d > 0 ? s / d : null;
}

/* среднее за n часов, если есть хотя бы need часов с данными */
function aqiAvgN(map, h, n, need) {
  let s = 0, c = 0;
  for (let i = 0; i < n; i++) { const v = map.get(h - i); if (v != null) { s += v; c++; } }
  return c >= need ? s / c : null;
}

/* почасовые средние: Map «номер часа → значение» */
function aqiHourMap(arr) {
  const sum = new Map(), cnt = new Map();
  arr.forEach(o => {
    if (!isFinite(o.val) || !isFinite(o.ts)) return;
    const h = Math.floor(o.ts / 3600);
    sum.set(h, (sum.get(h) || 0) + o.val);
    cnt.set(h, (cnt.get(h) || 0) + 1);
  });
  const m = new Map();
  sum.forEach((s, h) => m.set(h, s / cnt.get(h)));
  return m;
}

/* ключ параметра у уличного устройства (по его карте) */
function aqiDevKey(k) {
  const dmap = (SETTINGS.devices && SETTINGS.devices.out && SETTINGS.devices.out.map) || {};
  for (const dk of AQI_POLL[k].dev) if (dk in dmap && dmap[dk] !== "no") return dk;
  return null;
}
/* имя параметра в источнике Air Quality (по его карте) */
function aqiWebParam(k) {
  const gs = (SETTINGS.weather_sources && SETTINGS.weather_sources["open-meteo-air"]) || {};
  const def = (typeof AIRQUALITY_DEFAULT_MAP !== "undefined") ? AIRQUALITY_DEFAULT_MAP : {};
  const map = (gs.map && Object.keys(gs.map).length) ? gs.map : def;
  for (const pn of AQI_POLL[k].web) if (pn in map && map[pn] !== "no") return pn;
  return null;
}

/* замеры устройства: постранично, от новых к старым (до 40 000 штук) */
async function aqiLoadDev(sn, dk, from, to) {
  const out = [];
  for (let page = 0; page < 40; page++) {
    const { data, error } = await client.from("measurements").select("val, ts_device")
      .eq("serial", sn).eq("key", dk)
      .gte("ts_device", from).lte("ts_device", to)
      .order("ts_device", { ascending: false })
      .range(page * 1000, page * 1000 + 999);
    if (error || !data || !data.length) break;
    data.forEach(r => out.push({ ts: Number(r.ts_device), val: Number(r.val) }));
    if (data.length < 1000) break;
  }
  return out;
}
/* Air Quality: факт и (на «сейчас») прогноз */
async function aqiLoadWeb(param, from, to, withFc) {
  const rows = await loadWeatherSeries("open-meteo-air", param, from, to);
  const fact = rows.map(r => ({ ts: Date.parse(r.ts_utc) / 1000, val: Number(r.val) }));
  const fcst = [];
  if (withFc && typeof loadWeatherForecast === "function") {
    try {
      const f = await loadWeatherForecast("open-meteo-air", param);
      (f || []).forEach(o => { if (o.ts <= to) fcst.push({ ts: o.ts, val: Number(o.val) }); });
    } catch (e) {}
  }
  return { fact, fcst };
}

/* индекс одного часа: наибольший из частных; нужен PM2.5 или PM10 */
function aqiHourValue(M, h) {
  const subs = [];
  let hasPM = false;
  const pm = (k, trunc) => {
    const nc = aqiNowCast(Array.from({ length: 12 }, (_, i) => M[k].has(h - i) ? M[k].get(h - i) : null));
    if (nc == null) return;
    const s = aqiSub(AQI_BP[k], trunc(nc));
    if (s != null) { subs.push(s); hasPM = true; }
  };
  pm("pm25", c => Math.floor(c * 10) / 10);
  pm("pm10", c => Math.floor(c));
  // озон: 8 часов (нужно ≥6 часов данных) и 1 час (с 125 ppb)
  const c8 = aqiAvgN(M.o3, h, 8, 6);
  if (c8 != null) {
    const p8 = Math.floor(c8 / 1.96);
    if (p8 <= 200) { const s = aqiSub(AQI_BP.o3_8, p8); if (s != null) subs.push(s); }
  }
  const c1 = M.o3.get(h);
  if (c1 != null && c1 / 1.96 >= 125) { const s = aqiSub(AQI_BP.o3_1, Math.floor(c1 / 1.96)); if (s != null) subs.push(s); }
  // угарный газ: 8 часов
  const co8 = aqiAvgN(M.co, h, 8, 6);
  if (co8 != null) { const s = aqiSub(AQI_BP.co, Math.floor(co8 / 1145 * 10) / 10); if (s != null) subs.push(s); }
  // диоксид серы и азота: 1 час
  const so = M.so2.get(h);
  if (so != null) { const s = aqiSub(AQI_BP.so2, Math.floor(so / 2.62)); if (s != null) subs.push(s); }
  const no = M.no2.get(h);
  if (no != null) { const s = aqiSub(AQI_BP.no2, Math.floor(no / 1.88)); if (s != null) subs.push(s); }
  if (!hasPM || !subs.length) return null;
  return Math.max.apply(null, subs);
}

async function addAvAqi(p, datasets, from, to, step, nowSec) {
  if (!p || p.key !== "aqi") return;
  const cfg = SETTINGS.aqi || {};
  if (cfg.on === false) { AQI_STATUS = null; return; }
  const src = (cfg.src === "dev" || cfg.src === "open-meteo-air") ? cfg.src : "auto";
  const ci_ = SETTINGS.config_items || {};
  const loadFrom = from - 13 * 3600;
  const withFc = offsetSteps === 0 && currentRange !== "year";
  const status = { ok: false, src, items: {} };
  const maps = {};

  await Promise.all(AQI_KEYS.map(async k => {
    const st = { dev: "ok", web: "ok" };
    const src = (cfg[k] === "dev" || cfg[k] === "open-meteo-air") ? cfg[k] : "auto";
    const dm = new Map(), wm = new Map();
    // 1) реальное устройство
    if (src === "open-meteo-air") st.dev = "not_chosen";
    else if (ci_.dev_out !== true || !SETTINGS.sn_out) st.dev = "source_off";
    else {
      const dk = aqiDevKey(k);
      if (!dk) st.dev = "no_param";
      else {
        const rows = await aqiLoadDev(SETTINGS.sn_out, dk, loadFrom, to);
        aqiHourMap(rows).forEach((v, h) => dm.set(h, v));
        if (!dm.size) st.dev = "no_data";
      }
    }
    // 2) интернет (Air Quality)
    if (src === "dev") st.web = "not_chosen";
    else if (ci_.open_meteo_air === false) st.web = "source_off";
    else {
      const pn = aqiWebParam(k);
      if (!pn) st.web = "no_param";
      else {
        const w = await aqiLoadWeb(pn, loadFrom, to, withFc);
        const fm = aqiHourMap(w.fact);
        aqiHourMap(w.fcst).forEach((v, h) => { if (!fm.has(h)) fm.set(h, v); });
        fm.forEach((v, h) => wm.set(h, v));
        if (!wm.size) st.web = "no_data";
      }
    }
    // устройство главнее: если час есть у устройства — берём его, иначе интернет
    const m = new Map(wm);
    dm.forEach((v, h) => m.set(h, v));
    maps[k] = m;
    status.items[k] = st;
  }));

  // считаем по часам и собираем в столбцы нужной ширины
  const bs = currentRange === "year" ? 86400 : (currentRange === "month" ? 10800 : 3600);
  const buckets = new Map();
  const hA = Math.floor(from / 3600) - 1, hB = Math.floor(to / 3600);
  for (let h = hA; h <= hB; h++) {
    const v = aqiHourValue(maps, h);
    if (v == null) continue;
    const k = Math.floor((h * 3600 - from) / bs);
    if (k < -1) continue;
    let b = buckets.get(k);
    if (!b) { b = { s: 0, c: 0, t: (bs === 3600 ? h * 3600 : from + k * bs + bs / 2) }; buckets.set(k, b); }
    b.s += v; b.c++;
  }
  const list = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]).map(e => e[1]);
  if (!list.length) { AQI_STATUS = status; return; }
  status.ok = true;
  AQI_STATUS = status;

  const gapX = Math.max(6 * 3600, 2 * bs) / step;
  const pts = [];
  list.forEach(b => {
    const x = (b.t - from) / step;
    if (pts.length && x - pts[pts.length - 1].x > gapX) pts.push({ x: (pts[pts.length - 1].x + x) / 2, y: null });
    pts.push({ x, y: Math.round(b.s / b.c) });
  });
  const nowX = (nowSec - from) / step;
  const col = (getTheme() === "light") ? "#0d2a4a" : "#ffffff";
  datasets.push({ label: "AV_AQI", data: pts, borderColor: col, backgroundColor: col + "22",
    fill: false, tension: 0.2, pointRadius: 0, spanGaps: false,
    segment: { borderDash: c => (c.p1.parsed.x > nowX ? [6, 4] : undefined) } });
}

/* подключаем AV_AQI к построению графика (после «Ощущается как») */
if (!window.__aqiWrapped) {
  window.__aqiWrapped = true;
  const _addFeelsLikeBase = addFeelsLike;
  addFeelsLike = async function (p, datasets, from, to, step, g, unitId, nowSec) {
    await _addFeelsLikeBase(p, datasets, from, to, step, g, unitId, nowSec);
    await addAvAqi(p, datasets, from, to, step, nowSec);
  };
}
/* ===== AQI: цветные пунктирные пороги 50 / 100 / 150 / 200 / 300 ===== */
Chart.register({
  id: "aqiThrLines",
  beforeDatasetsDraw(chart) {
    if (currentKey !== "aqi") return;
    if (SETTINGS.aqi && SETTINGS.aqi.on === false) return;
    if (!chart.data.datasets.some(d => d.label === "AV_AQI")) return;
    const sc = chart.scales.y || Object.values(chart.scales).find(s => s.axis === "y");
    if (!sc) return;
    const area = chart.chartArea;
    const LEVELS = [
      { v: 50,  c: "#ffcf4d" },
      { v: 100, c: "#ff9d4d" },
      { v: 150, c: "#ff4d4d" },
      { v: 200, c: "#d62839" },
      { v: 300, c: "#a4133c" }
    ];
    const ctx = chart.ctx;
    LEVELS.forEach(L => {
      if (L.v < sc.min || L.v > sc.max) return;   // вне шкалы — не рисуем, шкалу не растягиваем
      const y = sc.getPixelForValue(L.v);
      ctx.save();
      ctx.strokeStyle = L.c;
      ctx.fillStyle = L.c;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([10, 4, 2, 4]);
      ctx.beginPath();
      ctx.moveTo(area.left, y);
      ctx.lineTo(area.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "11px sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(String(L.v), area.right - 4, y - 2);
      ctx.restore();
    });
  }
});
/* ===== Температура: пороги опасности на месяце и годе — усреднение по корзинам ===== */
function tdBucketCurves(step) {
  if (!tdDanger || !tdDanger.curves) return;
  const days = currentRange === "year" ? 7 : (currentRange === "month" ? 1 : 0);
  if (!days) return;
  const bw = days * 86400 / step;
  tdDanger.curves.forEach(function (cv) {
    const avg = [];
    let cur = null;
    cv.pts.forEach(function (pt) {
      if (pt.y == null) return;
      const b = Math.floor(pt.x / bw);
      if (!cur || cur.b !== b) {
        if (cur) avg.push({ x: cur.sx / cur.n, y: cur.sy / cur.n });
        cur = { b: b, sx: 0, sy: 0, n: 0 };
      }
      cur.sx += pt.x; cur.sy += pt.y; cur.n++;
    });
    if (cur) avg.push({ x: cur.sx / cur.n, y: cur.sy / cur.n });
    const out = [];
    avg.forEach(function (pt, i) {
      if (i > 0 && pt.x - avg[i - 1].x > 2.5 * bw) out.push({ x: (pt.x + avg[i - 1].x) / 2, y: null });
      out.push(pt);
    });
    cv.pts = out;
  });
}
if (!window.__tdBucketWrapped) {
  window.__tdBucketWrapped = true;
  const _addFeelsLikeBase2 = addFeelsLike;
  addFeelsLike = async function (p, datasets, from, to, step, g, unitId, nowSec) {
    await _addFeelsLikeBase2(p, datasets, from, to, step, g, unitId, nowSec);
    tdBucketCurves(step);
  };
}