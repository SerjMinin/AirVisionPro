/* AirVision Pro — настройки: главные + по-страничные + вкладки. */

let SETTINGS = null;

const API_SERVICES = [
  { id:"narodmon",        name:"Narodmon.ru" },
  { id:"thingspeak",      name:"ThingSpeak" },
  { id:"sensor_community",name:"Sensor.community" }
];

const CONFIG_ITEMS = [
  { id:"open_meteo", label:"Open-Meteo" },
  { id:"owm",        label:"OpenWeatherMap" },
  { id:"yandex",     label:"Yandex Weather (SmartHome API)" },
  { id:"dev_out",    label:"Сайт + уличное устройство" },
  { id:"dev_in",     label:"Сайт + домашнее устройство" }
];

const EXTRA_TABS = [
  { id:"geomag", i18n:"tab_geomag" },
  { id:"api",    label:"API OUT" },
  { id:"advice", i18n:"tab_advice" },
  { id:"smarthome", i18n:"tab_smart" }
];

const PARAM_INFO = {
  uv: `<div class="param-desc">
0–2 (Низкий): защита не требуется.<br>
3–5 (Умеренный): необходима защита (рекомендуется крем с SPF).<br>
6–7 (Высокий): обязательное использование солнцезащитных средств, сокращение времени на солнце.<br>
8–10 (Очень высокий): усиленная защита, лучше избегать солнца с полудня до 16:00.<br>
11+ (Экстремальный): максимальные меры предосторожности, безопаснее оставаться в помещении.</div>`,
  aqi: `<div class="param-desc">
0–50 (Отлично): воздух чистый, риска для здоровья нет.<br>
51–100 (Удовлетворительно): качество приемлемое. Чувствительным людям стоит меньше времени проводить на улице.<br>
101–150 (Вредно для чувствительных групп): дети, пожилые и люди с заболеваниями лёгких/сердца могут чувствовать дискомфорт.<br>
151–200 (Плохой): воздух опасен для всех. Не рекомендуется долгая нагрузка на открытом воздухе.<br>
201–300 (Очень плохой): серьёзное ухудшение. Всем рекомендуется оставаться в помещении.<br>
301–500 (Опасный): экологическая угроза. Выходить на улицу опасно для жизни без средств защиты.</div>`
};
const PARAM_SET_NAME = { uv:"Ультрафиолетовый (УФ) индекс", aqi:"AQI - Индекс качества воздуха" };

const DEFAULT_SETTINGS = {
  config_items: { open_meteo:true, owm:true, yandex:false, dev_out:true, dev_in:true },
  sn_out:"OUT-0001", sn_out_key:"", sn_in:"IN-0001", sn_in_key:"", send_interval_min:5,
  lat: 55.752793, lon: 37.622672, alt_sea: 150, alt_ground: 5,
  units: { temp:"C", pressure:"hPa", wind_spd:"ms", rad:"uSv", co2:"ppm", co:"ppm" },
  temp_round: 1,
  pressure_auto: true,
  pressure_thr: { anom_low:970, low:1000, normal:1025, high:1040, anom_high:1060 },
  tabs: {},
  api_out: {},
  smart_home: { json:false, mqtt:false, rest:false },
  advice: { mode:"sequence", critical_first:true, disabled:{} }
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
/* ============ НАСТРОЙКИ УСТРОЙСТВА ============ */
function openDeviceSettings(which) { alert(t("api_soon")); }

/* ============ ГЛАВНЫЕ НАСТРОЙКИ ============ */
function buildSettingsForm() {
  const s = SETTINGS;
  const soon = t("api_soon");
  const cfgRows = CONFIG_ITEMS.map(it => `
    <div class="cfg-row">
      <label class="set-check"><input type="checkbox" id="cfg_${it.id}" ${s.config_items[it.id]?"checked":""}> ${it.label}</label>
      <button class="set-btn sm" onclick="alert('${soon}')">${t("api_config")}</button>
    </div>`).join("");

  const tabItems = PARAMS.map(p => ({ id:p.key, label:t(p.i18n) }))
    .concat(EXTRA_TABS.map(it => ({ id:it.id, label: it.label || t(it.i18n) })));
  const tabRows = tabItems.map(it =>
    `<label class="set-check"><input type="checkbox" id="tab_${it.id}" ${s.tabs[it.id]!==false?"checked":""}> ${it.label}</label>`).join("");

  document.getElementById("settings-body").innerHTML = `
    <div class="set-section"><h3>${t("set_config")}</h3>${cfgRows}</div>
    <div class="set-section"><h3>${t("set_devices")}</h3>
      <div class="set-row"><label>${t("outdoor")} SN</label><input id="s_sn_out" class="set-input" value="${s.sn_out}"></div>
      <div class="set-row"><label>${t("outdoor")} ${t("set_key")}</label><input id="s_sn_out_key" class="set-input" value="${s.sn_out_key||""}"></div>
      <div class="set-row"><label></label><button class="set-btn sm" type="button" onclick="openDeviceSettings('out')">${t("settings")}</button></div>
      <div class="set-row"><label>${t("indoor")} SN</label><input id="s_sn_in" class="set-input" value="${s.sn_in}"></div>
      <div class="set-row"><label>${t("indoor")} ${t("set_key")}</label><input id="s_sn_in_key" class="set-input" value="${s.sn_in_key||""}"></div>
      <div class="set-row"><label></label><button class="set-btn sm" type="button" onclick="openDeviceSettings('in')">${t("settings")}</button></div>
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
  CONFIG_ITEMS.forEach(it => { s.config_items[it.id] = document.getElementById("cfg_"+it.id).checked; });
  s.sn_out = document.getElementById("s_sn_out").value.trim();
  s.sn_out_key = document.getElementById("s_sn_out_key").value.trim();
  s.sn_in  = document.getElementById("s_sn_in").value.trim();
  s.sn_in_key = document.getElementById("s_sn_in_key").value.trim();
  
  s.lat = parseFloat(document.getElementById("s_lat").value);
  s.lon = parseFloat(document.getElementById("s_lon").value);
  s.alt_sea = parseFloat(document.getElementById("s_alt_sea").value);
  s.alt_ground = parseFloat(document.getElementById("s_alt_ground").value);
  s.tabs = {};
  PARAMS.forEach(p => { s.tabs[p.key] = document.getElementById("tab_"+p.key).checked; });
  EXTRA_TABS.forEach(it => { s.tabs[it.id] = document.getElementById("tab_"+it.id).checked; });
}

function openSettings() { buildSettingsForm(); document.getElementById("settings-modal").classList.add("open"); }
function closeSettings() { document.getElementById("settings-modal").classList.remove("open"); }
async function applySettings() { readSettingsForm(); await saveSettings(); closeSettings(); await loadTimezone(); buildTabs(); refreshDeviceDots(); refreshView(); }

/* ============ ПО-СТРАНИЧНЫЕ НАСТРОЙКИ ============ */
function renderThresholdsInputs() {
  const s = SETTINGS;
  const u = s.units.pressure;
  const auto = s.pressure_auto !== false;
  const eff = effectivePressureThresholds(s);
  const show = v => convertUnit(v, "pressure", u).toFixed(u==="inHg"?2:0);
  const ul = unitLabel("pressure", u);
  const box = document.getElementById("thr-box");
  if (auto) {
    box.innerHTML = `
      <div class="set-hint">${t("thr_auto_hint")} (${(s.alt_sea||0)}м + ${(s.alt_ground||0)}м)</div>
      <div class="set-row"><label>${t("thr_anom_low")}</label><span>${show(eff.anom_low)} ${ul}</span></div>
      <div class="set-row"><label>${t("thr_low")}</label><span>${show(eff.low)} ${ul}</span></div>
      <div class="set-row"><label>${t("thr_normal")}</label><span>${show(eff.normal)} ${ul}</span></div>
      <div class="set-row"><label>${t("thr_high")}</label><span>${show(eff.high)} ${ul}</span></div>
      <div class="set-row"><label>${t("thr_anom_high")}</label><span>${show(eff.anom_high)} ${ul}</span></div>`;
  } else {
    const b = s.pressure_thr;
    box.innerHTML = `
      <div class="set-hint">${t("thr_manual_hint")} (${ul})</div>
      <div class="set-row"><label>${t("thr_anom_low")}</label><input id="thr_al" class="set-input" type="number" value="${show(b.anom_low)}"></div>
      <div class="set-row"><label>${t("thr_low")}</label><input id="thr_l" class="set-input" type="number" value="${show(b.low)}"></div>
      <div class="set-row"><label>${t("thr_normal")}</label><input id="thr_n" class="set-input" type="number" value="${show(b.normal)}"></div>
      <div class="set-row"><label>${t("thr_high")}</label><input id="thr_h" class="set-input" type="number" value="${show(b.high)}"></div>
      <div class="set-row"><label>${t("thr_anom_high")}</label><input id="thr_ah" class="set-input" type="number" value="${show(b.anom_high)}"></div>`;
  }
}

function paramSetName(p) { return PARAM_SET_NAME[p.key] || t(p.i18n); }

function buildParamSettings() {
  const p = PARAMS.find(x => x.key === currentKey);
  const s = SETTINGS;
  const g = PARAM_UNIT_GROUP[p.key];
  const editable = !!g;
  let html = "";
  if (PARAM_INFO[p.key]) {
    html += `<div class="set-section">${PARAM_INFO[p.key]}</div>`;
  } else if (g) {
    html += `<div class="set-section"><div class="set-row"><label>${t("set_unit")}</label>${selHtml("pu_unit", UNITS[g].opts, s.units[g])}</div>`;
    if (p.key === "temp")
      html += `<div class="set-row"><label>${t("set_rounding")}</label>${selHtml("pu_round", [{id:"0",label:t("round_int")},{id:"1",label:t("round_1")}], String(s.temp_round))}</div>`;
    html += `</div>`;
  } else {
    html += `<div class="set-section"><div class="set-row"><label>${t("set_unit")}</label><span>${paramUnitDisplay(p) || t("unit_none")} — ${t("unit_fixed")}</span></div></div>`;
  }
  if (p.key === "pressure") {
    html += `<div class="set-section"><h3>${t("set_pressure_thr")}</h3>
      <label class="set-check"><input type="checkbox" id="thr_auto" ${s.pressure_auto!==false?"checked":""}> ${t("thr_auto")}</label>
      <div id="thr-box"></div></div>`;
  }
  document.getElementById("param-set-title").textContent = t("set_page") + paramSetName(p);
  document.getElementById("param-body").innerHTML = html;
  document.getElementById("param-save").style.display = editable ? "" : "none";
  document.getElementById("param-cancel").textContent = editable ? t("set_cancel") : t("set_close");
  if (p.key === "pressure") {
    renderThresholdsInputs();
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
      const toH = v => { if (u==="mmHg") return v/0.750062; if (u==="inHg") return v/0.0295300; return v; };
      s.pressure_thr = {
        anom_low: toH(parseFloat(document.getElementById("thr_al").value)),
        low:      toH(parseFloat(document.getElementById("thr_l").value)),
        normal:   toH(parseFloat(document.getElementById("thr_n").value)),
        high:     toH(parseFloat(document.getElementById("thr_h").value)),
        anom_high:toH(parseFloat(document.getElementById("thr_ah").value))
      };
    }
  }
  await saveSettings(); closeParamSettings(); renderParam(currentKey);
}

/* ============ API OUT ============ */
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
  document.getElementById("api-body").innerHTML = `<div class="set-hint">${t("api_hint")}</div>${rows}`;
}
async function saveApiOut() {
  const s = SETTINGS;
  API_SERVICES.forEach(svc => { s.api_out[svc.id] = s.api_out[svc.id] || {}; s.api_out[svc.id].enabled = document.getElementById("api_en_"+svc.id).checked; });
  await saveSettings(); alert(t("api_saved"));
}

/* ============ УМНЫЕ СОВЕТЫ ============ */
function buildAdvice() {
  const s = SETTINGS;
  const rows = ADVICE_LIST.map(it => {
    const off = s.advice.disabled[it.id] === true;
    const cls = "adv-row" + (it.crit ? " adv-crit" : "");
    return `<div class="${cls}"><label class="set-check"><input type="checkbox" id="adv_${it.id}" ${off?"":"checked"}> <span>${it.text}</span></label></div>`;
  }).join("");
  document.getElementById("advice-body").innerHTML = `
    <div class="set-hint">${t("advice_soon")}</div>
    <div class="set-section"><h3>${t("adv_output")}</h3>
      <div class="set-row"><label>${t("adv_mode")}</label>
        ${selHtml("adv_mode", [{id:"sequence",label:t("adv_seq")},{id:"marquee",label:t("adv_marquee")}], s.advice.mode)}</div>
      <label class="set-check"><input type="checkbox" id="adv_critfirst" ${s.advice.critical_first?"checked":""}> ${t("adv_crit_first")}</label>
    </div>
    <div class="set-section"><h3>${t("adv_list")}</h3><div class="adv-scroll">${rows}</div></div>`;
}
async function saveAdvice() {
  const s = SETTINGS;
  s.advice.mode = document.getElementById("adv_mode").value;
  s.advice.critical_first = document.getElementById("adv_critfirst").checked;
  s.advice.disabled = {};
  ADVICE_LIST.forEach(it => { const el = document.getElementById("adv_"+it.id); if (el && !el.checked) s.advice.disabled[it.id] = true; });
  await saveSettings(); alert(t("api_saved"));
}

/* ============ УМНЫЙ ДОМ ============ */
function buildSmartHome() {
  const s = SETTINGS;
  const row = (id,label) => `<div class="api-row">
    <span class="api-name">${label}</span>
    <label class="api-toggle"><input type="checkbox" id="sh_${id}" ${s.smart_home[id]?"checked":""}> ${t("api_enable")}</label>
    <button class="set-btn" onclick="alert('${t("api_soon")}')">${t("sh_config")}</button></div>`;
  document.getElementById("smarthome-body").innerHTML = `
    <div class="set-hint">${t("smart_soon")}</div>
    <div class="set-section"><h3>${t("sh_title")}</h3>
      ${row("json", t("sh_json"))}${row("mqtt", t("sh_mqtt"))}${row("rest", t("sh_rest"))}
    </div>`;
}
async function saveSmartHome() {
  const s = SETTINGS;
  ["json","mqtt","rest"].forEach(id => { s.smart_home[id] = document.getElementById("sh_"+id).checked; });
  await saveSettings(); alert(t("api_saved"));
}