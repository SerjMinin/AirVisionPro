/* 
 * Copyright (c) 2026 Минин Сергей Александрович.
 * Licensed under the GNU Affero General Public License v3.0.
 * See LICENSE file in the project root for full license information.
 */
/* AirVisionPro — магнитные бури: Kp факт+прогноз, ось 0–9, ореол северного сияния. */

/* ссылки берём из настроек */
var geomagWindow = { from:0, to:0 };
function geomagUrl() {
  const gs = (SETTINGS.weather_sources && SETTINGS.weather_sources.geomag) || {};
  const u = gs.url || "";
  return u.includes("forecast") ? u : GEOMAG_DEFAULT_URL;
}

const G_TABLE = [
  { g:"G1", kp:5, name:"Слабая",        eff:"Незначительные сбои спутников, слабые сияния на севере." },
  { g:"G2", kp:6, name:"Умеренная",     eff:"Перепады в электросетях, сияния чуть южнее." },
  { g:"G3", kp:7, name:"Сильная",       eff:"Сбои GPS и КВ-радиосвязи." },
  { g:"G4", kp:8, name:"Очень сильная", eff:"Проблемы со связью, сияния до средних широт." },
  { g:"G5", kp:9, name:"Экстремальная", eff:"Угроза электростанциям, сбой спутников и КВ-связи." }
];

function parseNoaaTs(s){ return Math.floor(Date.parse(String(s).replace(" ","T")+"Z")/1000); }

function geomagLat(lat, lon){
  const latP=80.65*Math.PI/180, lonP=-72.68*Math.PI/180;
  const la=lat*Math.PI/180, lo=lon*Math.PI/180;
  const s=Math.sin(la)*Math.sin(latP)+Math.cos(la)*Math.cos(latP)*Math.cos(lo-lonP);
  return Math.asin(s)*180/Math.PI;
}
function auroraVisible(kp, mlat){ return Math.abs(mlat) >= (66 - 2*kp); }

const auroraPlugin = {
  id:"aurora",
  beforeDatasetsDraw(chart){
    const pts = chart.$auroraPts || [];
    const { ctx, chartArea, scales } = chart;
    const xs = scales.x; if(!xs) return;
    ctx.save();
    const half = Math.abs(xs.getPixelForValue(1.5) - xs.getPixelForValue(0)) || 6;
    pts.forEach(p=>{
      if(!p.visible) return;
      const cx = xs.getPixelForValue(p.x);
      const grad = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
      grad.addColorStop(0,"rgba(70,255,150,0.30)");
      grad.addColorStop(1,"rgba(70,255,150,0.02)");
      ctx.fillStyle = grad;
      ctx.fillRect(cx-half, chartArea.top, half*2, chartArea.bottom-chartArea.top);
    });
    if(chart.$nowX != null){
      const px = xs.getPixelForValue(chart.$nowX);
      ctx.strokeStyle="rgba(180,200,230,0.6)"; ctx.setLineDash([4,4]); ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(px,chartArea.top); ctx.lineTo(px,chartArea.bottom); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
};

const wmPlugin = {
  id:"geowm",
  afterDraw(chart){
    const { ctx, chartArea } = chart;
    const on = !!(SETTINGS.config_items && SETTINGS.config_items.aurora);
    ctx.save();
    ctx.fillStyle="rgba(150,170,200,0.4)";
    ctx.textAlign="right"; ctx.textBaseline="top";
    ctx.font="12px 'Exo 2',sans-serif";
    let y = chartArea.top+6;
    ctx.fillText("Источник: NOAA SWPC · планетарный Kp", chartArea.right-8, y);
    if(on){
      y += 16;
      ctx.fillText("Сила полярного сияния: NOAA SWPC · модель OVATION", chartArea.right-8, y);
    }
    if(chart.$bgLabel){
      ctx.font="600 34px 'Exo 2',sans-serif";
      ctx.fillText(chart.$bgLabel, chartArea.right-8, y+20);
      y += 20+40;
    } else {
      y += 18;
    }
    if(on){
      ctx.font="12px 'Exo 2',sans-serif";
      const side = (Number(SETTINGS.lat)>=0) ? "северного" : "южного";
      const tips = [
        "Сияние видно ночью, когда нет",
        "облаков и засветки неба городом.",
        "Если вероятность увидеть мала,",
        "смотрите в сторону "+side+" полюса."
      ];
      y += 6;
      for(const s of tips){ ctx.fillText(s, chartArea.right-8, y); y += 15; }
    }
    ctx.restore();
  }
};

let geomagAurora = [];   // сила полярного сияния, проценты

/* факт — из накопленной таблицы geomag; прогноз — прямой из NOAA (кэш 1 час) */
let geomagFcstCache = { time: 0, data: null };

async function getForecastJson(){
  const now = Date.now();
  if (geomagFcstCache.data && (now - geomagFcstCache.time) < 3600*1000) {
    return geomagFcstCache.data;   // свежее часа — берём из памяти
  }
  const r = await fetch(geomagUrl(), {cache:"no-store"});
  if(!r.ok) throw new Error("HTTP "+r.status);
  const j = await r.json();
  geomagFcstCache = { time: now, data: j };
  return j;
}

async function fetchGeomag(from, to){
  const pad = 6*3600;
  from = from - pad;
  to   = to + pad;
  const factP = client.from("geomag")
    .select("ts_utc, kp")
    .eq("source", "noaa")
    .gte("ts_utc", new Date(from*1000).toISOString())
    .lte("ts_utc", new Date(to*1000).toISOString())
    .order("ts_utc", { ascending:true });

   const aurP = client.from("geomag")
    .select("ts_utc, kp")
    .eq("source", "aurora")
    .gte("ts_utc", new Date(from*1000).toISOString())
    .lte("ts_utc", new Date(to*1000).toISOString())
    .order("ts_utc", { ascending:true });

  const fcstP = getForecastJson();

  const [factRes, cJson] = await Promise.all([factP, fcstP]);

  const fact = (factRes.data || []).map(o => ({
    ts: Math.floor(Date.parse(o.ts_utc)/1000),
    kp: Number(o.kp)
  })).filter(x=>!isNaN(x.kp)&&!isNaN(x.ts));

  const nowTs = Math.floor(Date.now()/1000);
  const noaaAll = normalizeKp(cJson).filter(x=>!isNaN(x.kp)&&!isNaN(x.ts));
  const isMeasured = o => {
    const s = String(o.obs||"").toLowerCase();
    return s.includes("observ") || s.includes("estim");
  };

  // NOAA уже измерил то, чего ещё нет в нашей базе — добираем, чтобы факт не обрывался
  const dbLast = fact.length ? fact[fact.length-1].ts : 0;
  noaaAll.filter(o => isMeasured(o) && o.ts > dbLast && o.ts <= nowTs)
         .forEach(o => fact.push({ ts:o.ts, kp:o.kp }));
  fact.sort((a,b)=>a.ts-b.ts);

  const fcst = noaaAll.map(o => ({ ts:o.ts, kp:o.kp }));
  
  const aurRes = await aurP;
  geomagAurora = (aurRes.data || []).map(o => ({
    ts: Math.floor(Date.parse(o.ts_utc)/1000),
    pct: Number(o.kp)
  })).filter(x=>!isNaN(x.pct)&&!isNaN(x.ts));
                              
  console.log("[geomag] факт(БД):", fact.length, "прогноз:", fcst.length);
  return { fact, fcst };
}

/* Понимает ОБА формата NOAA: старый (массив массивов с шапкой) и новый (массив объектов). */
function normalizeKp(raw){
  if(!Array.isArray(raw) || raw.length===0) return [];
  if(Array.isArray(raw[0])){
    const head = raw[0].map(s=>String(s).toLowerCase());
    const iT = head.findIndex(h=>h.includes("time"));
    const iK = head.findIndex(h=>h==="kp"||h.includes("kp"));
    const iO = head.findIndex(h=>h.includes("observ"));
    return raw.slice(1).map(r=>({
      ts: parseNoaaTs(r[iT>=0?iT:0]),
      kp: parseFloat(r[iK>=0?iK:1]),
      obs: iO>=0 ? String(r[iO]||"") : ""
    }));
  }
  return raw.map(o=>{
    const keys = Object.keys(o);
    const kT = keys.find(k=>k.toLowerCase().includes("time")) || "time_tag";
    const kK = keys.find(k=>k.toLowerCase()==="kp")
            || keys.find(k=>k.toLowerCase().includes("kp"))
            || keys.find(k=>k.toLowerCase().includes("k_index")) || "Kp";
    const kO = keys.find(k=>k.toLowerCase().includes("observ"));
    return {
      ts: parseNoaaTs(o[kT]),
      kp: parseFloat(o[kK]),
      obs: kO ? String(o[kO]||"") : ""
    };
  });
}

function geomagTickLabel(unix){
  const d = locDate(unix); const p = n => String(n).padStart(2,"0");
  if (currentRange==="24h") {
    if (geomagWindow && unix >= geomagWindow.to) {           // самая правая подпись
      const dPrev = locDate(unix - 3600);                     // берём день, который заканчивается
      return p(dPrev.getUTCDate())+" 24:00";
    }
    return p(d.getUTCDate())+" "+p(d.getUTCHours())+":00";   // «18 14:00»
  }
  if (currentRange==="year") return d.getUTCFullYear()+"."+p(d.getUTCMonth()+1);   // «2026.07»
  return p(d.getUTCDate())+"."+p(d.getUTCMonth()+1);                                // «18.07»
}

function drawGeomagChart(fact, fcst, errText){
  const now = Math.floor(Date.now()/1000);
  // окно сдвигается ЦЕЛИКОМ при листании — ширина не меняется
  const day = 86400;
  const midnight = Math.floor((now + TZ_OFFSET)/day)*day - TZ_OFFSET;
  let from, to, span;
  if (currentRange === "24h") {                 // сутки 0:00–24:00
    span = day;
    to   = midnight + day - offsetSteps*day;
  } else if (currentRange === "week") {         // 7 суток: 4 факт + 3 прогноз
    span = 7*day;
    to   = midnight + 3*day - offsetSteps*span;
  } else if (currentRange === "month") {        // 4 недели по 7 суток
    span = 28*day;
    to   = midnight + 3*day - offsetSteps*span;
  } else {                                      // год: 12 месяцев, прогноза нет
    span = 365*day;
    to   = midnight + day - offsetSteps*span;
  }
  from = to - span;
  const toX  = (to - from)/3600;
  geomagWindow = { from, to };
  const X = ts => (ts - from)/3600;

// считаем, на сколько суток вперёд у NOAA есть прогноз
  {
    const day = 86400;
    const mid = Math.floor((now + TZ_OFFSET)/day)*day - TZ_OFFSET;
    let n = 0;
    for (let d = 1; d <= 10; d++)
      if (fcst.some(p => p.ts >= mid + d*day && p.ts < mid + (d+1)*day)) n = d;
    const wasFwd = fwdSteps;
    fwdSteps = n;
    if (wasFwd !== n) setTimeout(buildRangeBar, 0);
  }

  const mlat = geomagLat(SETTINGS.lat, SETTINGS.lon);

  const pad = 6*3600;   // запас за края экрана, чтобы линия не ломалась на стыке
  const fF = fact.filter(p=>p.ts>=from-pad && p.ts<=Math.min(now,to+pad)).sort((a,b)=>a.ts-b.ts);
  const factEnd = fF.length ? fF[fF.length-1].ts : (from - 1);
  const fC = (currentRange === "year")
           ? []
           : fcst.filter(p=>p.ts>factEnd && p.ts<=to+pad).sort((a,b)=>a.ts-b.ts);

  const all = fF.concat(fC);
  const pts = all.map(p=>({ x:X(p.ts), y:p.kp, ts:p.ts }));

  const COL = {
    fact:"#37d67a",
    d1:"rgba(90,100,114,1)",
    d2:"rgba(90,100,114,0.67)",
    d3:"rgba(90,100,114,0.34)"
  };
  const colorForTs = ts => {
    if(ts <= factEnd)     return COL.fact;
    if(ts <= now+1*86400) return COL.d1;
    if(ts <= now+2*86400) return COL.d2;
    return COL.d3;
  };
  const segColor = ctx => colorForTs(from + ctx.p1.parsed.x*3600);
  const segDash  = ctx => (from + ctx.p1.parsed.x*3600) > factEnd ? [6,4] : undefined;
  const pointColors = pts.map(p=>colorForTs(p.ts));

  const auroraPts = pts.map(p=>({x:p.x,visible:auroraVisible(p.y,mlat)}));

  const isLight=getTheme()==="light";
  const gridColor=isLight?"rgba(20,60,110,0.14)":"rgba(120,190,255,0.18)";
  const tickColor=isLight?"#0d2a4a":"#eaf4ff";

  // сила полярного сияния: 10 % → строка «Кр 0», 100 % → «Кр 9»
  const AUR_COL = "rgb(8,232,222)";
  const aurOn = !!(SETTINGS.config_items && SETTINGS.config_items.aurora);
  const aurPts = !aurOn ? [] : geomagAurora
    .filter(p => p.ts >= from && p.ts <= to && p.pct >= 10)
    .map(p => ({ x: X(p.ts), y: Math.max(0, Math.min(9, p.pct/10 - 1)) }));

  const legendItems = [
    { text:t("geomag_fact"), color:COL.fact, dash:false },
    { text:t("geomag_d1"),   color:COL.d1,   dash:true  },
    { text:t("geomag_d2"),   color:COL.d2,   dash:true  },
    { text:t("geomag_d3"),   color:COL.d3,   dash:true  },
    ...(aurPts.length ? [{ text:"Сила полярного сияния", color:AUR_COL, dash:false }] : [])
  ];

  if(chart){ chart.destroy(); chart=null; }
  chart = new Chart(document.getElementById("chart"),{
    type:"line",
    data:{ datasets:[{
      label:"Kp",
      data:pts,
      borderColor:COL.fact,
      pointBackgroundColor:pointColors,
      pointBorderColor:pointColors,
      pointRadius:2,
      tension:0.4,
      fill:false,
      segment:{ borderColor:segColor, borderDash:segDash }
    },
    ...(aurPts.length ? [{
      label:"Сила полярного сияния",
      data:aurPts,
      borderColor:AUR_COL,
      pointBackgroundColor:AUR_COL,
      pointBorderColor:AUR_COL,
      pointRadius:2,
      tension:0.4,
      fill:false
    }] : [])
    ]},
    options:{ responsive:true, maintainAspectRatio:false, parsing:true,
      interaction:{ mode:"nearest", intersect:false },
      plugins:{ legend:{ labels:{
        color:tickColor, usePointStyle:true, boxWidth:28,
        generateLabels: () => legendItems.map(it=>({
          text:it.text, fontColor:tickColor,
          strokeStyle:it.color, fillStyle:it.color,
          lineWidth:3, lineDash:it.dash?[6,4]:[], pointStyle:"line", hidden:false
        }))
      } } },
     scales:{
        x:{ type:"linear", min:0, max:toX, grid:{ color:gridColor },
          afterBuildTicks: axis => {
            const n = {"24h":12,"week":7,"month":4,"year":12}[currentRange] || 12;
            axis.ticks = [];
            for (let i=0;i<=n;i++) axis.ticks.push({ value: toX*i/n });
          },
          ticks:{ color:tickColor, autoSkip:false, maxRotation:0,
            callback:v=>geomagTickLabel(from + v*3600) } },
        y:{ min:0, max:9, grid:{ color:gridColor },
          ticks:{ color:tickColor, stepSize:1, callback:v=>"Kp "+v } }
      }
    },
    plugins:[auroraPlugin, wmPlugin]
  });
  chart.$auroraPts = auroraPts;
  chart.$nowX = X(now);
  chart.$bgLabel = bgDateLabel(from);
  chart.update();

  if(errText){ document.getElementById("advice").textContent = errText; }
}

async function renderGeomag(){
  if(currentView!=="geomag") return;
  showCanvasGraph();
  showLoader();
  document.getElementById("chart-title").textContent = t("tab_geomag");
  try{
    drawGeomagChart([], [], null);
    const { from, to } = geomagWindow;
    const { fact, fcst } = await fetchGeomag(from, to);
    drawGeomagChart(fact, fcst, null);
  }catch(e){
    console.error("[geomag] ошибка загрузки:", e);
    drawGeomagChart([], [], t("geomag_err"));
  }finally{
    hideLoader();
  }
}

function openGeomagSettings(){
  const rows = G_TABLE.map(x=>`<tr><td>${x.g}</td><td>${x.kp}</td><td>${x.name}</td><td>${x.eff}</td></tr>`).join("");
  document.getElementById("geomag-set-title").textContent = t("set_page")+t("tab_geomag");
  document.getElementById("geomag-set-body").innerHTML =
    `<table class="geo-table"><thead><tr><th>Уровень (G)</th><th>Балл (Kp)</th><th>Сила бури</th><th>Последствия</th></tr></thead><tbody>${rows}</tbody></table>`;
  document.getElementById("geomag-modal").classList.add("open");
}
function closeGeomagSettings(){ document.getElementById("geomag-modal").classList.remove("open"); }
/* ===== Окно «Магнитные бури — источник» ===== */
const GEOMAG_DEFAULT_URL = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json";

const GEOMAG_FACT_HOURS = 180/60;   // факт пишется в БД раз в 3 ч (крон)
const GEOMAG_FCST_HOURS = 60/60;    // прогноз обновляется раз в 1 ч (кэш)
const AURORA_DEFAULT_URL = "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json";

/* сколько часов в сутки солнце ниже -6° (в среднем за год) */
function auroraNightHours(lat){
  const rad = Math.PI/180;
  let sum = 0;
  for(let m=0;m<12;m++){
    const dec = 23.44*rad*Math.sin(2*Math.PI*(m*30.4+284)/365);
    const c = (Math.sin(-6*rad) - Math.sin(lat*rad)*Math.sin(dec)) /
              (Math.cos(lat*rad)*Math.cos(dec));
    if(c >= 1)      sum += 24;                 // полярная ночь
    else if(c <= -1) sum += 0;                 // полярный день
    else sum += 24 - (Math.acos(c)/rad)*2/15;
  }
  return sum/12;
}

async function openSrcGeomag(){
  const ws = SETTINGS.weather_sources || {};
  const gs = ws.geomag || {};
  const as = ws.aurora || {};
  const saved = gs.url || "";
  const url = saved.includes("forecast") ? saved : GEOMAG_DEFAULT_URL;
  const aurUrl = as.url || AURORA_DEFAULT_URL;
  const on = !(SETTINGS.config_items && SETTINGS.config_items.aurora === false);

  const lat = Number(SETTINGS.lat) || 0;
  const night = auroraNightHours(lat);
  const perDay = Math.round(night*60/20);
  const gb = (perDay*1.2*30/1024).toFixed(1);
  const mlat = Math.abs(geomagLat(lat, Number(SETTINGS.lon)||0));
  const kpNeed = Math.max(0, Math.ceil((66 - mlat)/2));

  document.getElementById("src-geomag-body").innerHTML =
    `<div class="set-hint" style="text-align:left;margin:0 0 6px;">Один запрос отдаёт и факт, и прогноз (NOAA).</div>
     <textarea id="src_geomag_url" class="set-input" style="width:100%;height:64px;resize:vertical;">${url}</textarea>

     <div class="set-hint" style="text-align:left;margin:0 0 6px;">Сила полярного сияния (NOAA).</div>
     <textarea id="src_aurora_url" class="set-input" style="width:100%;height:64px;resize:vertical;">${aurUrl}</textarea>
     <label style="display:flex;gap:8px;align-items:flex-start;margin-top:8px;">
       <input type="checkbox" id="src_aurora_on" ${on?"checked":""} style="margin-top:3px;">
       <span class="set-hint" style="text-align:left;">Собирать данные о сиянии.
       В вашем месте сияние возможно от Kp ${kpNeed} и выше.
       Если широта мала, вероятность увидеть почти всегда нулевая — опрос лучше выключить,
       чтобы не нагружать сервер.
       Вероятность увидеть ниже 10 % не записываются — это фоновый шум модели.</span>
     </label>
     <div class="set-hint" style="text-align:left;margin-top:8px;">
       Расчёт нагрузки: тёмное время ~${night.toFixed(1)} ч в сутки,
       ${perDay} запросов в сутки, около ${gb} ГБ в месяц.
       ${Number(gb) > 4 ? "⚠ Близко к пределу сервера (5 ГБ) — стоит опрашивать реже." : "Предел сервера 5 ГБ в месяц — укладываемся."}
     </div>`;

  const statsEl = document.getElementById("src-geomag-stats");
  statsEl.innerHTML = `<span>Факт в базе: считаю…</span>`;
  document.getElementById("src-geomag-modal").classList.add("open");
  const step = await geomagStepMin();
  statsEl.innerHTML =
    (step ? `<span>Факт в базе: ${fmtStep(step)}</span>` : `<span>Факт в базе: нет данных</span>`) +
    `<span>Прогноз: раз в 1 ч</span>` +
    `<span>Сияние: раз в 20 мин, при слабом раз в 15 мин, при сильном раз в 5 мин</span>`;
}
function closeSrcGeomag(){ document.getElementById("src-geomag-modal").classList.remove("open"); }
async function saveSrcGeomag(){
  const val = document.getElementById("src_geomag_url").value.trim();
  const aur = document.getElementById("src_aurora_url").value.trim();
  const on  = document.getElementById("src_aurora_on").checked;
  if(!SETTINGS.weather_sources) SETTINGS.weather_sources = {};
  if(!SETTINGS.weather_sources.geomag) SETTINGS.weather_sources.geomag = {};
  if(!SETTINGS.weather_sources.aurora) SETTINGS.weather_sources.aurora = {};
  if(!SETTINGS.config_items) SETTINGS.config_items = {};
  SETTINGS.weather_sources.geomag.url = val || GEOMAG_DEFAULT_URL;
  SETTINGS.weather_sources.aurora.url = aur || AURORA_DEFAULT_URL;
  SETTINGS.weather_sources.aurora.enabled = on;
  SETTINGS.config_items.aurora = on;
  await saveSettings();
  closeSrcGeomag();
}