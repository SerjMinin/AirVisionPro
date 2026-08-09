/* ===== OpenWeatherMap: настройки источника (по образцу airquality.js) ===== */

const OWM_INTERVAL_MIN = 120; // раз в 120 минут
/* человеческие подписи (после префикса iOWM_) */
const OWM_NAMES = {
  temp:"Температура", feels_like:"Ощущается как", humidity:"Влажность",
  pressure:"Давление", clouds:"Облачность", wind_speed:"Скорость ветра",
  wind_gust:"Порывы ветра", wind_deg:"Направление ветра", visibility:"Видимость"
};
/* распределение по умолчанию (по твоей таблице) */
const OWM_DEFAULT_MAP = {
  temp:"temp", feels_like:"temp", humidity:"rh", pressure:"pressure",
  clouds:"no", wind_speed:"wind_spd", wind_gust:"no", wind_deg:"wind_dir",
  visibility:"no"
};
let owmFields = [];

const OWM_DEFAULT_URL =
  "https://api.openweathermap.org/data/2.5/weather" +
  "?lat={lat}&lon={lon}&appid={key}&units=metric";

/* «расплющиваем» ответ OWM так же, как это делает сервер */
function owmFlatten(resp){
  return {
    temp:       resp.main?.temp,
    feels_like: resp.main?.feels_like,
    humidity:   resp.main?.humidity,
    pressure:   resp.main?.pressure,
    clouds:     resp.clouds?.all,
    wind_speed: resp.wind?.speed,
    wind_gust:  resp.wind?.gust,
    wind_deg:   resp.wind?.deg,
    visibility: resp.visibility
  };
}

/* пробный запрос: узнать, какие поля реально приходят */
async function owmProbe(url, key){
  try {
    const u = String(url)
      .replace("{lat}", SETTINGS.lat)
      .replace("{lon}", SETTINGS.lon)
      .replace("{key}", key);
    const r = await fetch(u);
    const j = await r.json();
    if (String(j?.cod) !== "200") return [];
    const flat = owmFlatten(j);
    const fields = [];
    for (const k of Object.keys(flat)){
      if (flat[k] == null) continue;
      fields.push({ field:k, label:"iOWM_" + (OWM_NAMES[k] || k) });
    }
    return fields;
  } catch(e){ return []; }
}

async function openSrcOwm(){
  const gs = (SETTINGS.weather_sources && SETTINGS.weather_sources["owm"]) || {};
  const url = gs.url || OWM_DEFAULT_URL;
  document.getElementById("src-owm-body").innerHTML =
    `<div class="set-hint" style="text-align:left;margin:0 0 8px;">Один запрос отдаёт погоду (OpenWeatherMap). Нужен ваш личный ключ.</div>
     <textarea id="src_owm_url" class="set-input" style="width:100%;height:120px;resize:vertical;"></textarea>
     <div class="set-hint" style="text-align:left;margin:10px 0 4px;">Ваш ключ OpenWeatherMap:</div>
     <input id="src_owm_key" class="set-input" style="width:100%;" placeholder="Вставьте ключ (API key)">
     <div style="display:flex;align-items:center;justify-content:space-between;margin:12px 0 6px;">
       <span class="set-hint" style="text-align:left;">Куда выводить параметры:</span>
       <button class="set-btn sm" type="button" onclick="refreshOwmMap()">Обновить</button>
     </div>
     <div id="src-owm-map"><div class="set-hint">Введите ключ и нажмите «Обновить».</div></div>`;
  const statsEl = document.getElementById("src-owm-stats");
  statsEl.innerHTML = `<span>Факт в базе: считаю…</span>`;
  document.getElementById("src-owm-modal").classList.add("open");
  document.getElementById("src_owm_url").value = url;
  document.getElementById("src_owm_key").value = gs.key || "";

  const step = await weatherStepMin("owm");
  statsEl.innerHTML =
    (step ? `<span>Факт в базе: ${fmtStep(step)}</span>` : `<span>Факт в базе: нет данных</span>`) +
    `<span>Прогноз: раз в 2 ч</span>`;

  if (gs.key) await refreshOwmMap();
}

async function refreshOwmMap(){
  const box = document.getElementById("src-owm-map");
  const key = document.getElementById("src_owm_key").value.trim();
  if (!key){ box.innerHTML = `<div class="set-hint">Сначала вставьте ключ OpenWeatherMap.</div>`; owmFields = []; return; }
  box.innerHTML = `<div class="set-hint">Запрашиваю параметры…</div>`;
  const url = document.getElementById("src_owm_url").value.trim() || OWM_DEFAULT_URL;
  const gs = (SETTINGS.weather_sources && SETTINGS.weather_sources["owm"]) || {};
  const fields = await owmProbe(url, key);
  if (!fields.length){
    box.innerHTML = `<div class="set-hint">Нет связи с источником. Проверьте ключ и ссылку, затем нажмите «Обновить».</div>`;
    owmFields = [];
    return;
  }
  owmFields = fields;
  const curMap = (gs.map && Object.keys(gs.map).length) ? gs.map : OWM_DEFAULT_MAP;
  renderSourceMap("src-owm-map", owmFields, curMap);
}
function closeSrcOwm(){ document.getElementById("src-owm-modal").classList.remove("open"); }
async function saveSrcOwm(){
  const val = document.getElementById("src_owm_url").value.trim();
  const key = document.getElementById("src_owm_key").value.trim();
  if(!SETTINGS.weather_sources) SETTINGS.weather_sources = {};
  if(!SETTINGS.weather_sources["owm"]) SETTINGS.weather_sources["owm"] = {};
  SETTINGS.weather_sources["owm"].url = val || OWM_DEFAULT_URL;
  SETTINGS.weather_sources["owm"].key = key;
  SETTINGS.weather_sources["owm"].map = readSourceMap(owmFields);
  await saveSettings();
  closeSrcOwm();
}