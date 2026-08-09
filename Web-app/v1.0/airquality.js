/* ===== Open-Meteo Air Quality: настройки источника (по образцу openmeteo.js) ===== */

const AIRQUALITY_INTERVAL_MIN = 60; // раз в 60 минут
/* человеческие подписи (после префикса iOA_) */
const AIRQUALITY_NAMES = {
  pm2_5:"2,5", pm10:"10",
  methane:"", carbon_monoxide:"", carbon_dioxide:"",
  ammonia:"", nitrogen_dioxide:"", ozone:"", sulphur_dioxide:"",
  dust:"Dust", aerosol_optical_depth:"Depth",
  uv_index:"", us_aqi:"us", european_aqi:"eu",
  alder_pollen:"Ольха", birch_pollen:"Берёза", grass_pollen:"Травы",
  mugwort_pollen:"Полынь", olive_pollen:"Олива", ragweed_pollen:"Амброзия"
};
/* распределение по умолчанию (по твоей таблице) */
const AIRQUALITY_DEFAULT_MAP = {
  pm2_5:"pm", pm10:"pm", dust:"pm", aerosol_optical_depth:"pm",
  methane:"ch4", carbon_monoxide:"co", carbon_dioxide:"co2",
  ammonia:"nh3", nitrogen_dioxide:"no2", ozone:"o3", sulphur_dioxide:"so2",
  uv_index:"uv", us_aqi:"no", european_aqi:"aqi",
  alder_pollen:"pm", birch_pollen:"pm", grass_pollen:"pm",
  mugwort_pollen:"pm", olive_pollen:"pm", ragweed_pollen:"pm"
};
let airqualityFields = [];

const AIRQUALITY_DEFAULT_URL =
  "https://air-quality-api.open-meteo.com/v1/air-quality" +
  "?latitude={lat}&longitude={lon}" +
  "&current=pm2_5,pm10,dust,aerosol_optical_depth," +
  "carbon_monoxide,carbon_dioxide,nitrogen_dioxide,sulphur_dioxide,ozone,ammonia,methane," +
  "uv_index,us_aqi,european_aqi," +
  "alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen" +
  "&timezone=GMT";

/* пробный запрос: узнать, какие поля реально приходят */
async function airqualityProbe(url){
  try {
    const u = String(url).replace("{lat}", SETTINGS.lat).replace("{lon}", SETTINGS.lon);
    const r = await fetch(u);
    const j = await r.json();
    const cur = j.current || {};
    const fields = [];
    for (const k of Object.keys(cur)){
      if (k === "time" || k === "interval") continue;
      fields.push({ field:k, label:"iOA_" + (k in AIRQUALITY_NAMES ? AIRQUALITY_NAMES[k] : k) });
    }
    return fields;
  } catch(e){ return []; }
}

async function openSrcAirquality(){
  const gs = (SETTINGS.weather_sources && SETTINGS.weather_sources["open-meteo-air"]) || {};
  const url = gs.url || AIRQUALITY_DEFAULT_URL;
  document.getElementById("src-airquality-body").innerHTML =
    `<div class="set-hint" style="text-align:left;margin:0 0 8px;">Один запрос отдаёт качество воздуха и пыльцу (Open-Meteo Air Quality).</div>
     <textarea id="src_airquality_url" class="set-input" style="width:100%;height:120px;resize:vertical;"></textarea>
     <div style="display:flex;align-items:center;justify-content:space-between;margin:12px 0 6px;">
       <span class="set-hint" style="text-align:left;">Куда выводить параметры:</span>
       <button class="set-btn sm" type="button" onclick="refreshAirqualityMap()">Обновить</button>
     </div>
     <div id="src-airquality-map"><div class="set-hint">Запрашиваю параметры…</div></div>`;
  const statsEl = document.getElementById("src-airquality-stats");
  statsEl.innerHTML = `<span>Факт в базе: считаю…</span>`;
  document.getElementById("src-airquality-modal").classList.add("open");
  document.getElementById("src_airquality_url").value = url;

  const step = await weatherStepMin("open-meteo-air");
  statsEl.innerHTML =
    (step ? `<span>Факт в базе: ${fmtStep(step)}</span>` : `<span>Факт в базе: нет данных</span>`) +
    `<span>Прогноз: раз в 1 ч</span>`;

  await refreshAirqualityMap();
}

async function refreshAirqualityMap(){
  const box = document.getElementById("src-airquality-map");
  box.innerHTML = `<div class="set-hint">Запрашиваю параметры…</div>`;
  const url = document.getElementById("src_airquality_url").value.trim() || AIRQUALITY_DEFAULT_URL;
  const gs = (SETTINGS.weather_sources && SETTINGS.weather_sources["open-meteo-air"]) || {};
  const fields = await airqualityProbe(url);
  if (!fields.length){
    box.innerHTML = `<div class="set-hint">Нет связи с источником. Проверьте ссылку и нажмите «Обновить».</div>`;
    airqualityFields = [];
    return;
  }
  airqualityFields = fields;
  const curMap = (gs.map && Object.keys(gs.map).length) ? gs.map : AIRQUALITY_DEFAULT_MAP;
  renderSourceMap("src-airquality-map", airqualityFields, curMap);
}
function closeSrcAirquality(){ document.getElementById("src-airquality-modal").classList.remove("open"); }
async function saveSrcAirquality(){
  const val = document.getElementById("src_airquality_url").value.trim();
  if(!SETTINGS.weather_sources) SETTINGS.weather_sources = {};
  if(!SETTINGS.weather_sources["open-meteo-air"]) SETTINGS.weather_sources["open-meteo-air"] = {};
  SETTINGS.weather_sources["open-meteo-air"].url = val || AIRQUALITY_DEFAULT_URL;
  SETTINGS.weather_sources["open-meteo-air"].map = readSourceMap(airqualityFields);
  await saveSettings();
  closeSrcAirquality();
}