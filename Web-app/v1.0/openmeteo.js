/* ===== Open-Meteo: настройки источника (окно как у Магнитных бурь) ===== */

/* считает реальный шаг данных в базе (по таблице weather) */
async function weatherStepMin(source){
  try {
    const r = await client.from("weather")
      .select("ts_utc").eq("source", source)
      .order("ts_utc", { ascending:false }).limit(200);
    const rows = r.data || [];
    const uniq = {}; rows.forEach(o => { uniq[o.ts_utc] = 1; });
    const times = Object.keys(uniq).map(s => Date.parse(s)).sort((a,b)=>b-a);
    if (times.length < 2) return null;
    const diffs = [];
    for (let i=0; i<times.length-1; i++) diffs.push((times[i]-times[i+1])/60000);
    diffs.sort((a,b)=>a-b);
    return Math.round(diffs[Math.floor(diffs.length/2)]); // серединное значение
  } catch(e){ return null; }
}
/* красиво подписывает: минуты или часы */
function fmtStep(min){
  if (min >= 60) return `раз в ~${Math.round(min/60)} ч`;
  return `раз в ~${min} мин`;
}
const OPENMETEO_INTERVAL_MIN = 15; // раз в 15 минут (совпадает с будильником на сервере)

const OPENMETEO_DEFAULT_URL =
  "https://api.open-meteo.com/v1/forecast" +
  "?latitude={lat}&longitude={lon}" +
  "&current=temperature_2m,relative_humidity_2m,apparent_temperature,dew_point_2m," +
  "pressure_msl,wind_speed_10m,wind_direction_10m,uv_index," +
  "cloud_cover,wind_gusts_10m,precipitation,visibility" +
  "&timezone=GMT";

async function openSrcOpenmeteo(){
  const gs = (SETTINGS.weather_sources && SETTINGS.weather_sources["open-meteo"]) || {};
  const url = gs.url || OPENMETEO_DEFAULT_URL;
  document.getElementById("src-openmeteo-body").innerHTML =
    `<div class="set-hint" style="text-align:left;margin:0 0 8px;">Один запрос отдаёт все погодные параметры (Open-Meteo). Ключ не нужен.</div>
     <textarea id="src_openmeteo_url" class="set-input" style="width:100%;height:160px;resize:vertical;">${url}</textarea>`;
  const statsEl = document.getElementById("src-openmeteo-stats");
  statsEl.innerHTML = `<span>Данные в базе: считаю…</span>`;
  document.getElementById("src-openmeteo-modal").classList.add("open");
  const step = await weatherStepMin("open-meteo");
  statsEl.innerHTML =
    (step ? `<span>Факт в базе: ${fmtStep(step)}</span>` : `<span>Факт в базе: нет данных</span>`) +
    `<span>Прогноз: раз в 1 ч</span>`;
}
function closeSrcOpenmeteo(){ document.getElementById("src-openmeteo-modal").classList.remove("open"); }
async function saveSrcOpenmeteo(){
  const val = document.getElementById("src_openmeteo_url").value.trim();
  if(!SETTINGS.weather_sources) SETTINGS.weather_sources = {};
  if(!SETTINGS.weather_sources["open-meteo"]) SETTINGS.weather_sources["open-meteo"] = {};
  SETTINGS.weather_sources["open-meteo"].url = val || OPENMETEO_DEFAULT_URL;
  await saveSettings();
  closeSrcOpenmeteo();
}