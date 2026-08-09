/* ===== Open-Meteo: настройки источника (окно как у Магнитных бурь) ===== */

const OPENMETEO_INTERVAL_MIN = 15; // раз в 15 минут (совпадает с будильником на сервере)
/* человеческие имена полей (для показа iOM_Имя); незнакомое поле покажем как есть */
const OPENMETEO_NAMES = {
  temperature_2m:"Температура", apparent_temperature:"Ощущается как",
  relative_humidity_2m:"Влажность", dew_point_2m:"Точка росы",
  pressure_msl:"Давление", cloud_cover:"Облачность",
  wind_speed_10m:"Скорость ветра", wind_gusts_10m:"Порывы ветра",
  wind_direction_10m:"Направление ветра", precipitation:"Осадки",
  uv_index:"УФ-индекс", visibility:"Видимость"
};
/* распределение по умолчанию (по твоей таблице) */
const OPENMETEO_DEFAULT_MAP = {
  temperature_2m:"temp", apparent_temperature:"temp", relative_humidity_2m:"rh",
  dew_point_2m:"temp", pressure_msl:"pressure", cloud_cover:"no",
  wind_speed_10m:"wind_spd", wind_gusts_10m:"no", wind_direction_10m:"wind_dir",
  precipitation:"no", uv_index:"uv", visibility:"no"
};
let openmeteoFields = [];

/* пробный запрос: узнать, какие поля реально приходят */
async function openmeteoProbe(url){
  try {
    const u = String(url).replace("{lat}", SETTINGS.lat).replace("{lon}", SETTINGS.lon);
    const r = await fetch(u);
    const j = await r.json();
    const cur = j.current || {};
    const fields = [];
    for (const k of Object.keys(cur)){
      if (k === "time" || k === "interval") continue;
      fields.push({ field:k, label:"iOM_" + (OPENMETEO_NAMES[k] || k) });
    }
    return fields;
  } catch(e){ return []; }
}

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
    `<div class="set-hint" style="text-align:left;margin:0 0 8px;">Один запрос отдаёт все погодные параметры (Open-Meteo).</div>
     <textarea id="src_openmeteo_url" class="set-input" style="width:100%;height:120px;resize:vertical;"></textarea>
     <div style="display:flex;align-items:center;justify-content:space-between;margin:12px 0 6px;">
       <span class="set-hint" style="text-align:left;">Куда выводить параметры:</span>
       <button class="set-btn sm" type="button" onclick="refreshOpenmeteoMap()">Обновить</button>
     </div>
     <div id="src-openmeteo-map"><div class="set-hint">Запрашиваю параметры…</div></div>`;
  const statsEl = document.getElementById("src-openmeteo-stats");
  statsEl.innerHTML = `<span>Факт в базе: считаю…</span>`;
  document.getElementById("src-openmeteo-modal").classList.add("open");
  document.getElementById("src_openmeteo_url").value = url;

  const step = await weatherStepMin("open-meteo");
  statsEl.innerHTML =
    (step ? `<span>Факт в базе: ${fmtStep(step)}</span>` : `<span>Факт в базе: нет данных</span>`) +
    `<span>Прогноз: раз в 1 ч</span>`;

  await refreshOpenmeteoMap();
}

async function refreshOpenmeteoMap(){
  const box = document.getElementById("src-openmeteo-map");
  box.innerHTML = `<div class="set-hint">Запрашиваю параметры…</div>`;
  const url = document.getElementById("src_openmeteo_url").value.trim() || OPENMETEO_DEFAULT_URL;
  const gs = (SETTINGS.weather_sources && SETTINGS.weather_sources["open-meteo"]) || {};
  const fields = await openmeteoProbe(url);
  if (!fields.length){
    box.innerHTML = `<div class="set-hint">Нет связи с источником. Проверьте ссылку и нажмите «Обновить».</div>`;
    openmeteoFields = [];
    return;
  }
  openmeteoFields = fields;
  const curMap = (gs.map && Object.keys(gs.map).length) ? gs.map : OPENMETEO_DEFAULT_MAP;
  renderSourceMap("src-openmeteo-map", openmeteoFields, curMap);
}
function closeSrcOpenmeteo(){ document.getElementById("src-openmeteo-modal").classList.remove("open"); }
async function saveSrcOpenmeteo(){
  const val = document.getElementById("src_openmeteo_url").value.trim();
  if(!SETTINGS.weather_sources) SETTINGS.weather_sources = {};
  if(!SETTINGS.weather_sources["open-meteo"]) SETTINGS.weather_sources["open-meteo"] = {};
  SETTINGS.weather_sources["open-meteo"].url = val || OPENMETEO_DEFAULT_URL;
  SETTINGS.weather_sources["open-meteo"].map = readSourceMap(openmeteoFields);
  await saveSettings();
  closeSrcOpenmeteo();
}