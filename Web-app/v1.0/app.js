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
/* ===== Осадки: линия осадков умножается (по умолчанию ×100), чтобы быть видной рядом с облачностью ===== */
function precipK() {
  const v = Number(SETTINGS.precip_k);
  return v > 0 ? v : 100;
}
const _visApplyBasePrecip = visApply;
visApply = function (p, datasets) {
  _visApplyBasePrecip(p, datasets);
  if (!p || p.key !== "precip") return;
  const m = precipK();
  if (m === 1) return;
  datasets.forEach(ds => {
    if (!/осадк|precip|rain/i.test(ds.label || "")) return;
    ds.$k = m;
    ds.data = ds.data.map(pt => pt.y == null ? pt : { x: pt.x, y: pt.y * m });
  });
};
const _renderParamBasePrecip = renderParam;
renderParam = async function (key) {
  await _renderParamBasePrecip(key);
  if (key === "precip" && currentView === "param" && currentKey === "precip") {
    const el = document.getElementById("chart-title");
    if (el) {
      const k = precipK();
      const s = el.textContent;
      el.textContent = /(мм|mm)(?![\s\S]*(мм|mm))/.test(s)
        ? s.replace(/(мм|mm)(?![\s\S]*(мм|mm))/, "$1 × " + k)
        : s + " × " + k;
    }
  }
};
precipK = function () { const v = Number(SETTINGS.precip_k); return v > 0 ? v : 100; };
/* ===== Нижняя строка: советы по газам ===== */
const ADV_GAS_IDS = { so2:"a75", o3:"a76", no2:"a77", no:"a78", nh3:"a79", co2:"a80", co:"a81", hcho:"a82" };
const advTick = { active:{}, shown:{}, cur:null, timer:null, anim:null, busy:false };

async function advLatestDevice(which, gasKey) {
  const dev = SETTINGS.devices && SETTINGS.devices[which];
  const sn = which === "out" ? SETTINGS.sn_out : SETTINGS.sn_in;
  const on = SETTINGS.config_items[which === "out" ? "dev_out" : "dev_in"] === true;
  if (!dev || !dev.map || !sn || !on) return null;
  const keys = Object.keys(dev.map).filter(k => dev.map[k] === gasKey);
  if (!keys.length) return null;
  const since = Math.floor(Date.now() / 1000) - 30 * 60;
  const { data } = await client.from("measurements").select("val, ts_device")
    .eq("serial", sn).in("key", keys).gte("ts_device", since)
    .order("ts_device", { ascending: false }).limit(1);
  return (data && data.length) ? Number(data[0].val) : null;
}
async function advLatestWeb(gasKey) {
  const src = "open-meteo-air";
  if (SETTINGS.config_items.open_meteo_air === false) return null;
  const ws = SETTINGS.weather_sources && SETTINGS.weather_sources[src];
  if (!ws || !ws.map) return null;
  const params = Object.keys(ws.map).filter(p => ws.map[p] === gasKey);
  const now = Math.floor(Date.now() / 1000);
  for (const p of params) {
    const rows = await loadWeatherSeries(src, p, now - 3 * 3600, now);
    if (rows.length) return Number(rows[rows.length - 1].val);
  }
  return null;
}
async function advRefresh() {
  if (advTick.busy || document.hidden || !SETTINGS || !SETTINGS.gas && false) return;
  advTick.busy = true;
  try {
    const c = gasCfg();
    for (const key of Object.keys(ADV_GAS_IDS)) {
      const id = ADV_GAS_IDS[key];
      if (!c.on || (SETTINGS.advice.disabled && SETTINGS.advice.disabled[id] === true)) { advTick.active[id] = false; continue; }
      let v = null;
      if (c.mode === "home") v = await advLatestDevice("in", key);
      else { v = await advLatestDevice("out", key); if (v === null) v = await advLatestWeb(key); }
      const custom = Number(c.thr[key]);
      const thr = custom > 0 ? custom : gasDefault(key, c.norm, c.mode);
      if (v === null || !isFinite(v)) { advTick.active[id] = false; continue; }
      if (v >= thr) advTick.active[id] = true;
      else if (v < thr * 0.9) advTick.active[id] = false;
    }
  } catch (e) { console.warn("advice refresh:", e); }
  advTick.busy = false;
  if (!advTick.cur && Object.keys(advTick.active).some(i => advTick.active[i])) advNext();
}
function advPickNext() {
  const ids = Object.keys(advTick.active).filter(i => advTick.active[i]);
  if (!ids.length) return null;
  const order = adviceOrdered().map(x => x.id).filter(i => ids.indexOf(i) >= 0);
  let pool = order.filter(i => !advTick.shown[i]);
  if (!pool.length) { advTick.shown = {}; pool = order.slice(); }
  if (SETTINGS.advice.critical_first !== false) {
    let best = pool[0], bl = -1;
    pool.forEach(i => { const l = advLevel(ADVICE_LIST.find(x => x.id === i)); if (l > bl) { bl = l; best = i; } });
    return best;
  }
  return pool[0];
}
function advStop() {
  if (advTick.timer) { clearTimeout(advTick.timer); advTick.timer = null; }
  if (advTick.anim) { advTick.anim.onfinish = null; advTick.anim.cancel(); advTick.anim = null; }
}
function advClear() {
  advStop();
  advTick.cur = null;
  const el = document.getElementById("advice");
  if (!el) return;
  el.style.color = ""; el.style.overflow = ""; el.style.whiteSpace = "";
  el.textContent = t("advice_default");
}
function advNext() {
  advStop();
  const id = advPickNext();
  if (!id) { advClear(); return; }
  advShow(id);
}
function advShow(id) {
  advStop();
  const el = document.getElementById("advice");
  const it = ADVICE_LIST.find(x => x.id === id);
  if (!el || !it) return;
  advTick.shown[id] = true;
  advTick.cur = id;
  const sp0 = Number(SETTINGS.advice.speed);
  const speed = (sp0 >= 1 && sp0 <= 10) ? sp0 : 5;
  el.style.color = ADV_LEVELS[advLevel(it)].color || "";
  el.textContent = "";
  const sp = document.createElement("span");
  sp.id = "advice-msg";
  sp.textContent = it.text;
  if (SETTINGS.advice.mode === "marquee") {
    el.style.overflow = "hidden"; el.style.whiteSpace = "nowrap";
    sp.style.display = "inline-block";
    el.appendChild(sp);
    const W = el.clientWidth, w = sp.offsetWidth;
    const dur = (W + w) / (20 * speed) * 1000;
    advTick.anim = sp.animate([{ transform: "translateX(" + W + "px)" }, { transform: "translateX(" + (-w) + "px)" }], { duration: dur, easing: "linear" });
    advTick.anim.onfinish = advNext;
  } else {
    el.style.overflow = ""; el.style.whiteSpace = "";
    el.appendChild(sp);
    sp.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, fill: "both" });
    advTick.timer = setTimeout(advNext, Math.max(5000, it.text.length * 600 / speed));
  }
}
function advStart() {
  Object.keys(ADV_GAS_IDS).forEach(k => { if (ADVICE_READY.indexOf(ADV_GAS_IDS[k]) < 0) ADVICE_READY.push(ADV_GAS_IDS[k]); });
  setTimeout(advRefresh, 5000);
  setInterval(advRefresh, 120000);
  setInterval(() => {
    if (advTick.cur && !document.getElementById("advice-msg")) advShow(advTick.cur);
  }, 1000);
}
window.addEventListener("load", advStart);
/* ===== Нижняя строка: не сбрасывается при перерисовке графика, режим и скорость действуют сразу ===== */
function advSig() {
  const a = (SETTINGS && SETTINGS.advice) || {};
  const sp = Number(a.speed);
  return (a.mode || "sequence") + "|" + ((sp >= 1 && sp <= 10) ? sp : 5);
}
const _advShowOrig = advShow;
advShow = function (id) {
  const el = document.getElementById("advice");
  const running = !!(advTick.timer || advTick.anim);
  if (el && running && id === advTick.cur && advTick.node && advTick.sig === advSig()) {
    if (!el.contains(advTick.node)) { el.textContent = ""; el.appendChild(advTick.node); }
    return;
  }
  _advShowOrig(id);
  advTick.node = document.getElementById("advice-msg");
  advTick.sig = advSig();
};
function advWatch() {
  const el = document.getElementById("advice");
  if (!el) return;
  new MutationObserver(() => {
    if (advTick.cur && advTick.node && !el.contains(advTick.node)) {
      el.textContent = "";
      el.appendChild(advTick.node);
    }
  }).observe(el, { childList: true });
}
if (document.readyState === "complete") advWatch();
else window.addEventListener("load", advWatch);
setInterval(() => {
  if (advTick.cur && advTick.sig && advTick.sig !== advSig()) advShow(advTick.cur);
  if (advTick.anim && advTick.anim.playState === "idle") advNext();
}, 1000);
/* ===== Ветер: пунктиры 10,8 и 17,2 м/с ===== */
Chart.register({
  id: "windThrLines",
  beforeDatasetsDraw(chart) {
    if (typeof currentKey === "undefined" || currentKey !== "wind_spd") return;
    const sc = chart.scales.y || Object.values(chart.scales).find(s => s.axis === "y");
    if (!sc) return;
    const area = chart.chartArea;
    const grp = PARAM_UNIT_GROUP["wind_spd"];
    const ctx = chart.ctx;
    [
      { v: 10.8, c: "#ff9d4d" },
      { v: 17.2, c: "#d62839" }
    ].forEach(L => {
      const v = grp ? convertUnit(L.v, grp, SETTINGS.units[grp]) : L.v;
      if (v == null || !isFinite(v) || v < sc.min || v > sc.max) return;
      const y = sc.getPixelForValue(v);
      ctx.save();
      ctx.beginPath();
      ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
      ctx.clip();
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
      ctx.fillText(String(+v.toPrecision(3)), area.right - 4, y - 2);
      ctx.restore();
    });
  }
});
/* ===== Нижняя строка: советы по ветру (a83 сильный, a84 штормовой) ===== */
async function advWindValue() {
  let v = await advLatestDevice("out", "wind_spd");
  if (v !== null && isFinite(v)) return v;
  const now = Math.floor(Date.now() / 1000);
  for (const src of ["open-meteo", "owm"]) {
    const ws = SETTINGS.weather_sources && SETTINGS.weather_sources[src];
    if (!ws || !ws.map) continue;
    const params = Object.keys(ws.map).filter(p => ws.map[p] === "wind_spd");
    for (const p of params) {
      const rows = await loadWeatherSeries(src, p, now - 3 * 3600, now);
      if (rows.length) return Number(rows[rows.length - 1].val);
    }
  }
  return null;
}
async function advWindCheck() {
  if (document.hidden || !SETTINGS) return;
  try {
    const off = (SETTINGS.advice && SETTINGS.advice.disabled) || {};
    const v = await advWindValue();
    if (v === null || !isFinite(v)) { advTick.active.a83 = false; advTick.active.a84 = false; return; }
    const was = advTick.active.a84 ? 2 : (advTick.active.a83 ? 1 : 0);
    let lvl = 0;
    if (v >= 17.2) lvl = 2; else if (v >= 10.8) lvl = 1;
    if (was === 2 && lvl < 2 && v >= 15.48) lvl = 2;
    if (lvl < 1 && was >= 1 && v >= 9.72) lvl = 1;
    advTick.active.a83 = (lvl === 1) && off.a83 !== true;
    advTick.active.a84 = (lvl === 2) && off.a84 !== true;
    if (!advTick.cur && (advTick.active.a83 || advTick.active.a84)) advNext();
  } catch (e) { console.warn("advice wind:", e); }
}
const _advRefreshPrevWind = advRefresh;
advRefresh = async function () {
  await _advRefreshPrevWind();
  await advWindCheck();
};
window.addEventListener("load", function () {
  ["a83", "a84"].forEach(id => { if (ADVICE_READY.indexOf(id) < 0) ADVICE_READY.push(id); });
});
/* ===== Освещённость: пунктиры порогов «Офис / Дом» и «Улица» ===== */
Chart.register({
  id: "luxThrLines",
  beforeDatasetsDraw(chart) {
    if (typeof currentKey === "undefined" || currentKey !== "lux") return;
    const c = luxCfg();
    if (!c.on) return;
    const sc = chart.scales.y || Object.values(chart.scales).find(s => s.axis === "y");
    if (!sc) return;
    const area = chart.chartArea;
    const ctx = chart.ctx;
    [
      { v: c.thr_home,   c: "#ffcf4d", n: prT("lux_l_home", "Офис / Дом") },
      { v: c.thr_street, c: "#ff9d4d", n: prT("lux_l_street", "Улица") }
    ].forEach(L => {
      if (!isFinite(L.v) || L.v < sc.min || L.v > sc.max) return;
      const y = sc.getPixelForValue(L.v);
      ctx.save();
      ctx.beginPath();
      ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
      ctx.clip();
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
      ctx.fillText(L.n + " " + String(+L.v.toPrecision(3)), area.right - 4, y - 2);
      ctx.restore();
    });
  }
});

/* ===== Нижняя строка: советы по освещённости (a85 дом/офис, a86 улица) ===== */
async function advLuxCheck() {
  if (document.hidden || !SETTINGS) return;
  try {
    const c = luxCfg();
    const off = (SETTINGS.advice && SETTINGS.advice.disabled) || {};
    const items = [
      { id: "a85", which: "in",  thr: c.thr_home },
      { id: "a86", which: "out", thr: c.thr_street }
    ];
    for (const it of items) {
      if (!c.on || off[it.id] === true) { advTick.active[it.id] = false; continue; }
      const v = await advLatestDevice(it.which, "lux");
      if (v === null || !isFinite(v)) { advTick.active[it.id] = false; continue; }
      if (v < it.thr) advTick.active[it.id] = true;
      else if (v > it.thr * 1.1) advTick.active[it.id] = false;
    }
    if (!advTick.cur && (advTick.active.a85 || advTick.active.a86)) advNext();
  } catch (e) { console.warn("advice lux:", e); }
}
const _advRefreshPrevLux = advRefresh;
advRefresh = async function () {
  await _advRefreshPrevLux();
  await advLuxCheck();
};
window.addEventListener("load", function () {
  ["a85", "a86"].forEach(id => { if (ADVICE_READY.indexOf(id) < 0) ADVICE_READY.push(id); });
});
/* ===== Нижняя строка: советы по солнечной радиации (a87 превышение, a88 уменьшение) ===== */
async function advSolarCheck() {
  if (document.hidden || !SETTINGS) return;
  try {
    const c = solarCfg();
    const off = (SETTINGS.advice && SETTINGS.advice.disabled) || {};
    if (!c.on) { advTick.active.a87 = false; advTick.active.a88 = false; return; }
    const v = await advLatestDevice("out", "solar");
    if (v === null || !isFinite(v)) { advTick.active.a87 = false; advTick.active.a88 = false; return; }
    if (off.a87 === true) advTick.active.a87 = false;
    else if (v >= c.thr_high) advTick.active.a87 = true;
    else if (v < c.thr_high * 0.9) advTick.active.a87 = false;
    if (off.a88 === true) advTick.active.a88 = false;
    else if (v < c.thr_low) advTick.active.a88 = true;
    else if (v > c.thr_low * 1.1) advTick.active.a88 = false;
    if (!advTick.cur && (advTick.active.a87 || advTick.active.a88)) advNext();
  } catch (e) { console.warn("advice solar:", e); }
}
const _advRefreshPrevSolar = advRefresh;
advRefresh = async function () {
  await _advRefreshPrevSolar();
  await advSolarCheck();
};
window.addEventListener("load", function () {
  ["a87", "a88"].forEach(id => { if (ADVICE_READY.indexOf(id) < 0) ADVICE_READY.push(id); });
});
/* ===== Нижняя строка: советы по УФ-индексу (a89 умеренный ... a92 экстремальный) ===== */
async function advUvValue() {
  let v = await advLatestDevice("out", "uv");
  if (v !== null && isFinite(v)) return v;
  const now = Math.floor(Date.now() / 1000);
  for (const src of ["open-meteo", "owm"]) {
    const ws = SETTINGS.weather_sources && SETTINGS.weather_sources[src];
    if (!ws || !ws.map) continue;
    const params = Object.keys(ws.map).filter(p => ws.map[p] === "uv");
    for (const p of params) {
      const rows = await loadWeatherSeries(src, p, now - 3 * 3600, now);
      if (rows.length) return Number(rows[rows.length - 1].val);
    }
  }
  return null;
}
async function advUvCheck() {
  if (document.hidden || !SETTINGS) return;
  const ids = ["a89", "a90", "a91", "a92"];
  try {
    const off = (SETTINGS.advice && SETTINGS.advice.disabled) || {};
    const v = await advUvValue();
    if (v === null || !isFinite(v)) { ids.forEach(i => { advTick.active[i] = false; }); return; }
    const thr = [3, 6, 8, 11];
    let lvl = 0;
    for (let i = 0; i < thr.length; i++) if (v >= thr[i]) lvl = i + 1;
    let was = 0;
    ids.forEach((id, i) => { if (advTick.active[id]) was = i + 1; });
    if (was > lvl && v >= thr[was - 1] - 0.3) lvl = was;
    ids.forEach((id, i) => { advTick.active[id] = (lvl === i + 1) && off[id] !== true; });
    if (!advTick.cur && ids.some(i => advTick.active[i])) advNext();
  } catch (e) { console.warn("advice uv:", e); }
}
const _advRefreshPrevUv = advRefresh;
advRefresh = async function () {
  await _advRefreshPrevUv();
  await advUvCheck();
};
window.addEventListener("load", function () {
  ["a89", "a90", "a91", "a92"].forEach(id => { if (ADVICE_READY.indexOf(id) < 0) ADVICE_READY.push(id); });
});
/* ===== УФ-индекс: источник по выбору и галка Вкл/Выкл для советов ===== */
advUvValue = async function () {
  const c = uvCfg();
  if (!c.on) return null;
  if (c.src === "auto" || c.src === "dev") {
    const d = await advLatestDevice("out", "uv");
    if (d !== null && isFinite(d)) return d;
    if (c.src === "dev") return null;
  }
  const now = Math.floor(Date.now() / 1000);
  const list = (c.src === "open-meteo" || c.src === "owm") ? [c.src] : ["open-meteo", "owm"];
  for (const src of list) {
    const ws = SETTINGS.weather_sources && SETTINGS.weather_sources[src];
    if (!ws || !ws.map) continue;
    const params = Object.keys(ws.map).filter(p => ws.map[p] === "uv");
    for (const p of params) {
      const rows = await loadWeatherSeries(src, p, now - 3 * 3600, now);
      if (rows.length) return Number(rows[rows.length - 1].val);
    }
  }
  return null;
};

/* ===== УФ-индекс: четыре пунктира 3, 6, 8, 11 ===== */
Chart.register({
  id: "uvThrLines",
  beforeDatasetsDraw(chart) {
    if (typeof currentKey === "undefined" || currentKey !== "uv") return;
    if (!uvCfg().on) return;
    const sc = chart.scales.y || Object.values(chart.scales).find(s => s.axis === "y");
    if (!sc) return;
    const area = chart.chartArea;
    const ctx = chart.ctx;
    [
      { v: 3,  c: "#ffcf4d" },
      { v: 6,  c: "#ff9d4d" },
      { v: 8,  c: "#ff4d4d" },
      { v: 11, c: "#d62839" }
    ].forEach(L => {
      if (L.v < sc.min || L.v > sc.max) return;
      const y = sc.getPixelForValue(L.v);
      ctx.save();
      ctx.beginPath();
      ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
      ctx.clip();
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
/* ===== Пыльца: пунктиры порогов (цвет — как у линии этого вида) ===== */
Chart.register({
  id: "pollenThrLines",
  beforeDatasetsDraw(chart) {
    if (typeof currentKey === "undefined" || currentKey !== "pollen") return;
    const c = pollenCfg();
    if (!c.on) return;
    const sc = chart.scales.y || Object.values(chart.scales).find(s => s.axis === "y");
    if (!sc) return;
    const area = chart.chartArea;
    const ctx = chart.ctx;
    const used = [];
    POLLEN_KINDS.forEach(k => {
      const ds = chart.data.datasets.find(d => typeof d.label === "string" &&
        k.names.some(n => d.label.endsWith(n)));
      if (!ds) return;
      const v = c.thr[k.id];
      if (!isFinite(v) || v < sc.min || v > sc.max) return;
      const col = ds.borderColor || "#9be564";
      const y = sc.getPixelForValue(v);
      let ty = y - 2;
      while (used.some(u => Math.abs(u - ty) < 12)) ty -= 12;
      used.push(ty);
      ctx.save();
      ctx.beginPath();
      ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
      ctx.clip();
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
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
      ctx.fillText(prT("pol_n_" + k.id, k.ru) + " " + String(+v.toPrecision(3)), area.right - 4, ty);
      ctx.restore();
    });
  }
});

/* ===== Нижняя строка: советы по пыльце (a93–a98) ===== */
async function advPollenCheck() {
  if (document.hidden || !SETTINGS) return;
  try {
    const c = pollenCfg();
    const off = (SETTINGS.advice && SETTINGS.advice.disabled) || {};
    const now = Math.floor(Date.now() / 1000);
    const srcOn = !(SETTINGS.config_items && SETTINGS.config_items.open_meteo_air === false);
    for (const k of POLLEN_KINDS) {
      if (!c.on || !srcOn || off[k.a] === true) { advTick.active[k.a] = false; continue; }
      const rows = await loadWeatherSeries("open-meteo-air", k.f, now - 3 * 3600, now);
      if (!rows.length) { advTick.active[k.a] = false; continue; }
      const v = Number(rows[rows.length - 1].val);
      if (!isFinite(v)) { advTick.active[k.a] = false; continue; }
      const thr = c.thr[k.id];
      if (v >= thr) advTick.active[k.a] = true;
      else if (v < thr * 0.9) advTick.active[k.a] = false;
    }
    if (!advTick.cur && POLLEN_KINDS.some(k => advTick.active[k.a])) advNext();
  } catch (e) { console.warn("advice pollen:", e); }
}
const _advRefreshPrevPollen = advRefresh;
advRefresh = async function () {
  await _advRefreshPrevPollen();
  await advPollenCheck();
};
window.addEventListener("load", function () {
  ["a93", "a94", "a95", "a96", "a97", "a98"].forEach(id => { if (ADVICE_READY.indexOf(id) < 0) ADVICE_READY.push(id); });
});
/* ===== Метан CH₄: температура для пересчёта, пунктир порога, совет a99 ===== */
async function ch4TempRefresh() {
  try {
    const c = ch4Cfg();
    if (c.t_mode === "fix") { CH4_T = c.t_fix; return; }
    const v = await advLatestDevice("in", "temp");
    CH4_T = (v !== null && isFinite(v)) ? v : 25;
  } catch (e) { CH4_T = 25; }
}
Chart.register({
  id: "ch4ThrLine",
  beforeDatasetsDraw(chart) {
    if (typeof currentKey === "undefined" || currentKey !== "ch4") return;
    const c = ch4Cfg();
    if (!c.on) return;
    const sc = chart.scales.y || Object.values(chart.scales).find(s => s.axis === "y");
    if (!sc) return;
    const v = ch4PpmTo(c.thr_ppm, SETTINGS.units.ch4 || "ppm");
    if (!isFinite(v) || v < sc.min || v > sc.max) return;
    const area = chart.chartArea;
    const ctx = chart.ctx;
    const y = sc.getPixelForValue(v);
    const col = "#d62839";
    ctx.save();
    ctx.beginPath();
    ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
    ctx.clip();
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
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
    ctx.fillText(String(+v.toPrecision(4)), area.right - 4, y - 2);
    ctx.restore();
  }
});
async function advCh4Check() {
  if (document.hidden || !SETTINGS) return;
  try {
    const c = ch4Cfg();
    const off = (SETTINGS.advice && SETTINGS.advice.disabled) || {};
    if (!c.on || off.a99 === true) { advTick.active.a99 = false; return; }
    const v = await advLatestDevice("in", "ch4");
    if (v === null || !isFinite(v)) { advTick.active.a99 = false; return; }
    const ppm = v / ch4UgPerPpm(CH4_T);
    if (ppm >= c.thr_ppm) advTick.active.a99 = true;
    else if (ppm < c.thr_ppm * 0.9) advTick.active.a99 = false;
    if (!advTick.cur && advTick.active.a99) advNext();
  } catch (e) { console.warn("advice ch4:", e); }
}
const _advRefreshPrevCh4 = advRefresh;
advRefresh = async function () {
  await _advRefreshPrevCh4();
  await ch4TempRefresh();
  await advCh4Check();
};
window.addEventListener("load", function () {
  if (ADVICE_READY.indexOf("a99") < 0) ADVICE_READY.push("a99");
  setTimeout(ch4TempRefresh, 3000);
});
/* ===== Влажность: четыре пунктира порогов ===== */
Chart.register({
  id: "humThrLines",
  beforeDatasetsDraw(chart) {
    if (typeof currentKey === "undefined" || currentKey !== "rh") return;
    const c = humCfg();
    if (!c.on) return;
    const sc = chart.scales.y || Object.values(chart.scales).find(s => s.axis === "y");
    if (!sc) return;
    const area = chart.chartArea;
    const ctx = chart.ctx;
    const used = [];
    [
      { v: c.thr.home_low,  c: "#ffcf4d", n: prT("hum_l_home", "Дом") },
      { v: c.thr.home_high, c: "#ffcf4d", n: prT("hum_l_home", "Дом") },
      { v: c.thr.st_high,   c: "#ff4d4d", n: prT("hum_l_street", "Улица") },
      { v: c.thr.st_low,    c: "#ffcf4d", n: prT("hum_l_street", "Улица") }
    ].forEach(L => {
      if (!isFinite(L.v) || L.v < sc.min || L.v > sc.max) return;
      const y = sc.getPixelForValue(L.v);
      let ty = y - 2;
      while (used.some(u => Math.abs(u - ty) < 12)) ty -= 12;
      used.push(ty);
      ctx.save();
      ctx.beginPath();
      ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
      ctx.clip();
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
      ctx.fillText(L.n + " " + String(+L.v.toPrecision(3)), area.right - 4, ty);
      ctx.restore();
    });
  }
});

/* ===== Нижняя строка: советы по влажности (a100–a103) ===== */
async function advHumValue(which, src) {
  if (src === "auto" || src === "dev") {
    const d = await advLatestDevice(which, "rh");
    if (d !== null && isFinite(d)) return d;
    if (src === "dev" || which === "in") return null;
  }
  const now = Math.floor(Date.now() / 1000);
  const list = (src === "open-meteo" || src === "owm") ? [src] : ["open-meteo", "owm"];
  for (const s of list) {
    const ws = SETTINGS.weather_sources && SETTINGS.weather_sources[s];
    if (!ws || !ws.map) continue;
    const params = Object.keys(ws.map).filter(p => ws.map[p] === "rh");
    for (const p of params) {
      const rows = await loadWeatherSeries(s, p, now - 3 * 3600, now);
      if (rows.length) return Number(rows[rows.length - 1].val);
    }
  }
  return null;
}
async function advHumCheck() {
  if (document.hidden || !SETTINGS) return;
  try {
    const c = humCfg();
    const off = (SETTINGS.advice && SETTINGS.advice.disabled) || {};
    const vHome = c.on ? await advHumValue("in", c.src_in) : null;
    const vOut = c.on ? await advHumValue("out", c.src_out) : null;
    const items = [
      { id: "a100", v: vHome, thr: c.thr.home_low,  low: true },
      { id: "a101", v: vHome, thr: c.thr.home_high, low: false },
      { id: "a102", v: vOut,  thr: c.thr.st_high,   low: false },
      { id: "a103", v: vOut,  thr: c.thr.st_low,    low: true }
    ];
    items.forEach(it => {
      if (!c.on || off[it.id] === true || it.v === null || !isFinite(it.v)) { advTick.active[it.id] = false; return; }
      if (it.low) {
        if (it.v < it.thr) advTick.active[it.id] = true;
        else if (it.v > it.thr * 1.1) advTick.active[it.id] = false;
      } else {
        if (it.v >= it.thr) advTick.active[it.id] = true;
        else if (it.v < it.thr * 0.9) advTick.active[it.id] = false;
      }
    });
    if (!advTick.cur && items.some(i => advTick.active[i.id])) advNext();
  } catch (e) { console.warn("advice hum:", e); }
}
const _advRefreshPrevHum = advRefresh;
advRefresh = async function () {
  await _advRefreshPrevHum();
  await advHumCheck();
};
window.addEventListener("load", function () {
  ["a100", "a101", "a102", "a103"].forEach(id => { if (ADVICE_READY.indexOf(id) < 0) ADVICE_READY.push(id); });
});
/* ===== Частицы PM: 8 пунктиров на графике и 8 советов (a104–a111) =====
   Пунктиры: для каждого из четырёх видов рисуются два уровня —
   «Вреден для чувствительных» (оранжевый) и «Опасный» (тёмно-красный).
   Линия видна, только если значение попадает в шкалу графика: шкалу она не растягивает. */
Chart.register({
  id: "pmThrLines",
  beforeDatasetsDraw(chart) {
    if (typeof currentKey === "undefined" || currentKey !== "pm") return;
    const c = pmCfg();
    if (!c.on) return;
    const sc = chart.scales.y || Object.values(chart.scales).find(s => s.axis === "y");
    if (!sc) return;
    const area = chart.chartArea;
    const ctx = chart.ctx;
    const used = [];
    PM_KINDS.forEach(k => {
      [{ v: c.thr[k.id][3], c: "#ff9d4d" }, { v: c.thr[k.id][4], c: "#d62839" }].forEach(L => {
        if (!isFinite(L.v) || L.v < sc.min || L.v > sc.max) return;
        const y = sc.getPixelForValue(L.v);
        let ty = y - 2;
        while (used.some(u => Math.abs(u - ty) < 12)) ty -= 12;
        used.push(ty);
        ctx.save();
        ctx.beginPath();
        ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
        ctx.clip();
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
        ctx.fillText(k.label + " " + String(+L.v.toPrecision(3)), area.right - 4, ty);
        ctx.restore();
      });
    });
  }
});

/* Последнее значение с устройства по его собственному имени (pm1, pm25, pm4, pm10).
   Берутся данные не старше 30 минут. Если устройство выключено или данных нет — возвращает null. */
async function advLatestDeviceKey(which, devKey) {
  const sn = which === "out" ? SETTINGS.sn_out : SETTINGS.sn_in;
  const on = SETTINGS.config_items[which === "out" ? "dev_out" : "dev_in"] === true;
  if (!sn || !on) return null;
  const since = Math.floor(Date.now() / 1000) - 30 * 60;
  const { data } = await client.from("measurements").select("val, ts_device")
    .eq("serial", sn).eq("key", devKey).gte("ts_device", since)
    .order("ts_device", { ascending: false }).limit(1);
  return (data && data.length) ? Number(data[0].val) : null;
}
/* Значение частицы с учётом выбранного источника:
   «Авто» — сначала устройство, потом Open-Meteo Air; «Уличное устройство» — только оно;
   «Open-Meteo Air» — только интернет. У PM1.0 и PM4.0 интернета нет. */
async function advPmValue(k, src) {
  if (src === "auto" || src === "dev") {
    const d = await advLatestDeviceKey("out", k.dev);
    if (d !== null && isFinite(d)) return d;
    if (src === "dev") return null;
  }
  if (!k.web) return null;
  if (SETTINGS.config_items.open_meteo_air === false) return null;
  const now = Math.floor(Date.now() / 1000);
  const rows = await loadWeatherSeries("open-meteo-air", k.web, now - 3 * 3600, now);
  return rows.length ? Number(rows[rows.length - 1].val) : null;
}
/* Проверка советов: уровень 0 — тихо, 1 — «вреден», 2 — «опасный».
   Чтобы совет не мигал на границе, он снимается, когда значение упало примерно на 10 % ниже порога. */
async function advPmCheck() {
  if (document.hidden || !SETTINGS) return;
  try {
    const c = pmCfg();
    const off = (SETTINGS.advice && SETTINGS.advice.disabled) || {};
    for (const k of PM_KINDS) {
      const idH = k.a[0], idD = k.a[1];
      const v = c.on ? await advPmValue(k, c.src) : null;
      if (v === null || !isFinite(v)) { advTick.active[idH] = false; advTick.active[idD] = false; continue; }
      const h = c.thr[k.id][3], d = c.thr[k.id][4];
      const was = advTick.active[idD] ? 2 : (advTick.active[idH] ? 1 : 0);
      let lvl = v >= d ? 2 : (v >= h ? 1 : 0);
      if (was === 2 && lvl < 2 && v >= d * 0.9) lvl = 2;
      if (was >= 1 && lvl < 1 && v >= h * 0.9) lvl = 1;
      advTick.active[idH] = (lvl === 1) && off[idH] !== true;
      advTick.active[idD] = (lvl === 2) && off[idD] !== true;
    }
    if (!advTick.cur && PM_KINDS.some(k => advTick.active[k.a[0]] || advTick.active[k.a[1]])) advNext();
  } catch (e) { console.warn("advice pm:", e); }
}
const _advRefreshPrevPm = advRefresh;
advRefresh = async function () {
  await _advRefreshPrevPm();
  await advPmCheck();
};
window.addEventListener("load", function () {
  ["a104", "a105", "a106", "a107", "a108", "a109", "a110", "a111"].forEach(id => {
    if (ADVICE_READY.indexOf(id) < 0) ADVICE_READY.push(id);
  });
});
/* ===== Радиация: три пунктира порогов и советы a112–a116 =====
   Пунктиры: Внимание (жёлтый), Повышенный фон (оранжевый), Тревога (тёмно-красный).
   Шкалу графика они не растягивают: если фон до уровня не дошёл, линии не видно. */
Chart.register({
  id: "radThrLines",
  beforeDatasetsDraw(chart) {
    if (typeof currentKey === "undefined" || currentKey !== "rad") return;
    const c = radCfg();
    if (!c.on) return;
    const sc = chart.scales.y || Object.values(chart.scales).find(s => s.axis === "y");
    if (!sc) return;
    const area = chart.chartArea;
    const ctx = chart.ctx;
    const unit = SETTINGS.units.rad || "uSv";
    const cols = ["#ffcf4d", "#ff9d4d", "#d62839"];
    const used = [];
    c.thr.forEach((thr, i) => {
      const v = convertUnit(thr, "rad", unit);
      if (!isFinite(v) || v < sc.min || v > sc.max) return;
      const y = sc.getPixelForValue(v);
      let ty = y - 2;
      while (used.some(u => Math.abs(u - ty) < 12)) ty -= 12;
      used.push(ty);
      ctx.save();
      ctx.beginPath();
      ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
      ctx.clip();
      ctx.strokeStyle = cols[i];
      ctx.fillStyle = cols[i];
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
      ctx.fillText(String(+v.toPrecision(3)), area.right - 4, ty);
      ctx.restore();
    });
  }
});

/* Значения радиации устройства (in — домашнее, out — уличное) за последние 6 часов.
   Возвращает список {ts, val}; если устройства или счётчика нет — пустой список. */
async function radDevSeries(which, fromTs) {
  if (!radDevHas(which)) return [];
  const dev = SETTINGS.devices[which];
  const sn = which === "out" ? SETTINGS.sn_out : SETTINGS.sn_in;
  const keys = Object.keys(dev.map).filter(k => dev.map[k] === "rad");
  const { data } = await client.from("measurements").select("val, ts_device")
    .eq("serial", sn).in("key", keys).gte("ts_device", fromTs)
    .order("ts_device", { ascending: true }).limit(2000);
  return (data || []).map(r => ({ ts: Number(r.ts_device), val: Number(r.val) })).filter(r => isFinite(r.val));
}
/* Из списка берём: peak — максимум за «окно пиков»; base — обычный фон
   (среднее за время ДО этого окна, нужно не меньше 3 точек, иначе base = null). */
function radAnalyze(rows, winSec, now) {
  const inWin = rows.filter(r => r.ts >= now - winSec);
  if (!inWin.length) return null;
  const before = rows.filter(r => r.ts < now - winSec);
  return {
    peak: Math.max.apply(null, inWin.map(r => r.val)),
    base: before.length >= 3 ? before.reduce((s, r) => s + r.val, 0) / before.length : null
  };
}
/* Идём по списку источников и берём первый, у которого есть свежие данные. */
async function radPick(list, winSec) {
  const now = Math.floor(Date.now() / 1000);
  for (const which of list) {
    const a = radAnalyze(await radDevSeries(which, now - 6 * 3600), winSec, now);
    if (a) { a.which = which; return a; }
  }
  return null;
}
/* Резкий рост: пик выше обычного фона на «Разницу, %» и больше чем на 0,10 мкЗв/ч.
   Если совет уже горит, он держится, пока рост не упал меньше половины разницы (и меньше 0,05). */
function radSpike(a, diff, wasOn) {
  if (!a || a.base === null) return false;
  const k = wasOn ? diff / 200 : diff / 100;
  const dmin = wasOn ? 0.05 : 0.10;
  return a.peak > a.base * (1 + k) && (a.peak - a.base) > dmin;
}
async function advRadCheck() {
  if (document.hidden || !SETTINGS) return;
  const ids = ["a112", "a113", "a114", "a115", "a116"];
  try {
    const c = radCfg();
    const off = (SETTINGS.advice && SETTINGS.advice.disabled) || {};
    if (!c.on) { ids.forEach(i => { advTick.active[i] = false; }); return; }
    const winSec = c.win * 60;
    const homeList = c.src_in === "in" ? ["in"] : (c.src_in === "out" ? ["out"] : ["in", "out"]);
    const streetList = c.src_out === "web" ? [] : ["out"];
    const home = await radPick(homeList, winSec);
    /* уровни по порогам: 0 — тихо, 1 — Внимание, 2 — Повышенный фон, 3 — Тревога */
    let lvl = 0;
    if (home) c.thr.forEach((t, i) => { if (home.peak >= t) lvl = i + 1; });
    let was = 0;
    ["a112", "a113", "a114"].forEach((id, i) => { if (advTick.active[id]) was = i + 1; });
    if (home && was > lvl && home.peak >= c.thr[was - 1] * 0.9) lvl = was;
    ["a112", "a113", "a114"].forEach((id, i) => { advTick.active[id] = (lvl === i + 1) && off[id] !== true; });
    /* резкий рост: сравнение улицы с домом */
    let street = null;
    if (c.cmp && radStreetExists()) street = await radPick(streetList, winSec);
    if (street && home && street.which === home.which) street = null;
    const streetSpike = radSpike(street, c.diff, !!advTick.active.a115);
    const homeSpike = radSpike(home, c.diff, !!advTick.active.a116);
    advTick.active.a115 = streetSpike && off.a115 !== true;
    advTick.active.a116 = homeSpike && !streetSpike && off.a116 !== true;
    if (!advTick.cur && ids.some(i => advTick.active[i])) advNext();
  } catch (e) { console.warn("advice rad:", e); }
}
const _advRefreshPrevRad = advRefresh;
advRefresh = async function () {
  await _advRefreshPrevRad();
  await advRadCheck();
};
window.addEventListener("load", function () {
  ["a112", "a113", "a114", "a115", "a116"].forEach(id => { if (ADVICE_READY.indexOf(id) < 0) ADVICE_READY.push(id); });
});
/* ===== Радиация: «обычный фон» = медиана за 24 часа (вместо среднего за 6 часов) =====
   Медиана — это «типичное значение за сутки»: короткие пики и рост последних часов её не сдвигают.
   Поэтому и быстрый скачок, и медленный рост за несколько часов сравниваются с обычным суточным фоном.
   Первые сутки после подключения устройства совет о резком росте молчит: сравнивать пока не с чем
   (три порога 0,25 / 0,40 / 0,80 при этом работают сразу). */
radAnalyze = function (rows, winSec, now) {
  const inWin = rows.filter(r => r.ts >= now - winSec);
  if (!inWin.length) return null;
  const before = rows.filter(r => r.ts < now - winSec).map(r => r.val).sort((a, b) => a - b);
  /* истории достаточно, если самая старая запись не моложе 20 часов и точек не меньше 30 */
  const enough = rows.length && rows[0].ts <= now - 20 * 3600 && before.length >= 30;
  let base = null;
  if (enough) {
    const m = Math.floor(before.length / 2);
    base = before.length % 2 ? before[m] : (before[m - 1] + before[m]) / 2;
  }
  return { peak: Math.max.apply(null, inWin.map(r => r.val)), base: base };
};
/* Список источников перебираем так же, как раньше, но данные берём за 24 часа */
radPick = async function (list, winSec) {
  const now = Math.floor(Date.now() / 1000);
  for (const which of list) {
    const a = radAnalyze(await radDevSeries(which, now - 24 * 3600), winSec, now);
    if (a) { a.which = which; return a; }
  }
  return null;
};
/* ===== Вкладка «Облачный мониторинг» (бывшая «API OUT») =====
   Что здесь есть:
   1) CLOUD_PLATFORMS — три платформы: название, подпись поля ключа и шаги регистрации.
   2) cloudCfg() — читает сохранённое (SETTINGS.cloud) и подставляет значения по умолчанию.
   3) cloudSensors() — список датчиков устройства: берётся из карты параметров устройства.
   4) cloudLive() — «живое» ли устройство: есть ли в базе данные не старше N дней.
   5) cloudRender() — рисует страницу и карточки; cloudSave() — сохраняет выбор.
   Сохраняется в SETTINGS.cloud: fresh_days, interval_min, hide_place и по каждой платформе:
   on (включена), id (ключ или номер), out/in (отправлять ли, какие датчики выключены/включены).
   Сама отправка во внешние сервисы читает эти настройки на сервере (часть 2 шага). */
const CLOUD_PLATFORMS = [
  { id: "narodmon", name: "Narodmon.ru", site: "https://narodmon.ru",
    idLabel: ["cl_nm_id", "Идентификатор устройства (MAC-адрес или серийный номер)"],
    steps: [
      ["cl_nm_1", "Откройте narodmon.ru, нажмите «ВХОД» и выберите «Стать участником проекта» (или «Регистрация»)."],
      ["cl_nm_2", "Укажите адрес электронной почты, подтвердите, что вы не робот, и согласитесь с условиями."],
      ["cl_nm_3", "Логин и пароль придут на почту. Войдите в личный кабинет."],
      ["cl_nm_4", "Вставьте в поле выше идентификатор устройства (MAC-адрес или серийный номер), поставьте галку «Включить» и сохраните."],
      ["cl_nm_5", "После первой отправки данных добавьте устройство на сайте в разделе «Мои датчики», указав этот же идентификатор."]
    ] },
  { id: "thingspeak", name: "ThingSpeak", site: "https://thingspeak.mathworks.com",
    idLabel: ["cl_ts_id", "Write API Key (ключ записи канала)"],
    steps: [
      ["cl_ts_1", "Откройте thingspeak.mathworks.com и создайте бесплатную учётную запись."],
      ["cl_ts_2", "Создайте канал (New Channel) и включите в нём нужные поля. В одном канале не больше 8 полей."],
      ["cl_ts_3", "Откройте вкладку «API Keys» канала и скопируйте «Write API Key»."],
      ["cl_ts_4", "Вставьте ключ в поле выше, поставьте галку «Включить» и сохраните."]
    ] },
  { id: "sensor_community", name: "Sensor.community", site: "https://devices.sensor.community",
    idLabel: ["cl_sc_id", "Номер датчика (Sensor ID)"],
    steps: [
      ["cl_sc_1", "Откройте devices.sensor.community и зарегистрируйтесь."],
      ["cl_sc_2", "В личном кабинете нажмите «Add new sensor» и выберите типы датчиков, например SPS30 (частицы) и SHT3x (температура и влажность)."],
      ["cl_sc_3", "После регистрации вы получите номер датчика (Sensor ID)."],
      ["cl_sc_4", "Вставьте номер в поле выше, поставьте галку «Включить» и сохраните."]
    ] }
];
/* что пока не отправляем никуда: радиация и газы */
const CLOUD_BLOCKED = ["rad", "hcho", "ch4", "co", "co2", "nh3", "no", "no2", "o3", "so2"];
function clEsc(s) { return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }
function clSid(dk) { return String(dk).replace(/[^\w-]/g, "_"); }
function cloudCfg() {
  const c = (SETTINGS && SETTINGS.cloud) || {};
  const fd = Number(c.fresh_days), iv = Number(c.interval_min);
  const pl = c.platforms || {};
  const out = {
    fresh_days: fd >= 1 ? Math.round(fd) : 10,
    interval_min: iv >= 1 ? iv : 4,
    hide_place: c.hide_place === true,
    platforms: {}
  };
  CLOUD_PLATFORMS.forEach(p => {
    const s = pl[p.id] || {};
    out.platforms[p.id] = {
      on: s.on === true,
      id: s.id || "",
      out: { send: (s.out && s.out.send !== undefined) ? s.out.send === true : true, off: (s.out && s.out.off) || {} },
      in:  { send: (s.in && s.in.send !== undefined) ? s.in.send === true : false, on: (s.in && s.in.on) || {} }
    };
  });
  return out;
}
/* Датчики устройства: out — уличное, in — домашнее. Берём из карты параметров устройства. */
function cloudSensors(which) {
  const dev = SETTINGS.devices && SETTINGS.devices[which];
  const map = (dev && dev.map) || {};
  const res = [];
  Object.keys(map).forEach(dk => {
    const pk = map[dk];
    if (!pk || pk === "no") return;
    const p = PARAMS.find(x => x.key === pk);
    let label = p ? t(p.i18n) : dk;
    if (p && p.lines) { const ln = p.lines.find(l => l.dbkey === dk); if (ln) label = ln.label; }
    res.push({ dk: dk, pk: pk, label: label });
  });
  const pr = ["temp", "rh", "pressure", "wind_spd", "wind_dir", "pm", "uv", "solar", "lux"];
  res.sort((a, b) => {
    const ia = pr.indexOf(a.pk), ib = pr.indexOf(b.pk);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return res;
}
/* Почему датчик нельзя отправлять на эту платформу (пустая строка — можно) */
function cloudBlockReason(pid, s) {
  if (CLOUD_BLOCKED.indexOf(s.pk) >= 0) return prT("cl_no_gas", "пока не отправляется");
  if (pid === "sensor_community") {
    const ok = ["temp", "rh", "pressure"].indexOf(s.pk) >= 0 || s.dk === "pm25" || s.dk === "pm10";
    if (!ok) return prT("cl_no_plat", "платформа не принимает");
  }
  return "";
}
/* Устройство «живое»: включено, введён серийный номер и есть данные не старше N дней */
async function cloudLive(which) {
  const sn = which === "out" ? SETTINGS.sn_out : SETTINGS.sn_in;
  const on = SETTINGS.config_items[which === "out" ? "dev_out" : "dev_in"] === true;
  if (!sn || !on) return false;
  const since = Math.floor(Date.now() / 1000) - cloudCfg().fresh_days * 86400;
  try {
    const { data } = await client.from("measurements").select("ts_device")
      .eq("serial", sn).gte("ts_device", since).order("ts_device", { ascending: false }).limit(1);
    return !!(data && data.length);
  } catch (e) { return false; }
}
function cloudCoordsText(hide) {
  const la = Number(SETTINGS.lat), lo = Number(SETTINGS.lon);
  if (!isFinite(la) || !isFinite(lo)) return "—";
  return hide ? la.toFixed(2) + ", " + lo.toFixed(2) : la.toFixed(4) + ", " + lo.toFixed(4);
}
function cloudCardHtml(p, c, live, sens) {
  const st = c.platforms[p.id];
  const any = live.out || live.in;
  let n = 0;
  const blocks = ["out", "in"].map(which => {
    const isLive = live[which];
    const send = which === "out" ? st.out.send : st.in.send;
    const items = sens[which].map(s => {
      const why = cloudBlockReason(p.id, s);
      let on = false;
      if (!why) {
        on = which === "out" ? !st.out.off[s.dk] : st.in.on[s.dk] === true;
        if (on && p.id === "thingspeak") { if (n >= 8) on = false; else n++; }
      }
      const dis = (why || !isLive) ? "disabled" : "";
      return '<label class="set-check" style="display:inline-flex;margin:2px 14px 2px 0;' + (dis ? 'opacity:.5;' : '') + '">' +
        '<input type="checkbox" class="cl_s_' + p.id + '" id="cl_s_' + p.id + '_' + which + '_' + clSid(s.dk) + '" ' +
        (on ? "checked " : "") + dis + '> ' + s.label + (why ? ' (' + why + ')' : '') + '</label>';
    }).join("");
    const head = (which === "out" ? prT("cl_out", "Уличное устройство") : prT("cl_in", "Домашнее устройство")) + ': ' +
      (isLive ? prT("cl_found", "найдено, датчиков") + ' ' + sens[which].length : prT("cl_nofound", "нет свежих данных"));
    return '<div style="margin:10px 0;padding:8px 10px;border:1px solid var(--card-border);border-radius:10px;' + (isLive ? '' : 'opacity:.5;') + '">' +
      '<div style="font-weight:600;margin-bottom:4px;">' + head + '</div>' +
      '<label class="set-check"><input type="checkbox" id="cl_send_' + p.id + '_' + which + '" ' + (send ? "checked " : "") +
      (isLive ? "" : "disabled") + '> ' + prT("cl_send", "Отправлять") + '</label>' + items + '</div>';
  }).join("");
  const steps = p.steps.map(s => '<li>' + prT(s[0], s[1]) + '</li>').join("");
  const tsNote = p.id === "thingspeak"
    ? '<div class="set-hint" id="cl_lim_thingspeak">' + prT("cl_ts_lim", "В одном канале ThingSpeak не больше 8 величин. Лишнюю отметить не получится.") + '</div>' : '';
  return '<div class="set-section" style="' + (any ? '' : 'opacity:.45;pointer-events:none;') + '">' +
    '<h3>' + p.name + '</h3>' +
    '<label class="set-check"><input type="checkbox" id="cl_on_' + p.id + '" ' + (st.on ? "checked" : "") + '> ' + t("api_enable") + '</label>' +
    '<div class="set-row"><label>' + prT(p.idLabel[0], p.idLabel[1]) + '</label>' +
    '<input id="cl_id_' + p.id + '" class="set-input" type="text" value="' + clEsc(st.id) + '"></div>' +
    tsNote + blocks +
    '<div class="param-desc" style="margin-top:8px;">' + prT("cl_how", "Как подключить:") +
    '<ol style="margin:6px 0 0 18px;padding:0;">' + steps + '</ol>' +
    '<a href="' + p.site + '" target="_blank" rel="noopener">' + p.site.replace("https://", "") + '</a></div></div>';
}
function cloudRender(live) {
  const c = cloudCfg();
  const sens = { out: cloudSensors("out"), in: cloudSensors("in") };
  const h = [];
  h.push('<div style="border-top:1px solid var(--card-border);margin:0 -16px 12px;"></div>');
  h.push('<h3 style="margin:0 0 8px;">' + prT("cl_sub", "Облачные платформы мониторинга") + '</h3>');
  h.push('<div class="set-hint">' + t("api_hint") + '</div>');
  if (!live.out && !live.in) {
    h.push('<div class="set-hint" style="color:var(--warn);">' +
      prT("cl_nodev", "Нет реальных датчиков. Домашнее или уличное устройства не найдены.") + '</div>');
  }
  h.push('<div class="set-section">' +
    '<div class="set-row"><label>' + prT("cl_fresh_l", "Свежие данные, дней") + '</label>' +
    '<input id="cl_fresh" class="set-input" type="number" step="1" min="1" value="' + c.fresh_days + '"></div>' +
    '<div class="set-hint">' + prT("cl_fresh_h", "Устройство считается «живым», если от него были данные не старше этого срока.") + '</div>' +
    '<div class="set-row"><label>' + prT("cl_int_l", "Интервал отправки, минут") + '</label>' +
    '<input id="cl_int" class="set-input" type="number" step="any" min="1" value="' + c.interval_min + '"></div>' +
    '<div class="set-hint">' + prT("cl_int_h", "Платформы просят не чаще раза в минуту, поэтому меньше 1 поставить нельзя. Для карты Sensor.community нужно не реже раза в 5 минут, по умолчанию 4.") + '</div>' +
    '<label class="set-check"><input type="checkbox" id="cl_hide" ' + (c.hide_place ? "checked" : "") + '> ' +
    prT("cl_hide_l", "Скрыть точное место (округлить координаты примерно до 1 км)") + '</label>' +
    '<div class="set-hint">' + prT("cl_coords_l", "Будут отправлены координаты (из настроек сайта):") + ' <span id="cl_coords"></span></div>' +
    '</div>');
  CLOUD_PLATFORMS.forEach(p => h.push(cloudCardHtml(p, c, live, sens)));
  document.getElementById("api-body").innerHTML = h.join("");
  const hide = document.getElementById("cl_hide");
  const upd = () => { document.getElementById("cl_coords").textContent = cloudCoordsText(hide.checked); };
  hide.addEventListener("change", upd);
  upd();
  document.querySelectorAll(".cl_s_thingspeak").forEach(e => e.addEventListener("change", () => {
    const cnt = document.querySelectorAll(".cl_s_thingspeak:checked").length;
    const m = document.getElementById("cl_lim_thingspeak");
    if (cnt > 8) { e.checked = false; if (m) m.style.color = "var(--warn)"; }
    else if (m) m.style.color = "";
  }));
}
function cloudBanner() {
  const title = document.getElementById("chart-title");
  if (!title) return;
  let b = document.getElementById("cloud-banner");
  if (!b) {
    b = document.createElement("div");
    b.id = "cloud-banner";
    b.className = title.className;
    b.style.fontSize = "13px";
    title.parentNode.insertBefore(b, title);
  }
  b.textContent = prT("cl_dev", "Раздел в разработке.");
  b.style.display = (currentView === "api") ? "" : "none";
}
function cloudBuild() {
  const title = document.getElementById("chart-title");
  if (title) title.textContent = prT("tab_cloud", "Облачный мониторинг");
  cloudBanner();
  document.getElementById("api-body").innerHTML = '<div class="set-hint">' + prT("cl_check", "Проверяю устройства…") + '</div>';
  Promise.all([cloudLive("out"), cloudLive("in")]).then(r => {
    if (currentView !== "api") return;
    cloudRender({ out: r[0], in: r[1] });
  });
}
async function cloudSave() {
  const g = id => document.getElementById(id);
  if (!g("cl_fresh")) return;
  const fd = parseFloat(g("cl_fresh").value), iv = parseFloat(g("cl_int").value);
  const o = {
    fresh_days: fd > 0 ? Math.max(1, Math.round(fd)) : 10,
    interval_min: iv > 0 ? Math.max(1, iv) : 4,
    hide_place: g("cl_hide").checked,
    platforms: {}
  };
  if (!SETTINGS.api_out) SETTINGS.api_out = {};
  CLOUD_PLATFORMS.forEach(p => {
    const st = {
      on: g("cl_on_" + p.id).checked,
      id: g("cl_id_" + p.id).value.trim(),
      out: { send: g("cl_send_" + p.id + "_out").checked, off: {} },
      in:  { send: g("cl_send_" + p.id + "_in").checked, on: {} }
    };
    cloudSensors("out").forEach(s => {
      const e = g("cl_s_" + p.id + "_out_" + clSid(s.dk));
      if (e && !cloudBlockReason(p.id, s) && !e.checked) st.out.off[s.dk] = true;
    });
    cloudSensors("in").forEach(s => {
      const e = g("cl_s_" + p.id + "_in_" + clSid(s.dk));
      if (e && !cloudBlockReason(p.id, s) && e.checked) st.in.on[s.dk] = true;
    });
    o.platforms[p.id] = st;
    SETTINGS.api_out[p.id] = Object.assign({}, SETTINGS.api_out[p.id], { enabled: st.on });
  });
  SETTINGS.cloud = o;
  await saveSettings();
  alert(t("api_saved"));
  cloudBuild();
}
/* Подключение: подменяем старые построение и сохранение вкладки, меняем название вкладки.
   Делается после полной загрузки страницы, чтобы порядок файлов не имел значения. */
const _refreshViewCloud = refreshView;
refreshView = function () {
  const r = _refreshViewCloud.apply(this, arguments);
  try { cloudBanner(); } catch (e) {}
  return r;
};
function cloudInstall() {
  buildApiOut = cloudBuild;
  saveApiOut = cloudSave;
  if (typeof EXTRA_TABS !== "undefined") {
    const e = EXTRA_TABS.find(x => x.id === "api");
    if (e) e.label = prT("tab_cloud", "Облачный мониторинг");
  }
  try { if (typeof buildTabs === "function" && SETTINGS) buildTabs(); } catch (e) {}
}
if (document.readyState === "complete") cloudInstall();
else window.addEventListener("load", cloudInstall);
/* ===== Облачный мониторинг, часть 2 =====
   Что делает этот кусок:
   1) убирает ThingSpeak навсегда;
   2) создаёт для Narodmon два придуманных идентификатора (MAC): «Улица» и «Дом» — один раз, и запоминает их;
   3) таблицы CLOUD_MAP: как называется величина у платформы и на что умножить значение
      (давление: Narodmon — мм рт. ст., Sensor.community — паскали);
   4) блок «Неопознанные датчики»: ручной выбор типа для датчиков, которых сайт не узнал;
   5) при «Сохранить» записывает в настройки готовый план отправки (SETTINGS.cloud.plan) —
      его потом читает серверная часть. Радиация и газы в план не попадают. */

/* 1. ThingSpeak убираем из списка платформ */
(function () {
  const i = CLOUD_PLATFORMS.findIndex(p => p.id === "thingspeak");
  if (i >= 0) CLOUD_PLATFORMS.splice(i, 1);
})();

/* Новые шаги инструкций (вместо прежних) */
CLOUD_PLATFORMS.forEach(p => {
  if (p.id === "narodmon") {
    p.steps = [
      ["cl_nm2_1", "Откройте narodmon.ru, нажмите «ВХОД» и выберите «Стать участником проекта» (или «Регистрация»). Пароль нужен только вам, сайту AirVisionPro он не нужен."],
      ["cl_nm2_2", "Идентификаторы устройств уже созданы сайтом (поля выше). Нажмите «Копировать» рядом с нужным."],
      ["cl_nm2_3", "Поставьте галку «Включить» и сохраните. Данные пойдут сами, когда появится реальный датчик."],
      ["cl_nm2_4", "После первой отправки на narodmon.ru откройте «Датчики» → «Добавить моё устройство» и вставьте идентификатор."],
      ["cl_nm2_5", "Если хотите, сделайте датчики публичными, чтобы они были видны на карте. Место устройства вводится в личном кабинете."]
    ];
  }
  if (p.id === "sensor_community") {
    p.steps = [
      ["cl_sc2_1", "Для регистрации нужна плата датчика: у неё есть номер ChipID. Пока платы нет, оставьте галку «Включить» выключенной."],
      ["cl_sc2_2", "На devices.sensor.community создайте учётную запись и выберите «Register new sensor». Укажите ChipID и тип датчика: частицы, температура и влажность, давление."],
      ["cl_sc2_3", "На каждый тип датчика вы получите номер. Вставьте номера в поля выше."],
      ["cl_sc2_4", "Поставьте галку «Включить» и сохраните. Место датчика вводится в личном кабинете платформы."]
    ];
  }
});

/* 2. Придуманные MAC для Narodmon. Начинаются с 02 — так обозначают придуманные адреса. */
function cloudMacMake() {
  const a = new Uint8Array(5);
  crypto.getRandomValues(a);
  return ["02"].concat(Array.from(a).map(x => ("0" + x.toString(16)).slice(-2).toUpperCase())).join("-");
}
function cloudMacEnsure() {
  if (!SETTINGS.cloud_mac) SETTINGS.cloud_mac = {};
  let changed = false;
  ["narodmon_out", "narodmon_in"].forEach(k => {
    if (!SETTINGS.cloud_mac[k]) { SETTINGS.cloud_mac[k] = cloudMacMake(); changed = true; }
  });
  if (changed) saveSettings();
  return SETTINGS.cloud_mac;
}

/* 3. Как называются величины у платформ.
   n — название у платформы; mul — на что умножить значение из базы;
   pin и grp — для Sensor.community: номер «входа» и группа (pm / env / press).
   Здесь подтверждены только эти величины. Новые добавляются одной строкой. */
const CLOUD_MAP = {
  narodmon: {
    temp:     { n: "T", mul: 1 },
    rh:       { n: "H", mul: 1 },
    pressure: { n: "P", mul: 0.750062 }
  },
  sensor_community: {
    temp:     { n: "temperature", mul: 1,   pin: 7, grp: "env" },
    rh:       { n: "humidity",    mul: 1,   pin: 7, grp: "env" },
    pressure: { n: "pressure",    mul: 100, pin: 3, grp: "press" },
    pm25:     { n: "P2",          mul: 1,   pin: 1, grp: "pm" },
    pm10:     { n: "P1",          mul: 1,   pin: 1, grp: "pm" }
  }
};
const CLOUD_KIND_RU = { temp: "Температура", rh: "Влажность", pressure: "Давление", pm25: "PM2.5", pm10: "PM10" };
/* Сайт сам узнаёт датчик по его ключу */
function cloudAuto(pid, s) {
  const tbl = CLOUD_MAP[pid];
  if (!tbl) return null;
  let k = null;
  if (s.dk === "pm25" || s.dk === "pm10") k = s.dk;
  else if (s.pk !== "pm") k = s.pk;
  return (k && tbl[k]) ? Object.assign({ kind: k }, tbl[k]) : null;
}
/* Сначала ручной выбор пользователя, потом автоопределение */
function cloudResolve(pid, s) {
  const tbl = CLOUD_MAP[pid];
  if (!tbl) return null;
  const m = (SETTINGS.cloud_manual && SETTINGS.cloud_manual[pid] && SETTINGS.cloud_manual[pid][s.dk]) || "";
  if (m.indexOf("k:") === 0 && tbl[m.slice(2)]) return Object.assign({ kind: m.slice(2) }, tbl[m.slice(2)]);
  if (m.indexOf("c:") === 0 && m.length > 2 && pid === "narodmon") return { kind: "custom", n: m.slice(2), mul: 1, custom: true };
  return cloudAuto(pid, s);
}
/* Почему датчик нельзя отправить (пустая строка — можно) */
cloudBlockReason = function (pid, s) {
  if (CLOUD_BLOCKED.indexOf(s.pk) >= 0) return prT("cl_no_gas", "пока не отправляется");
  return cloudResolve(pid, s) ? "" : prT("cl_unk", "не опознан");
};

/* 4. Дополнения на странице: после основной отрисовки */
const _cloudRenderP2 = cloudRender;
cloudRender = function (live) {
  _cloudRenderP2(live);
  try { cloudDecorate(); } catch (e) { console.warn("cloud decorate:", e); }
};
function cloudDecorate() {
  const g = id => document.getElementById(id);
  const mac = cloudMacEnsure();
  /* карточки активны и без устройства: подключать можно заранее */
  CLOUD_PLATFORMS.forEach(p => {
    const on = g("cl_on_" + p.id);
    const card = on && on.closest(".set-section");
    if (card) { card.style.opacity = ""; card.style.pointerEvents = ""; }
  });
  /* подпись про координаты */
  const cs = g("cl_coords");
  if (cs && cs.parentNode.firstChild) {
    cs.parentNode.firstChild.textContent =
      prT("cl_coords2", "Координаты для ввода в личном кабинете платформы (из настроек сайта):") + " ";
  }
  const copyBtn = inp => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "set-btn sm";
    b.textContent = prT("cl_copy", "Копировать");
    b.addEventListener("click", () => {
      inp.select();
      try { navigator.clipboard.writeText(inp.value); } catch (e) { document.execCommand("copy"); }
    });
    return b;
  };
  const makeRow = (after, id, label, value, ro) => {
    const row = document.createElement("div");
    row.className = after.className;
    const lb = document.createElement("label"); lb.textContent = label;
    const inp = document.createElement("input");
    inp.id = id; inp.className = "set-input"; inp.type = "text"; inp.value = value || "";
    if (ro) inp.readOnly = true;
    row.appendChild(lb); row.appendChild(inp);
    if (ro) row.appendChild(copyBtn(inp));
    after.parentNode.insertBefore(row, after.nextSibling);
    return row;
  };
  /* Narodmon: два идентификатора */
  const nm = g("cl_id_narodmon");
  if (nm) {
    nm.readOnly = true; nm.value = mac.narodmon_out;
    const row = nm.parentNode;
    const lb = row.querySelector("label");
    if (lb) lb.textContent = prT("cl_nm_mac_out", "Идентификатор устройства «Улица» (создан сайтом)");
    row.appendChild(copyBtn(nm));
    makeRow(row, "cl_mac_in_narodmon", prT("cl_nm_mac_in", "Идентификатор устройства «Дом» (создан сайтом)"), mac.narodmon_in, true);
  }
  /* Sensor.community: три номера */
  const sc = g("cl_id_sensor_community");
  if (sc) {
    const saved = (SETTINGS.cloud && SETTINGS.cloud.platforms && SETTINGS.cloud.platforms.sensor_community) || {};
    const row = sc.parentNode;
    const lb = row.querySelector("label");
    if (lb) lb.textContent = prT("cl_sc_id_pm", "Номер датчика для частиц (PM2.5, PM10)");
    const r2 = makeRow(row, "cl_scid_env", prT("cl_sc_id_env", "Номер датчика для температуры и влажности"), saved.id_env, false);
    makeRow(r2, "cl_scid_press", prT("cl_sc_id_press", "Номер датчика для давления"), saved.id_press, false);
  }
  /* Неопознанные датчики: ручной выбор типа */
  CLOUD_PLATFORMS.forEach(p => {
    const on = g("cl_on_" + p.id);
    const card = on && on.closest(".set-section");
    if (!card) return;
    const items = [], seen = {};
    ["out", "in"].forEach(which => cloudSensors(which).forEach(s => {
      if (CLOUD_BLOCKED.indexOf(s.pk) >= 0 || cloudAuto(p.id, s) || seen[s.dk]) return;
      seen[s.dk] = 1; items.push(s);
    }));
    if (!items.length) return;
    const man = (SETTINGS.cloud_manual && SETTINGS.cloud_manual[p.id]) || {};
    const kinds = Object.keys(CLOUD_MAP[p.id]);
    const rows = items.map(s => {
      const cur = man[s.dk] || "";
      const curSel = cur.indexOf("c:") === 0 ? "c" : cur;
      const opts = ['<option value="">' + prT("cl_not_send", "Не отправлять") + '</option>']
        .concat(kinds.map(k => '<option value="k:' + k + '"' + (curSel === "k:" + k ? " selected" : "") + '>' +
          prT("cl_it", "Это") + ': ' + prT("cl_k_" + k, CLOUD_KIND_RU[k] || k) + '</option>'));
      if (p.id === "narodmon") opts.push('<option value="c"' + (curSel === "c" ? " selected" : "") + '>' + prT("cl_own", "Своё имя…") + '</option>');
      return '<div class="set-row"><label>' + clEsc(s.label) + ' (' + clEsc(s.dk) + ')</label>' +
        '<select class="set-input" data-clpid="' + p.id + '" data-cldk="' + clEsc(s.dk) + '">' + opts.join("") + '</select>' +
        (p.id === "narodmon" ? '<input class="set-input" id="cl_mname_' + p.id + '_' + clSid(s.dk) + '" placeholder="NAME" style="max-width:120px;" value="' +
          clEsc(cur.indexOf("c:") === 0 ? cur.slice(2) : "") + '">' : '') + '</div>';
    }).join("");
    const box = document.createElement("div");
    box.innerHTML = '<div class="set-hint" style="margin-top:8px;">' +
      prT("cl_unk_t", "Неопознанные датчики: сайт не знает, как назвать их на этой платформе. Они не отправляются, пока вы не выберете тип.") +
      '</div>' + rows;
    card.insertBefore(box, card.lastElementChild);
  });
}

/* 5. Сохранение: номера Sensor.community, ручной выбор и готовый план отправки */
function cloudBuildPlan() {
  const c = SETTINGS.cloud, mac = cloudMacEnsure(), plan = {};
  const pick = (pid, st, which) => {
    if (!(which === "out" ? st.out.send : st.in.send)) return [];
    const seen = {}, list = [];
    cloudSensors(which).forEach(s => {
      if (CLOUD_BLOCKED.indexOf(s.pk) >= 0) return;
      const r = cloudResolve(pid, s);
      if (!r) return;
      if (!(which === "out" ? !st.out.off[s.dk] : st.in.on[s.dk] === true)) return;
      seen[r.kind] = (seen[r.kind] || 0) + 1;
      if (pid === "sensor_community" && seen[r.kind] > 1) return;
      list.push({
        dev: which, dk: s.dk, kind: r.kind,
        name: pid === "narodmon" ? (r.custom ? r.n : r.n + seen[r.kind]) : r.n,
        mul: r.mul, pin: r.pin || null, grp: r.grp || null
      });
    });
    return list;
  };
  CLOUD_PLATFORMS.forEach(p => {
    const st = c.platforms[p.id];
    if (!st || !st.on) return;
    if (p.id === "narodmon") {
      plan.narodmon = {
        out: { mac: mac.narodmon_out, sensors: pick(p.id, st, "out") },
        in:  { mac: mac.narodmon_in,  sensors: pick(p.id, st, "in") }
      };
    }
    if (p.id === "sensor_community") {
      plan.sensor_community = {
        ids: { pm: st.id || "", env: st.id_env || "", press: st.id_press || "" },
        sensors: pick(p.id, st, "out").concat(pick(p.id, st, "in"))
      };
    }
  });
  plan.interval_min = c.interval_min;
  plan.fresh_days = c.fresh_days;
  plan.saved_at = Math.floor(Date.now() / 1000);
  return plan;
}
const _cloudSaveP2 = cloudSave;
cloudSave = async function () {
  const g = id => document.getElementById(id);
  if (!g("cl_fresh")) return;
  /* читаем страницу до того, как основное сохранение её перерисует */
  const man = {};
  CLOUD_PLATFORMS.forEach(p => { man[p.id] = {}; });
  document.querySelectorAll("select[data-clpid]").forEach(sel => {
    const pid = sel.getAttribute("data-clpid"), dk = sel.getAttribute("data-cldk");
    if (!man[pid]) return;
    if (sel.value === "c") {
      const inp = g("cl_mname_" + pid + "_" + clSid(dk));
      const nm = inp ? inp.value.replace(/[^A-Za-z0-9_]/g, "").slice(0, 20) : "";
      if (nm) man[pid][dk] = "c:" + nm;
    } else if (sel.value) {
      man[pid][dk] = sel.value;
    }
  });
  const idEnv = g("cl_scid_env") ? g("cl_scid_env").value.trim() : "";
  const idPress = g("cl_scid_press") ? g("cl_scid_press").value.trim() : "";
  await _cloudSaveP2();
  SETTINGS.cloud_manual = man;
  const sc = SETTINGS.cloud && SETTINGS.cloud.platforms && SETTINGS.cloud.platforms.sensor_community;
  if (sc) { sc.id_env = idEnv; sc.id_press = idPress; }
  SETTINGS.cloud.plan = cloudBuildPlan();
  await saveSettings();
};
