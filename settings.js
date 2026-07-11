/* AirVision Pro — настройки: главные + по-страничные. */

let SETTINGS = null;

const API_SERVICES = [
  { id:"sensor_community", name:"sensor.community" },
  { id:"madavi",          name:"madavi.de" },
  { id:"aircms",          name:"aircms.online" },
  { id:"opensensemap",    name:"opensensemap.org" },
  { id:"thingspeak",      name:"ThingSpeak" },
  { id:"ha_mqtt",         name:"Home Assistant / MQTT (Mosquitto)" },
  { id:"custom_json",     name:"Custom JSON" },
  { id:"narodmon",        name:"Narodmon.ru" },
  { id:"blynk",           name:"Blynk" },
  { id:"thingsboard",     name:"ThingsBoard" }
];

const DEFAULT_SETTINGS = {
  config: "full",
  sources: { "sensor":true, "open-meteo":true, "owm":true },
  sn_out: "OUT-0001", sn_in: "IN-0001",
  lat: 55.752793, lon: 37.622672, alt_sea: 150, alt_ground: 5,
  units: { temp:"C", pressure:"hPa", wind_spd:"ms", rad:"uSv", co2:"ppm", co:"ppm" },
  temp_round: 1,
  pressure_auto: true,
  pressure_thr: { anom_low:970, low:1000, normal:1025, high:1040 }, // на уровне моря
  tabs: {},
  api_out: {},          // id -> { enabled:bool, cfg:{...} }
  advice: { mode:"sequence", critical_first:true, items:{} }
};

function mergeSettings(base, extra) {
  const out = JSON.parse(JSON.stringify(base));
  for (const k in extra) {
    if (extra[k] && typeof extra[k] === "object" && !Array.isArray(extra[k]))
      out[k] = mergeSettings(base[k] || {}, extra[k]);
    else out[k] = extra[k];
  }
  return out;
}

async function loadSettings() {
  const cached = localStorage.getItem("avp_settings");
  if (cached) { try { SETTINGS = mergeSettings(DEFAULT_SETTINGS, JSON.parse(cached)); } catch(e){} }
  if (!SETTINGS) SETTINGS = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  try {
    const { data:{ session } } = await client.auth.getSession();
    if (!session) return SETTINGS;
    const { data } = await client.from("settings").select("data").eq("owner", session.user.id).maybeSingle();
    if (data && data.data) {
      SETTINGS = mergeSettings(DEFAULT_SETTINGS, data.data);
      localStorage.setItem("avp_settings", JSON.stringify(SETTINGS));
    }
  } catch(e) { console.warn("settings load:", e); }
  return SETTINGS;
}

async function saveSettings() {
  localStorage.setItem("avp_settings", JSON.stringify(SETTINGS));
  try {
    const { data:{ session } } = await client.auth.getSession();
    await client.from("settings").upsert({ owner: session.user.id, data: SETTINGS, updated_at: new Date().toISOString() });
  } catch(e) { alert("Не удалось сохранить в облако: " + e.message); }
}

function selHtml(id, options, selected) {
  return `<select id="${id}" class="set-input">` +
    options.map(o => `<option value="${o.id}" ${o.id===selected?"selected":""}>${o.label}</option>`).join("") + `</select>`;
}

/* ============ ГЛАВНЫЕ НАСТРОЙКИ ============ */
function buildSettingsForm() {
  const s = SETTINGS;
  const srcRows = [["sensor",t("src_sensor")],["open-meteo","Open-Meteo"],["owm","OpenWeatherMap"]]
    .map(([id,label]) => `<label class="set-check"><input type="checkbox" id="src_${id}" ${s.sources[id]!==false?"checked":""}> ${label}</label>`).join("");
  const tabRows = PARAMS.map(p =>
    `<label class="set-check"><input type="checkbox" id="tab_${p.key}" ${s.tabs[p.key]!==false?"checked":""}> ${t(p.i18n)}</label>`).join("");

  document.getElementById("settings-body").innerHTML = `
    <div class="set-section"><h3>${t("set_config")}</h3>
      <div class="set-row"><label><input type="radio" name="cfg" value="site" ${s.config==="site"?"checked":""}> ${t("cfg_site")}</label></div>
      <div class="set-row"><label><input type="radio" name="cfg" value="outdoor" ${s.config==="outdoor"?"checked":""}> ${t("cfg_out")}</label></div>
      <div class="set-row"><label><input type="radio" name="cfg" value="full" ${s.config==="full"?"checked":""}> ${t("cfg_full")}</label></div>
    </div>
    <div class="set-section"><h3>${t("set_sources")}</h3>${srcRows}</div>
    <div class="set-section"><h3>${t("set_devices")}</h3>
      <div class="set-row"><label>${t("outdoor")} SN</label><input id="s_sn_out" class="set-input" value="${s.sn_out}"></div>
      <div class="set-row"><label>${t("indoor")} SN</label><input id="s_sn_in" class="set-input" value="${s.sn_in}"></div>
    </div>
    <div class="set-section"><h3>${t("set_location")}</h3>
      <div class="set-row"><label>${t("set_lat")}</label><input id="s_lat" class="set-input" type="number" step="0.000001" value="${s.lat}"></div>
      <div class="set-row"><label>${t("set_lon")}</label><input id="s_lon" class="set-input" type="number" step="0.000001" value="${s.lon}"></div>
      <div class="set-row"><label>${t("set_alt_sea")}, м</label><input id="s_alt_sea" class="set-input" type="number" value="${s.alt_sea}"></div>
      <div class="set-row"><label>${t("set_alt_ground")}, м</label><input id="s_alt_ground" class="set-input" type="number" value="${s.alt_ground}"></div>
    </div>
    <div class="set-section"><h3>${t("set_tabs")}</h3><div class="set-tabs-grid">${tabRows}</div></div>
  `;
}

function readSettingsForm() {
  const s = SETTINGS;
  const cfg = document.querySelector('input[name="cfg"]:checked'); if (cfg) s.config = cfg.value;
  ["sensor","open-meteo","owm"].forEach(id => { s.sources[id] = document.getElementById("src_"+id).checked; });
  s.sn_out = document.getElementById("s_sn_out").value.trim();
  s.sn_in  = document.getElementById("s_sn_in").value.trim();
  s.lat = parseFloat(document.getElementById("s_lat").value);
  s.lon = parseFloat(document.getElementById("s_lon").value);
  s.alt_sea = parseFloat(document.getElementById("s_alt_sea").value);
  s.alt_ground = parseFloat(document.getElementById("s_alt_ground").value);
  s.tabs = {}; PARAMS.forEach(p => { s.tabs[p.key] = document.getElementById("tab_"+p.key).checked; });
}

function openSettings() { buildSettingsForm(); document.getElementById("settings-modal").classList.add("open"); }
function closeSettings() { document.getElementById("settings-modal").classList.remove("open"); }
async function applySettings() { readSettingsForm(); await saveSettings(); closeSettings(); buildTabs(); renderParam(currentKey); }

/* ============ ПО-СТРАНИЧНЫЕ НАСТРОЙКИ ============ */
function renderThresholdsInputs() {
  const s = SETTINGS;
  const u = s.units.pressure;
  const auto = s.pressure_auto !== false;
  const eff = effectivePressureThresholds(s);            // hPa
  const show = v => convertUnit(v, "pressure", u).toFixed(u==="inHg"?2:0);
  const ul = unitLabel("pressure", u);

  // в авто-режиме показываем вычисленные (только чтение), в ручном — редактируемые (в hPa на ур. моря)
  const box = document.getElementById("thr-box");
  if (auto) {
    box.innerHTML = `
      <div class="set-hint">${t("thr_auto_hint")} (${(s.alt_sea||0)} м)</div>
      <div class="set-row"><label>${t("thr_anom_low")}</label><span>${show(eff.anom_low)} ${ul}</span></div>
      <div class="set-row"><label>${t("thr_low")}</label><span>${show(eff.low)} ${ul}</span></div>
      <div class="set-row"><label>${t("thr_normal")}</label><span>${show(eff.normal)} ${ul}</span></div>
      <div class="set-row"><label>${t("thr_high")}</label><span>${show(eff.high)} ${ul}</span></div>`;
  } else {
    const b = s.pressure_thr;
    box.innerHTML = `
      <div class="set-hint">${t("thr_manual_hint")} (${ul})</div>
      <div class="set-row"><label>${t("thr_anom_low")}</label><input id="thr_al" class="set-input" type="number" value="${show(b.anom_low)}"></div>
      <div class="set-row"><label>${t("thr_low")}</label><input id="thr_l" class="set-input" type="number" value="${show(b.low)}"></div>
      <div class="set-row"><label>${t("thr_normal")}</label><input id="thr_n" class="set-input" type="number" value="${show(b.normal)}"></div>
      <div class="set-row"><label>${t("thr_high")}</label><input id="thr_h" class="set-input" type="number" value="${show(b.high)}"></div>`;
  }
}

function buildParamSettings() {
  const p = PARAMS.find(x => x.key === currentKey);
  const s = SETTINGS;
  const g = PARAM_UNIT_GROUP[p.key];
  let html = `<div class="set-section"><h3>${t(p.i18n)}</h3>`;
  if (g) html += `<div class="set-row"><label>${t("set_unit")}</label>${selHtml("pu_unit", UNITS[g].opts, s.units[g])}</div>`;
  else   html += `<div class="set-row"><label>${t("set_unit")}</label><span>${p.unit || t("unit_none")} — ${t("unit_fixed")}</span></div>`;
  if (p.key === "temp")
    html += `<div class="set-row"><label>${t("set_rounding")}</label>${selHtml("pu_round", [{id:"0",label:t("round_int")},{id:"1",label:t("round_1")}], String(s.temp_round))}</div>`;
  html += `</div>`;

  if (p.key === "pressure") {
    html += `<div class="set-section"><h3>${t("set_pressure_thr")}</h3>
      <label class="set-check"><input type="checkbox" id="thr_auto" ${s.pressure_auto!==false?"checked":""}> ${t("thr_auto")}</label>
      <div id="thr-box"></div>
    </div>`;
  }
  document.getElementById("param-set-title").textContent = t("set_page") + t(p.i18n);
  document.getElementById("param-body").innerHTML = html;

  if (p.key === "pressure") {
    renderThresholdsInputs();
    // при смене единицы прямо в этом окне — перерисовать значения порогов
    const uSel = document.getElementById("pu_unit");
    if (uSel) uSel.addEventListener("change", () => { SETTINGS.units.pressure = uSel.value; renderThresholdsInputs(); });
    document.getElementById("thr_auto").addEventListener("change", e => { SETTINGS.pressure_auto = e.target.checked; renderThresholdsInputs(); });
  }
}

function openParamSettings() { buildParamSettings(); document.getElementById("param-modal").classList.add("open"); }
function closeParamSettings() { document.getElementById("param-modal").classList.remove("open"); }

async function applyParamSettings() {
  const p = PARAMS.find(x => x.key === currentKey);
  const s = SETTINGS;
  const g = PARAM_UNIT_GROUP[p.key];
  if (g) s.units[g] = document.getElementById("pu_unit").value;
  if (p.key === "temp") s.temp_round = parseInt(document.getElementById("pu_round").value);
  if (p.key === "pressure") {
    s.pressure_auto = document.getElementById("thr_auto").checked;
    if (!s.pressure_auto) {
      const u = s.units.pressure;
      const toH = v => {  // из выбранной единицы обратно в hPa
        if (u === "mmHg") return v/0.750062;
        if (u === "inHg") return v/0.0295300;
        return v; // hPa/mbar
      };
      s.pressure_thr = {
        anom_low: toH(parseFloat(document.getElementById("thr_al").value)),
        low:      toH(parseFloat(document.getElementById("thr_l").value)),
        normal:   toH(parseFloat(document.getElementById("thr_n").value)),
        high:     toH(parseFloat(document.getElementById("thr_h").value))
      };
    }
  }
  await saveSettings(); closeParamSettings(); renderParam(currentKey);
}

/* ============ ВКЛАДКА API OUT ============ */
function buildApiOut() {
  const s = SETTINGS;
  const rows = API_SERVICES.map(svc => {
    const st = s.api_out[svc.id] || {};
    return `<div class="api-row">
      <span class="api-name">${svc.name}</span>
      <label class="api-toggle"><input type="checkbox" id="api_en_${svc.id}" ${st.enabled?"checked":""}> ${t("api_enable")}</label>
      <button class="set-btn" onclick="alert('${t("api_soon")}')">${t("api_config")}</button>
    </div>`;
  }).join("");
  document.getElementById("api-body").innerHTML = `
    <div class="set-hint">${t("api_hint")}</div>${rows}`;
}
async function saveApiOut() {
  const s = SETTINGS;
  API_SERVICES.forEach(svc => {
    s.api_out[svc.id] = s.api_out[svc.id] || {};
    s.api_out[svc.id].enabled = document.getElementById("api_en_"+svc.id).checked;
  });
  await saveSettings();
  alert(t("api_saved"));
}