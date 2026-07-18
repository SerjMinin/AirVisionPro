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
    ctx.font="12px 'Exo 2',sans-serif"; ctx.fillStyle="rgba(150,170,200,0.4)";
    ctx.textAlign="right"; ctx.textBaseline="top";
    ctx.fillText("Источник: NOAA SWPC · планетарный Kp", chartArea.right-8, chartArea.top+6);
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
  // Старый формат: первый элемент — массив-заголовок ["time_tag","Kp",...]
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
  // Новый формат: массив объектов {time_tag, Kp/kp, observed,...}
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

function drawGeomagChart(fact, fcst, errText){
  const now = Math.floor(Date.now()/1000);
  const pastSpan = RANGES[currentRange].sec;
  const from = now - pastSpan - offsetSteps*pastSpan;
  const to   = now + 3*24*3600;
  const toX  = (to - from)/3600;
  const X = ts => (ts - from)/3600;
  const mlat = geomagLat(SETTINGS.lat, SETTINGS.lon);

  const fF = fact.filter(p=>p.ts>=from && p.ts<=now).sort((a,b)=>a.ts-b.ts);
  const fC = fcst.filter(p=>p.ts>=now && p.ts<=to).sort((a,b)=>a.ts-b.ts);

  // факт
  const factPts = fF.map(p=>({x:X(p.ts),y:p.kp}));
  // прогноз по суткам
  const seg = d => fC.filter(p=>p.ts>=now+d*86400 && p.ts<now+(d+1)*86400).map(p=>({x:X(p.ts),y:p.kp}));
  const d1=seg(0), d2=seg(1), d3=seg(2);

  // «мостики»: пришиваем конец предыдущего сегмента к началу следующего
  const bridge = (prevArr, curArr) => {
    if(prevArr.length && curArr.length) return [prevArr[prevArr.length-1], ...curArr];
    return curArr;
  };
  const lastFact = factPts.length ? factPts[factPts.length-1] : null;
  const d1b = lastFact && d1.length ? [lastFact, ...d1] : d1;
  const d2b = bridge(d1b, d2);
  const d3b = bridge(d2b, d3);

  const factDs = { label:t("geomag_fact"), data:factPts,
    borderColor:"#37d67a", backgroundColor:"rgba(55,214,122,0.15)", tension:0.25, pointRadius:2, fill:false };
  const mk = (label,data,color) => ({ label, data, borderColor:color, backgroundColor:color+"22",
    borderDash:[6,4], tension:0.25, pointRadius:2, fill:false });
  const ds1 = mk(t("geomag_d1"), d1b, "#5a6472"); // 1 сутки — тёмно-серый
  const ds2 = mk(t("geomag_d2"), d2b, "#8a94a4"); // 2 сутки — серый
  const ds3 = mk(t("geomag_d3"), d3b, "#c2cad6"); // 3 сутки — светло-серый

  const auroraPts = fF.concat(fC).map(p=>({x:X(p.ts),visible:auroraVisible(p.kp,mlat)}));

  const isLight=getTheme()==="light";
  const gridColor=isLight?"rgba(20,60,110,0.14)":"rgba(120,190,255,0.18)";
  const tickColor=isLight?"#0d2a4a":"#eaf4ff";

  if(chart){ chart.destroy(); chart=null; }
  chart = new Chart(document.getElementById("chart"),{
    type:"line",
    data:{ datasets:[factDs, ds1, ds2, ds3] },
    options:{ responsive:true, maintainAspectRatio:false, parsing:true,
      interaction:{ mode:"nearest", intersect:false },
      plugins:{ legend:{ labels:{ color:tickColor, usePointStyle:true, pointStyle:"line", boxWidth:28 } } },
      scales:{
        x:{ type:"linear", min:0, max:toX, grid:{ color:gridColor },
          ticks:{ color:tickColor, maxTicksLimit:12, callback:v=>fmtTick(from+v*3600,currentRange) } },
        y:{ min:0, max:9, grid:{ color:gridColor },
          ticks:{ color:tickColor, stepSize:1, callback:v=>"Kp "+v } }
      }
    },
    plugins:[auroraPlugin, wmPlugin]
  });
  chart.$auroraPts = auroraPts;
  chart.$nowX = X(now);
  chart.update();

  // строку советов больше НЕ трогаем здесь (см. п.2)
  if(errText){ document.getElementById("advice").textContent = errText; }
}

async function renderGeomag(){
  if(currentView!=="geomag") return;
  showCanvasGraph();
  document.getElementById("chart-title").textContent = t("tab_geomag");
  // сначала рисуем пустой каркас (оси 0–9 будут видны сразу)
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