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
  right.className = "range-btn arrow" + (offsetSteps === 0 ? " disabled" : "");
  right.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 6l6 6-6 6"/></svg>';
  right.title = t("to_now");
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
  const { data, error } = await client.from("weather")
    .select("val, ts_utc")
    .eq("source", source).eq("param", param).eq("kind", "current")
    .gte("ts_utc", fromIso).lte("ts_utc", toIso)
    .order("ts_utc", { ascending: true });
  if (error || !data) return [];
  return data;
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
      if (!rows.length) continue;
      const pts = rows.map(r => ({ x:(Date.parse(r.ts_utc)/1000 - from)/step, y:convertUnit(Number(r.val), g, unitId) }));
      const col = palette[ci % palette.length];
      const nm = (param in ws.names ? ws.names[param] : param);
      datasets.push({ label: ws.prefix + nm, data: pts,
        borderColor: col, backgroundColor: col+"22", fill:false, tension:0.3,
        pointRadius:2, spanGaps:false });
      ci++;
    }
  }

  document.getElementById("chart-title").textContent = paramTopTitle(p) + (uLabel ? " (" + uLabel + ")" : "");
  document.getElementById("advice").textContent = t("advice_default");

  const isLight = getTheme() === "light";
  const gridColor = isLight ? "rgba(20,60,110,0.12)" : "rgba(120,190,255,0.15)";
  const tickColor = isLight ? "#0d2a4a" : "#eaf4ff";
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
    plugins:[paramWmPlugin]
  });
  chart.$bgLabel = bgDateLabel(from);
  hideLoader();
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
  (series||[]).forEach(s => {
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
  items.forEach(it => {
    ctx.strokeStyle=it.color; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx+swatch, ly); ctx.stroke();
    ctx.fillStyle=txt; ctx.fillText(it.label, lx+swatch+lineGap, ly);
    lx += swatch + lineGap + it.w + itemGap;
  });
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
let lcIdx = -1, lcTimer = null, lcLastIdx = -1, lcLastTime = 0;

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
  document.getElementById("linecolor-title").textContent = ds.label;
  setLineColorPreview(normHex(ds.borderColor) || "#4db2ff");
  buildLineSwatches();
  document.getElementById("linecolor-modal").classList.add("open");
}
function closeLineColor(){ document.getElementById("linecolor-modal").classList.remove("open"); }
async function saveLineColor(){
  if (lcIdx < 0) return;
  const hex = lcCurrentHex();
  const label = chart.data.datasets[lcIdx].label;
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