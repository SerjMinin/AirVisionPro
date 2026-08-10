/*
 * Copyright (c) 2026 Минин Сергей Александрович.
 * Licensed under the GNU Affero General Public License v3.0.
 */
/* AirVisionPro — прогноз на 3 дня для интернет-источников (прямой запрос + кэш 1 ч). */

let wxFcstCache = {};   // source -> { time, data: { param:[{ts,val}] } }

async function loadWeatherForecast(source, param){
  const c = wxFcstCache[source];
  if (!c || Date.now() - c.time > 3600*1000){
    wxFcstCache[source] = { time: Date.now(), data: await fetchWxForecast(source) };
  }
  const d = wxFcstCache[source].data || {};
  return d[param] || [];
}

async function fetchWxForecast(source){
  try{
    if (source === "open-meteo")
      return await fetchOMForecast("https://api.open-meteo.com/v1/forecast", source,
        (typeof OPENMETEO_DEFAULT_MAP!=="undefined"?OPENMETEO_DEFAULT_MAP:{}));
    if (source === "open-meteo-air")
      return await fetchOMForecast("https://air-quality-api.open-meteo.com/v1/air-quality", source,
        (typeof AIRQUALITY_DEFAULT_MAP!=="undefined"?AIRQUALITY_DEFAULT_MAP:{}));
    if (source === "owm")
      return await fetchOWMForecast();
  }catch(e){ console.warn("[forecast]", source, e); }
  return {};
}

/* Open-Meteo и Air Quality: почасовой прогноз */
async function fetchOMForecast(baseUrl, source, defMap){
  const gs = (SETTINGS.weather_sources && SETTINGS.weather_sources[source]) || {};
  const wmap = (gs.map && Object.keys(gs.map).length) ? gs.map : defMap;
  const fields = Object.keys(wmap).filter(k => wmap[k] !== "no");
  if (!fields.length) return {};
  const url = `${baseUrl}?latitude=${SETTINGS.lat}&longitude=${SETTINGS.lon}`
            + `&hourly=${fields.join(",")}&forecast_days=4&timezone=UTC`;
  const r = await fetch(url, {cache:"no-store"});
  const j = await r.json();
  const time = (j.hourly && j.hourly.time) || [];
  const out = {};
  fields.forEach(f => {
    const arr = j.hourly && j.hourly[f];
    if (!arr) return;
    out[f] = time.map((tt,i) => ({ ts: Math.floor(Date.parse(tt+":00Z")/1000), val: Number(arr[i]) }))
                 .filter(x => !isNaN(x.val) && !isNaN(x.ts));
  });
  return out;
}

/* OpenWeatherMap: прогноз 5 дней с шагом 3 ч */
async function fetchOWMForecast(){
  const gs = (SETTINGS.weather_sources && SETTINGS.weather_sources["owm"]) || {};
  const key = gs.key;
  if (!key) return {};
  const url = `https://api.openweathermap.org/data/2.5/forecast`
            + `?lat=${SETTINGS.lat}&lon=${SETTINGS.lon}&appid=${key}&units=metric`;
  const r = await fetch(url, {cache:"no-store"});
  const j = await r.json();
  if (String(j.cod) !== "200") return {};
  const list = j.list || [];
  const out = { temp:[], feels_like:[], humidity:[], pressure:[], clouds:[],
                wind_speed:[], wind_gust:[], wind_deg:[], visibility:[] };
  list.forEach(it => {
    const ts = Number(it.dt);
    const f = owmFlatten(it);
    for (const k in out){ if (f[k] != null) out[k].push({ ts, val: Number(f[k]) }); }
  });
  return out;
}