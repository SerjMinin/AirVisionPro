/* AirVision Pro — движок дашборда. */

const APP_VERSION = "v1.0";
const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentKey = PARAMS[0].key;
let currentRange = "24h";
let offsetSteps = 0;
let chart = null;
let currentView = "param";   // param | geomag | api | advice | smarthome

const RANGES = {
  "24h":   { sec: 24*3600,     ticks: 24, i18n: "r_24h"   },
  "week":  { sec: 7*24*3600,   ticks: 7,  i18n: "r_week"  },
  "month": { sec: 30*24*3600,  ticks: 30, i18n: "r_month" },
  "year":  { sec: 365*24*3600, ticks: 12, i18n: "r_year"  }
};

/* верхние (над графиком) названия-переопределения */
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
function onThemeChanged() { if (currentView === "param") renderParam(currentKey); }
function onLangChanged() { buildTabs(); buildRangeBar(); refreshView(); }

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
  [["geomag",t("tab_geomag")],["api","API OUT"],["advice",t("tab_advice")],["smarthome",t("tab_smart")]].forEach(([view,label]) => {
    const tab = document.createElement("button");
    tab.className = "tab tab-extra" + (currentView===view ? " active" : "");
    tab.textContent = label;
    tab.onclick = () => { currentView=view; buildTabs(); refreshView(); };
    bar.appendChild(tab);
  });
}

function buildRangeBar() {
  const bar = document.getElementById("range-bar");
  if (!bar) return;
  bar.innerHTML = "";
  if (currentView !== "param") return;
  const left = document.createElement("button");
  left.className = "range-btn arrow"; left.textContent = "‹";
  left.onclick = () => { offsetSteps++; renderParam(currentKey); };
  const right = document.createElement("button");
  right.className = "range-btn arrow" + (offsetSteps === 0 ? " disabled" : "");
  right.textContent = "›"; right.title = t("to_now");
  right.onclick = () => { if (offsetSteps > 0) { offsetSteps--; renderParam(currentKey); } };
  bar.appendChild(left);
  ["24h","week","month","year"].forEach(code => {
    const b = document.createElement("button");
    b.className = "range-btn" + (code === currentRange ? " active" : "");
    b.textContent = t(RANGES[code].i18n);
    b.onclick = () => { currentRange = code; offsetSteps = 0; buildRangeBar(); renderParam(currentKey); };
    bar.appendChild(b);
  });
  bar.appendChild(right);
}

/* шестерёнка сверху: для параметра и для магнитных бурь */
function openViewSettings() {
  if (currentView === "param") openParamSettings();
  else if (currentView === "geomag") openGeomagSettings();
}

function refreshView() {
  const chartArea = document.getElementById("chart-box-wrap");
  const extra = document.getElementById("extra-view");
  const gear = document.getElementById("param-gear");
  buildRangeBar();
  if (currentView === "param") {
    chartArea.style.display = "flex"; extra.style.display = "none"; gear.style.display = "flex";
    renderParam(currentKey);
  } else {
    chartArea.style.display = "none"; extra.style.display = "block";
    gear.style.display = (currentView === "geomag") ? "flex" : "none";
    if (currentView === "geomag")    { document.getElementById("chart-title").textContent = t("tab_geomag"); showExtra("geomag"); buildGeomag(); }
    if (currentView === "api")       { document.getElementById("chart-title").textContent = "API OUT"; buildApiOut(); showExtra("api"); }
    if (currentView === "advice")    { document.getElementById("chart-title").textContent = t("tab_advice"); buildAdvice(); showExtra("advice"); }
    if (currentView === "smarthome") { document.getElementById("chart-title").textContent = t("tab_smart"); buildSmartHome(); showExtra("smarthome"); }
  }
}

function showExtra(which) {
  const ids = ["geomag-panel","api-panel","advice-panel","smarthome-panel"];
  const map = { geomag:"geomag-panel", api:"api-panel", advice:"advice-panel", smarthome:"smarthome-panel" };
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

function windowRange() {
  const now = Math.floor(Date.now() / 1000);
  const span = RANGES[currentRange].sec;
  const to = now - offsetSteps * span;
  return { from: to - span, to, span };
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

  const { from, span } = windowRange();
  const ticks = RANGES[currentRange].ticks;
  const step = span / ticks;
  const to = from + span;

  const g = PARAM_UNIT_GROUP[p.key];
  const unitId = g ? SETTINGS.units[g] : null;
  const uLabel = paramUnitDisplay(p);

  let sources = [];
  if (p.loc === "out" || p.loc === "pressure") sources = [{ sn: SETTINGS.sn_out, tag: t("outdoor") }];
  else if (p.loc === "in") sources = [{ sn: SETTINGS.sn_in, tag: t("indoor") }];
  else sources = [{ sn: SETTINGS.sn_out, tag: t("outdoor") }, { sn: SETTINGS.sn_in, tag: t("indoor") }];

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
        const srcKey = prov.includes("meteo") ? "open-meteo" : (prov.includes("owm")||prov.includes("weather") ? "owm" : "sensor");
        if (SETTINGS.sources && SETTINGS.sources[srcKey] === false) return;
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
  const advice = document.getElementById("advice");
  if (p.key === "pressure" && datasets.length && datasets[0].data.length) {
    const last = Number(datasets[0].data[datasets[0].data.length-1].y);
    advice.textContent = t(p.i18n) + ": " + last.toFixed(unitId==="inHg"?2:0) + " " + uLabel;
  } else advice.textContent = t("advice_default");

  const isLight = getTheme() === "light";
  const gridColor = isLight ? "rgba(20,60,110,0.12)" : "rgba(120,190,255,0.15)";
  const tickColor = isLight ? "#0d2a4a" : "#eaf4ff";
  const xLabels = [];
  for (let i=0;i<=ticks;i++) xLabels.push(fmtTick(from + i*step, currentRange));

  if (chart) { chart.destroy(); chart = null; }
  chart = new Chart(document.getElementById("chart"), {
    type:"line", data:{ datasets },
    options:{ responsive:true, maintainAspectRatio:false, parsing:false,
      interaction:{ mode:"nearest", intersect:false },
      plugins:{ legend:{ labels:{ color:tickColor } },
        zoom:{ zoom:{ wheel:{enabled:true}, pinch:{enabled:true}, mode:"x" }, pan:{ enabled:true, mode:"x" } } },
      scales:{ x:{ type:"linear", min:0, max:ticks, grid:{ color:gridColor },
          ticks:{ color:tickColor, stepSize:1, autoSkip:false, maxRotation:0, callback:v=>xLabels[v]??"" } },
        y:{ grid:{ color:gridColor }, ticks:{ color:tickColor } } }
    }
  });
}

function fmtTick(unix, range) {
  const d = new Date(unix*1000); const p = n => String(n).padStart(2,"0");
  if (range==="24h")  return p(d.getHours());
  if (range==="week") return p(d.getDate())+"."+p(d.getMonth()+1);
  if (range==="month")return p(d.getDate());
  return p(d.getMonth()+1);
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

async function startDashboard() {
  if (!(await guard())) return;
  document.body.style.visibility = "visible";
  await loadSettings();
  buildTabs(); buildRangeBar(); await refreshStatus();
  refreshView();
  window.addEventListener("resize", () => { if (currentView==="param") renderParam(currentKey); });
}