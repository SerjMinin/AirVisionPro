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
  const fact = f.slice(1).map(r=>({ts:parseNoaaTs(r[0]),kp:parseFloat(r[1])})).filter(x=>!isNaN(x.kp)&&!isNaN(x.ts));
  const fcst = c.slice(1).map(r=>({ts:parseNoaaTs(r[0]),kp:parseFloat(r[1]),obs:(r[2]||"")}))
                        .filter(x=>!isNaN(x.kp)&&!isNaN(x.ts)&&x.obs!=="observed");
  console.log("[geomag] факт:", fact.length, "прогноз:", fcst.length);
  return { fact, fcst };
}

function drawGeomagChart(fact, fcst, errText){
  const now = Math.floor(Date.now()/1000);
  const pastSpan = RANGES[currentRange].sec;
  const from = now - pastSpan - offsetSteps*pastSpan;
  const to   = now + 3*24*3600;
  const toX  = (to - from)/3600;
  const X = ts => (ts - from)/3600;
  const mlat = geomagLat(SETTINGS.lat, SETTINGS.lon);

  const fF = fact.filter(p=>p.ts>=from && p.ts<=now);
  const fC = fcst.filter(p=>p.ts>=now && p.ts<=to);

  const factDs = { label:t("geomag_fact"), data:fF.map(p=>({x:X(p.ts),y:p.kp})),
    borderColor:"#37d67a", backgroundColor:"rgba(55,214,122,0.15)", tension:0.25, pointRadius:2, fill:false };
  const dayCol=["#5a6472","#8a94a4","#c2cad6"];
  const fds=[0,1,2].map(d=>({
    label:t("geomag_fcst")+" "+(d+1)+t("geomag_day"),
    data:fC.filter(p=>p.ts>=now+d*86400 && p.ts<now+(d+1)*86400).map(p=>({x:X(p.ts),y:p.kp})),
    borderColor:dayCol[d], backgroundColor:dayCol[d]+"22", borderDash:[6,4], tension:0.25, pointRadius:2, fill:false
  }));
  const auroraPts = fF.concat(fC).map(p=>({x:X(p.ts),visible:auroraVisible(p.kp,mlat)}));

  const isLight=getTheme()==="light";
  const gridColor=isLight?"rgba(20,60,110,0.14)":"rgba(120,190,255,0.18)";
  const tickColor=isLight?"#0d2a4a":"#eaf4ff";

  if(chart){ chart.destroy(); chart=null; }
  chart = new Chart(document.getElementById("chart"),{
    type:"line",
    data:{ datasets:[factDs, ...fds] },
    options:{ responsive:true, maintainAspectRatio:false, parsing:true,
      interaction:{ mode:"nearest", intersect:false },
      plugins:{ legend:{ labels:{ color:tickColor } } },
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

  const adv=document.getElementById("advice");
  if(errText){ adv.textContent = errText; return; }
  const last = fF.length ? fF[fF.length-1] : (fC[0]||null);
  if(last){
    const g = last.kp>=9?G_TABLE[4]:last.kp>=8?G_TABLE[3]:last.kp>=7?G_TABLE[2]:last.kp>=6?G_TABLE[1]:last.kp>=5?G_TABLE[0]:null;
    adv.textContent = "Kp "+last.kp.toFixed(1)+(g?" · "+g.g+" "+g.name:" · "+t("geomag_calm"))+
      (auroraVisible(last.kp,mlat)?" · "+t("geomag_aurora"):"");
  } else adv.textContent = t("geomag_calm");
}

async function renderGeomag(){
  if(currentView!=="geomag") return;
  showCanvasGraph();
  document.getElementById("chart-title").textContent = t("tab_geomag");
  // сначала рисуем пустой каркас (оси 0–9 будут видны сразу)
  drawGeomagChart([], [], t("advice_default"));
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