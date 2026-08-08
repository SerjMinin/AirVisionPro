/* ===== Open-Meteo: настройки источника (окно как у Магнитных бурь) ===== */

const OPENMETEO_INTERVAL_MIN = 15; // раз в 15 минут (совпадает с будильником на сервере)

const OPENMETEO_DEFAULT_URL =
  "https://api.open-meteo.com/v1/forecast" +
  "?latitude={lat}&longitude={lon}" +
  "&current=temperature_2m,relative_humidity_2m,apparent_temperature,dew_point_2m," +
  "pressure_msl,wind_speed_10m,wind_direction_10m,uv_index," +
  "cloud_cover,wind_gusts_10m,precipitation,visibility" +
  "&timezone=GMT";

function openSrcOpenmeteo(){
  const gs = (SETTINGS.weather_sources && SETTINGS.weather_sources.openmeteo) || {};
  const url = gs.url || OPENMETEO_DEFAULT_URL;
  document.getElementById("src-openmeteo-body").innerHTML =
    `<div class="set-hint" style="text-align:left;margin:0 0 8px;">Один запрос отдаёт все погодные параметры (Open-Meteo). Ключ не нужен.</div>
     <textarea id="src_openmeteo_url" class="set-input" style="width:100%;height:160px;resize:vertical;">${url}</textarea>`;
  document.getElementById("src-openmeteo-stats").innerHTML =
    `<span>Запрос: раз в ${OPENMETEO_INTERVAL_MIN} мин</span>`;
  document.getElementById("src-openmeteo-modal").classList.add("open");
}
function closeSrcOpenmeteo(){ document.getElementById("src-openmeteo-modal").classList.remove("open"); }
async function saveSrcOpenmeteo(){
  const val = document.getElementById("src_openmeteo_url").value.trim();
  if(!SETTINGS.weather_sources) SETTINGS.weather_sources = {};
  if(!SETTINGS.weather_sources.openmeteo) SETTINGS.weather_sources.openmeteo = {};
  SETTINGS.weather_sources.openmeteo.url = val || OPENMETEO_DEFAULT_URL;
  await saveSettings();
  closeSrcOpenmeteo();
}