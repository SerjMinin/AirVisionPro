/* 
 * Copyright (c) 2026 Минин Сергей Александрович.
 * Licensed under the GNU Affero General Public License v3.0.
 * See LICENSE file in the project root for full license information.
 */
/* AirVision Pro — магнитные бури: Kp факт+прогноз, ось 0–9, ореол северного сияния. */

const GEOMAG_FACT_URL = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";
const GEOMAG_FCST_URL = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json";

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
    ctx.save();
    ctx.fillStyle="rgba(150,170,200,0.4)";
    ctx.textAlign="right"; ctx.textBaseline="top";
    ctx.font="12px 'Exo 2',sans-serif";
    ctx.fillText("Источник: NOAA SWPC · планетарный Kp", chartArea.right-8, chartArea.top+6);
    if(chart.$bgLabel){
      ctx.font="600 34px 'Exo 2',sans-serif";
      ctx.fillText(chart.$bgLabel, chartArea.right-8, chartArea.top+26);
    }
    ctx.restore();
  }
};

async function fetchGeomag(){
  const [fr, cr] = await Promise.all([
    fetch(GEOMAG_FACT_URL, {cache:"no-store"}),
    fetch(GEOMAG_FCST_URL, {cache:"no-store"})
  ]);
  if(!fr.ok || !cr.ok) throw new Error("HTTP "+fr.status+"/"+cr.status);
  const f = await fr.json(), c = await cr.json();

  const fact = normalizeKp(f).map(o => ({ ts:o.ts, kp:o.kp }))
                             .filter(x=>!isNaN(x.kp)&&!isNaN(x.ts));
  const fcst = normalizeKp(c).filter(o => o.obs !== "observed")
                             .map(o => ({ ts:o.ts, kp:o.kp }))
                             .filter(x=>!isNaN(x.kp)&&!isNaN(x.ts));

  console.log("[geomag] факт:", fact.length, "прогноз:", fcst.length);
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
  if (currentRange==="24h")  return p(d.getUTCDate())+" "+p(d.getUTCHours())+":00"; // «18 14:00»
  if (currentRange==="year") return d.getUTCFullYear()+"."+p(d.getUTCMonth()+1);   // «2026.07»
  return p(d.getUTCDate())+"."+p(d.getUTCMonth()+1);                                // «18.07»
}

function drawGeomagChart(fact, fcst, errText){
  const now = Math.floor(Date.now()/1000);
  const pastSpan = RANGES[currentRange].sec;
  // окно сдвигается ЦЕЛИКОМ при листании — масштаб не меняется
  const from = now - pastSpan - offsetSteps*pastSpan;
  const to   = now + 3*24*3600 - offsetSteps*pastSpan;
  const toX  = (to - from)/3600;
  const X = ts => (ts - from)/3600;
  const mlat = geomagLat(SETTINGS.lat, SETTINGS.lon);

  const fF = fact.filter(p=>p.ts>=from && p.ts<=Math.min(now,to)).sort((a,b)=>a.ts-b.ts);
  const fC = fcst.filter(p=>p.ts>now && p.ts<=to).sort((a,b)=>a.ts-b.ts);

  const all = fF.concat(fC);
  const pts = all.map(p=>({ x:X(p.ts), y:p.kp, ts:p.ts }));

  const COL = {
    fact:"#37d67a",
    d1:"rgba(90,100,114,1)",
    d2:"rgba(90,100,114,0.67)",
    d3:"rgba(90,100,114,0.34)"
  };
  const colorForTs = ts => {
    if(ts <= now)         return COL.fact;
    if(ts <= now+1*86400) return COL.d1;
    if(ts <= now+2*86400) return COL.d2;
    return COL.d3;
  };
  const segColor = ctx => colorForTs(from + ctx.p1.parsed.x*3600);
  const segDash  = ctx => (from + ctx.p1.parsed.x*3600) > now ? [6,4] : undefined;
  const pointColors = pts.map(p=>colorForTs(p.ts));

  const auroraPts = pts.map(p=>({x:p.x,visible:auroraVisible(p.y,mlat)}));

  const isLight=getTheme()==="light";
  const gridColor=isLight?"rgba(20,60,110,0.14)":"rgba(120,190,255,0.18)";
  const tickColor=isLight?"#0d2a4a":"#eaf4ff";

  const legendItems = [
    { text:t("geomag_fact"), color:COL.fact, dash:false },
    { text:t("geomag_d1"),   color:COL.d1,   dash:true  },
    { text:t("geomag_d2"),   color:COL.d2,   dash:true  },
    { text:t("geomag_d3"),   color:COL.d3,   dash:true  }
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
    }]},
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
  document.getElementById("chart-title").textContent = t("tab_geomag");
  drawGeomagChart([], [], null);
  try{
    const { fact, fcst } = await fetchGeomag();
    drawGeomagChart(fact, fcst, null);
  }catch(e){
    console.error("[geomag] ошибка загрузки:", e);
    drawGeomagChart([], [], t("geomag_err"));
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