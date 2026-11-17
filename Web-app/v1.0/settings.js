/* 
 * Copyright (c) 2026 Минин Сергей Александрович.
 * Licensed under the GNU Affero General Public License v3.0.
 * See LICENSE file in the project root for full license information.
 */
/* AirVisionPro — настройки: главные + по-страничные + вкладки. */

let SETTINGS = null;

const API_SERVICES = [
  { id:"narodmon",        name:"Narodmon.ru" },
  { id:"thingspeak",      name:"ThingSpeak" },
  { id:"sensor_community",name:"Sensor.community" }
];

const CONFIG_ITEMS = [
  { id:"open_meteo",     label:"Open-Meteo" },
  { id:"open_meteo_air", label:"Open-Meteo Air Quality" },
  { id:"owm",            label:"OpenWeatherMap" },
  { id:"dev_out",        label:"Уличное устройство" },
  { id:"dev_in",         label:"Домашнее устройство" },
  { id:"geomag",         label:"Магнитные бури" }
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
  config_items: { open_meteo:true, open_meteo_air:true, owm:true, dev_out:false, dev_in:false, aurora:true },
  sn_out:"", sn_out_key:"", sn_in:"", sn_in_key:"", send_interval_min:5,
  devices: { out:{ map:{}, corr:{} }, in:{ map:{}, corr:{} } },
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
  const sel = options.find(o => o.id === selected) || options[0] || { label:"" };
  const optsHtml = options.map(o =>
    `<div class="avp-opt${o.id===selected?" sel":""}" data-val="${o.id}">${o.label}</div>`).join("");
  const nativeHtml = options.map(o =>
    `<option value="${o.id}" ${o.id===selected?"selected":""}>${o.label}</option>`).join("");
  return `<div class="avp-select">
    <select id="${id}" class="avp-native">${nativeHtml}</select>
    <button type="button" class="avp-select-btn">${sel.label} <span class="avp-caret">▾</span></button>
    <div class="avp-select-list">${optsHtml}</div>
  </div>`;
}
/* ============ НАСТРОЙКИ УСТРОЙСТВА ============ */
function openDeviceSettings(which) { alert(t("api_soon")); }

/* ============ ГЛАВНЫЕ НАСТРОЙКИ ============ */
function buildSettingsForm() {
  const s = SETTINGS;
  const soon = t("api_soon");
  const cfgRows = CONFIG_ITEMS.map(it => {
    let onclickAttr = `alert('${soon}')`;
    if (it.id === "geomag")     onclickAttr = "openSrcGeomag()";
    if (it.id === "open_meteo") onclickAttr = "openSrcOpenmeteo()";
    if (it.id === "open_meteo_air") onclickAttr = "openSrcAirquality()";
    if (it.id === "owm") onclickAttr = "openSrcOwm()";
    if (it.id === "dev_out") onclickAttr = "openSrcDevice('out')";
    if (it.id === "dev_in")  onclickAttr = "openSrcDevice('in')";
    const btn = `<button class="set-btn sm" onclick="${onclickAttr}">${t("api_config")}</button>`;
    /* устройство нельзя включить, пока не введены серийный номер и ключ */
    let dis = "";
    if (it.id === "dev_out" && !(s.sn_out && s.sn_out_key)) dis = "disabled";
    if (it.id === "dev_in"  && !(s.sn_in  && s.sn_in_key))  dis = "disabled";
    const checkedAttr = (s.config_items[it.id] && !dis) ? "checked" : "";
    return `
    <div class="cfg-row">
      <label class="set-check"><input type="checkbox" id="cfg_${it.id}" ${checkedAttr} ${dis}> ${it.label}</label>
      ${btn}
    </div>`;
  }).join("");

  const tabItems = PARAMS.map(p => ({ id:p.key, label:t(p.i18n) }))
    .concat(EXTRA_TABS.filter(it => it.id !== "geomag").map(it => ({ id:it.id, label: it.label || t(it.i18n) })));
  const tabRows = tabItems.map(it =>
    `<label class="set-check"><input type="checkbox" id="tab_${it.id}" ${s.tabs[it.id]!==false?"checked":""}> ${it.label}</label>`).join("");

  document.getElementById("settings-body").innerHTML = `
    <div class="set-section"><h3>${t("set_config")}</h3>${cfgRows}</div>
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
  
  s.lat = parseFloat(document.getElementById("s_lat").value);
  s.lon = parseFloat(document.getElementById("s_lon").value);
  s.alt_sea = parseFloat(document.getElementById("s_alt_sea").value);
  s.alt_ground = parseFloat(document.getElementById("s_alt_ground").value);
  s.tabs = {};
  PARAMS.forEach(p => { s.tabs[p.key] = document.getElementById("tab_"+p.key).checked; });
  EXTRA_TABS.forEach(it => { const el = document.getElementById("tab_"+it.id); if (el) s.tabs[it.id] = el.checked; });
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

/* «AV_Анализ опасности» — блок в окне настроек вкладки «Температура» */
function buildParamSettings() {
  buildParamSettings0();
  addTempDangerBlock();
}
function addTempDangerBlock() {
  const p = PARAMS.find(x => x.key === currentKey);
  if (!p || PARAM_UNIT_GROUP[p.key] !== "temp") return;
  const d = SETTINGS.temp_danger || {};
  const srcOpts = [
    { id:"auto",       label:t("td_auto") },
    { id:"dev",        label:t("td_dev") },
    { id:"open-meteo", label:"Open-Meteo" },
    { id:"owm",        label:"OpenWeatherMap" }
  ];
  const html = `<div class="set-section"><h3>${t("td_title")}</h3>
    <label class="set-check"><input type="checkbox" id="td_on" ${d.on!==false?"checked":""}> ${t("api_enable")}</label>
    <div class="set-row"><label>${t("p_temp")}</label>${selHtml("td_temp", srcOpts, d.temp||"auto")}</div>
    <div class="set-row"><label>${t("p_rh")}</label>${selHtml("td_rh", srcOpts, d.rh||"auto")}</div>
    <div class="set-row"><label>${t("p_wind_spd")}</label>${selHtml("td_wind", srcOpts, d.wind||"auto")}</div>
  </div>`;
  document.getElementById("param-body").insertAdjacentHTML("beforeend", html);
}
function readTempDangerBlock() {
  const on = document.getElementById("td_on");
  if (!on) return;
  SETTINGS.temp_danger = {
    on:   on.checked,
    temp: document.getElementById("td_temp").value,
    rh:   document.getElementById("td_rh").value,
    wind: document.getElementById("td_wind").value
  };
}
function buildParamSettings0() {
  const p = PARAMS.find(x => x.key === currentKey);
  const s = SETTINGS;
  const g = PARAM_UNIT_GROUP[p.key];
  const editable = !!g;
  let html = "";
  if (PARAM_INFO[p.key]) {
    html += `<div class="set-section">${PARAM_INFO[p.key]}</div>`;
  } else if (g) {
    html += `<div class="set-section"><div class="set-row"><label>${t("set_unit")}</label>${selHtml("pu_unit", UNITS[g].opts, s.units[g])}</div>`;
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
  readTempDangerBlock();
  return applyParamSettings0();
}
async function applyParamSettings0() {
  const p = PARAMS.find(x => x.key === currentKey);
  const s = SETTINGS;
  const g = PARAM_UNIT_GROUP[p.key];
  if (g) s.units[g] = document.getElementById("pu_unit").value;
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
/* ===== Кастомные выпадающие списки (неоновый стиль) ===== */
function initCustomSelects(root){
  (root||document).querySelectorAll('.avp-select').forEach(box=>{
    if(box.dataset.ready) return;
    box.dataset.ready = "1";
    const native = box.querySelector('.avp-native');
    const btn  = box.querySelector('.avp-select-btn');
    const list = box.querySelector('.avp-select-list');
    if(!native||!btn||!list) return;
    btn.addEventListener('click', e=>{
      e.stopPropagation();
      document.querySelectorAll('.avp-select-list.open').forEach(l=>{ if(l!==list) l.classList.remove('open'); });
      list.classList.toggle('open');
    });
    list.querySelectorAll('.avp-opt').forEach(opt=>{
      opt.addEventListener('click', ()=>{
        native.value = opt.dataset.val;
        btn.childNodes[0].nodeValue = opt.textContent + " ";
        list.querySelectorAll('.avp-opt').forEach(o=>o.classList.remove('sel'));
        opt.classList.add('sel');
        list.classList.remove('open');
        native.dispatchEvent(new Event('change',{bubbles:true}));
      });
    });
  });
}
document.addEventListener('click', ()=>{
  document.querySelectorAll('.avp-select-list.open').forEach(l=>l.classList.remove('open'));
});
new MutationObserver(()=>initCustomSelects(document)).observe(document.documentElement,{childList:true,subtree:true});
/* ===== Вкладка «Видимость»: множители для пыли и AOD ===== */
function addVisBlock() {
  if (currentKey !== "vis") return;
  const k = SETTINGS.vis_k || {};
  const kd = k.dust > 0 ? k.dust : 100;
  const ka = k.aod > 0 ? k.aod : 1000;
  const html = `<div class="set-section"><h3>${t("vis_title")}</h3>
    <div class="set-row"><label>${t("vis_dust")} (${t("vis_ug")}) ×</label>
      <input id="vis_k_dust" class="set-input" type="number" min="0" step="any" value="${kd}"></div>
    <div class="param-desc">${t("vis_dust_d")}</div>
    <div class="set-row"><label>${t("vis_aod")} ×</label>
      <input id="vis_k_aod" class="set-input" type="number" min="0" step="any" value="${ka}"></div>
    <div class="param-desc">${t("vis_aod_d")}</div>
  </div>`;
  document.getElementById("param-body").insertAdjacentHTML("beforeend", html);
  document.getElementById("param-save").style.display = "";
  document.getElementById("param-cancel").textContent = t("set_cancel");
}
function readVisBlock() {
  const d = document.getElementById("vis_k_dust");
  const a = document.getElementById("vis_k_aod");
  if (!d || !a) return;
  const kd = parseFloat(d.value), ka = parseFloat(a.value);
  SETTINGS.vis_k = { dust: kd > 0 ? kd : 100, aod: ka > 0 ? ka : 1000 };
}
const _buildParamSettingsPrev = buildParamSettings;
buildParamSettings = function () { _buildParamSettingsPrev(); addVisBlock(); };
const _applyParamSettingsPrev = applyParamSettings;
applyParamSettings = async function () { readVisBlock(); return _applyParamSettingsPrev(); };
/* ===== Вкладка «Осадки»: пояснение единиц в настройках ===== */
function prT(key, ru) {
  const v = t(key);
  return (!v || v === key) ? ru : v;
}
function addPrecipBlock() {
  if (currentKey === "precip") document.getElementById("param-body").innerHTML = "";
  addPrecipBlock0();
}
function addPrecipBlock0() {
  if (currentKey !== "precip") return;
  const html = `<div class="set-section"><h3>${prT("pr_title", "Осадки (% / мм)")}</h3>
    <div class="param-desc">${prT("pr_cloud", "Облачность в 0-100%")}</div>
    <div class="param-desc">${prT("pr_rain", "Осадки в мм")}</div>
  </div>`;
  document.getElementById("param-body").insertAdjacentHTML("beforeend", html);
}
const _buildParamSettingsPrevPrecip = buildParamSettings;
buildParamSettings = function () { _buildParamSettingsPrevPrecip(); addPrecipBlock(); };
/* Вкладка «Видимость»: убираем лишнюю строку «Единица — фиксированная» */
const _buildParamSettingsPrevVis2 = buildParamSettings;
buildParamSettings = function () {
  _buildParamSettingsPrevVis2();
  if (currentKey === "vis") {
    const first = document.querySelector("#param-body .set-section");
    if (first) first.remove();
  }
};
/* Давление: пороги в окне настроек — сверху вниз, как на графике */
const _renderThresholdsInputsPrev = renderThresholdsInputs;
renderThresholdsInputs = function () {
  _renderThresholdsInputsPrev();
  const box = document.getElementById("thr-box");
  if (!box) return;
  const rows = Array.from(box.querySelectorAll(".set-row")).reverse();
  rows.forEach(r => box.appendChild(r));
};
/* ===== Давление: защита порогов (авто / ручной ввод) ===== */
function pressureSea() { return DEFAULT_SETTINGS.pressure_thr; }
function pressureSeaCopy() { return JSON.parse(JSON.stringify(DEFAULT_SETTINGS.pressure_thr)); }
function pressureThrBroken(thr) {
  if (!thr) return true;
  return Object.keys(pressureSea()).some(k => !isFinite(parseFloat(thr[k])));
}
function pressureThrIsSea(thr) {
  const d = pressureSea();
  return !!thr && Object.keys(d).every(k => Number(thr[k]) === d[k]);
}
/* расчётные пороги для места пользователя */
function pressureThrForPlace() {
  return effectivePressureThresholds({ ...SETTINGS, pressure_auto: true, pressure_thr: pressureSea() });
}

/* 1) Что показывать в окне настроек давления */
const _renderThrPrevSafe = renderThresholdsInputs;
renderThresholdsInputs = function () {
  const s = SETTINGS;
  if (pressureThrBroken(s.pressure_thr)) s.pressure_thr = pressureSeaCopy();
  const orig = s.pressure_thr;
  if (s.pressure_auto !== false) {
    s.pressure_thr = pressureSea();
  } else if (pressureThrIsSea(orig)) {
    s.pressure_thr = pressureThrForPlace();
  }
  try { _renderThrPrevSafe(); } finally { s.pressure_thr = orig; }
};

/* 2) При сохранении: пустые поля заполняются расчётом, при «авто» базой остаются уровни моря */
const _applyParamSettingsPrevThr = applyParamSettings;
applyParamSettings = async function () {
  if (currentKey === "pressure") {
    const auto = document.getElementById("thr_auto");
    if (auto && auto.checked) {
      SETTINGS.pressure_thr = pressureSeaCopy();
    } else if (auto) {
      const u = SETTINGS.units.pressure;
      const eff = pressureThrForPlace();
      const ids = { thr_al: "anom_low", thr_l: "low", thr_n: "normal", thr_h: "high", thr_ah: "anom_high" };
      Object.keys(ids).forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (!isFinite(parseFloat(el.value))) {
          el.value = convertUnit(eff[ids[id]], "pressure", u).toFixed(u === "inHg" ? 2 : 0);
        }
      });
    }
  }
  return _applyParamSettingsPrevThr();
};
/* Давление: порядок порогов в настройках — как на графике, сверху вниз */
const _renderThrPrevOrder = renderThresholdsInputs;
renderThresholdsInputs = function () {
  _renderThrPrevOrder();
  const box = document.getElementById("thr-box");
  if (!box) return;
  const order = ["thr_anom_high", "thr_high", "thr_normal", "thr_low", "thr_anom_low"].map(k => t(k));
  const rank = r => {
    const l = r.querySelector("label");
    const i = l ? order.indexOf(l.textContent.trim()) : -1;
    return i < 0 ? 99 : i;
  };
  Array.from(box.querySelectorAll(".set-row"))
    .sort((a, b) => rank(a) - rank(b))
    .forEach(r => box.appendChild(r));
};
/* ===== Температура: пороги опасности в окне шестерёнки (авто / свои) ===== */
const TT_STD = { cold: [-28, -40, -48], heat: [27, 32, 41, 54] };
const TT_IDS = ["tt_h4", "tt_h3", "tt_h2", "tt_h1", "tt_c1", "tt_c2", "tt_c3"];
const TT_NAMES = ["Жара — уровень 4", "Жара — уровень 3", "Жара — уровень 2", "Жара — уровень 1",
                  "Холод — уровень 1", "Холод — уровень 2", "Холод — уровень 3"];
function ttStdList() {
  return [TT_STD.heat[3], TT_STD.heat[2], TT_STD.heat[1], TT_STD.heat[0],
          TT_STD.cold[0], TT_STD.cold[1], TT_STD.cold[2]];
}
function ttValid(l) {
  return l.length === 7 && l.every(v => isFinite(v) && v !== 0) && l.every((v, i) => i === 0 || l[i - 1] > v);
}
function ttManualList() {
  const t = SETTINGS.temp_thr;
  if (t && t.heat && t.cold) {
    const l = [t.heat[3], t.heat[2], t.heat[1], t.heat[0], t.cold[0], t.cold[1], t.cold[2]].map(Number);
    if (ttValid(l)) return l;
  }
  return ttStdList();
}
function ttToC(v, u) { return u === "F" ? (v - 32) * 5 / 9 : v; }
function ttShow(v, u) { return Math.round(convertUnit(v, "temp", u) * 10) / 10; }

function addTempThrBlock() {
  if (PARAM_UNIT_GROUP[currentKey] !== "temp") return;
  let shown = SETTINGS.units.temp;
  const auto = SETTINGS.temp_thr_auto !== false;
  const list = auto ? ttStdList() : ttManualList();
  const rows = TT_IDS.map((id, i) =>
    `<div class="set-row"><label>${prT(id, TT_NAMES[i])}</label>
     <input id="${id}" class="set-input" type="number" step="1" value="${ttShow(list[i], shown)}" ${auto ? "disabled" : ""}></div>`
  ).join("");
  document.getElementById("param-body").insertAdjacentHTML("beforeend",
    `<div class="set-section"><h3>${prT("tt_title", "Пороги опасности")}</h3>
     <label class="set-check"><input type="checkbox" id="tt_auto" ${auto ? "checked" : ""}> ${prT("tt_auto", "Авторасчёт")}</label>
     ${rows}</div>`);
  document.getElementById("tt_auto").addEventListener("change", e => {
    const on = e.target.checked;
    const l = on ? ttStdList() : ttManualList();
    TT_IDS.forEach((id, i) => {
      const el = document.getElementById(id);
      el.disabled = on;
      el.value = ttShow(l[i], shown);
    });
  });
  const uSel = document.getElementById("pu_unit");
  if (uSel) uSel.addEventListener("change", () => {
    const nu = uSel.value;
    TT_IDS.forEach(id => {
      const el = document.getElementById(id);
      const v = parseFloat(el.value);
      if (isFinite(v)) el.value = ttShow(ttToC(v, shown), nu);
    });
    shown = nu;
  });
}
function ttReadBlock() {
  const autoEl = document.getElementById("tt_auto");
  if (!autoEl) return;
  SETTINGS.temp_thr_auto = autoEl.checked;
  if (autoEl.checked) return;
  const uEl = document.getElementById("pu_unit");
  const u = uEl ? uEl.value : SETTINGS.units.temp;
  const std = ttStdList();
  let list = TT_IDS.map((id, i) => {
    const v = parseFloat(document.getElementById(id).value);
    return (isFinite(v) && v !== 0) ? Math.round(ttToC(v, u) * 100) / 100 : std[i];
  });
  if (!ttValid(list)) list = std;
  SETTINGS.temp_thr = { heat: [list[3], list[2], list[1], list[0]], cold: [list[4], list[5], list[6]] };
}
const _buildParamSettingsPrevTT = buildParamSettings;
buildParamSettings = function () { _buildParamSettingsPrevTT(); addTempThrBlock(); };
const _applyParamSettingsPrevTT = applyParamSettings;
applyParamSettings = async function () {
  if (PARAM_UNIT_GROUP[currentKey] === "temp") ttReadBlock();
  return _applyParamSettingsPrevTT();
};
/* Раздел «AV_Анализ опасности» переименован в «AV_Ощущается как» */
const _buildParamSettingsPrevRename = buildParamSettings;
buildParamSettings = function () {
  _buildParamSettingsPrevRename();
  const old = t("td_title").trim();
  document.querySelectorAll("#param-body h3").forEach(h => {
    if (h.textContent.trim() === old) h.textContent = "AV_" + t("td_feels");
  });
};
/* Температура: в окне настроек в режиме «авто» показываются текущие расчётные значения для этой точки */
function ttStdList() {
  return (typeof tdDangerNowList === "function") ? tdDangerNowList() : [54, 41, 32, 27, -28, -40, -48];
}
/* ===== Газы: автоиндикатор опасности в окне настроек вещества ===== */
const GAS_INFO = {
  co2:  { d: "ok",     w: "down" },
  co:   { d: "ok",     w: "mix"  },
  nh3:  { d: "ok",     w: "up"   },
  so2:  { d: "danger", w: "down" },
  no:   { d: "danger", w: "mix"  },
  o3:   { d: "bad",    w: "down" },
  hcho: { d: "bad",    w: "mix"  },
  no2:  { d: "bad",    w: "down" }
};
/* пороги в мкг/м³ (CO₂ — ppm); s = СанПиН, w = ВОЗ (null = у ВОЗ нет значения) */
const GAS_NORMS = {
  co:   { home: { s: 3000, w: 4000 },  street: { s: 5000, w: 35000 } },
  no2:  { home: { s: 100,  w: 25 },    street: { s: 200,  w: 200 } },
  no:   { home: { s: 60,   w: null },  street: { s: 400,  w: null } },
  so2:  { home: { s: 50,   w: 40 },    street: { s: 500,  w: 500 } },
  o3:   { home: { s: 30,   w: 100 },   street: { s: 160,  w: null } },
  nh3:  { home: { s: 40,   w: null },  street: { s: 200,  w: null } },
  hcho: { home: { s: 10,   w: null },  street: { s: 50,   w: 100 } },
  co2:  { home: { s: 1000, w: null },  street: { s: 1000, w: null } }
};
function gT(k, ru) { return prT("gas_" + k, ru); }
function gasCfg() {
  const g = SETTINGS.gas || {};
  return { on: g.on !== false, norm: g.norm || "strict", mode: g.mode || "home", thr: g.thr || {} };
}
function gasDefault(key, norm, mode) {
  const e = GAS_NORMS[key][mode];
  if (norm === "sanpin") return e.s;
  if (norm === "who") return e.w != null ? e.w : e.s;
  return e.w != null ? Math.min(e.s, e.w) : e.s;
}
function gasFmt(v) { return String(+Number(v).toPrecision(4)); }
function gasUnitId(key) {
  const g = PARAM_UNIT_GROUP[key];
  const el = document.getElementById("pu_unit");
  return el ? el.value : (g ? SETTINGS.units[g] : "");
}
function gasFactor(key, unitId) {
  const g = PARAM_UNIT_GROUP[key];
  if (g) { const f = convertUnit(1, g, unitId); return (isFinite(f) && f > 0) ? f : 1; }
  const p = PARAMS.find(x => x.key === key);
  return /мг/.test(paramUnitDisplay(p) || "") ? 0.001 : 1;
}
function gasLabel(key) {
  const g = PARAM_UNIT_GROUP[key];
  if (g) return unitLabel(g, gasUnitId(key));
  return paramUnitDisplay(PARAMS.find(x => x.key === key)) || "";
}
function gasRefresh(key, reset) {
  const norm = document.getElementById("gas_norm").value;
  const mode = document.querySelector('input[name="gas_mode"]:checked').value;
  document.getElementById("gas_desc").textContent = mode === "home"
    ? gT("m_home_d", "Люди рядом постоянно. Пороги строгие, по среднесуточным нормам.")
    : gT("m_street_d", "Человек рядом недолго, 20–30 минут. Пороги мягче, по максимально разовым нормам.");
  document.getElementById("gas_nowho").textContent =
    (norm === "who" && GAS_NORMS[key][mode].w == null) ? gT("nowho", "нет в нормах ВОЗ") : "";
  document.getElementById("gas_unit").textContent = gasLabel(key);
  if (reset) document.getElementById("gas_thr").value =
    gasFmt(gasDefault(key, norm, mode) * gasFactor(key, gasUnitId(key)));
  const on = document.getElementById("gas_on").checked;
  const ctl = document.getElementById("gas_ctl");
  ctl.style.opacity = on ? "1" : "0.4";
  ctl.style.pointerEvents = on ? "" : "none";
  document.getElementById("gas_thr").disabled = !on;
}
function addGasBlock() {
  const key = currentKey;
  const info = GAS_INFO[key];
  if (!info) return;
  const c = gasCfg();
  const normOpts = [
    { id: "strict", label: gT("n_strict", "Самый строгий") },
    { id: "sanpin", label: "СанПиН" },
    { id: "who",    label: gT("n_who", "ВОЗ") }
  ];
  const dText = { ok: gT("d_ok", "Кратковременное превышение допустимо"),
                  danger: gT("d_danger", "Кратковременное превышение опасно"),
                  bad: gT("d_bad", "Кратковременное превышение не допустимо") }[info.d];
  const dColor = { ok: "var(--warn)", danger: "#ff9d4d", bad: "var(--error)" }[info.d];
  const wText = { down: gT("w_down", "Оседает вниз"),
                  mix: gT("w_mix", "Растворяется в воздухе"),
                  up: gT("w_up", "Улетучивается вверх") }[info.w];
  const custom = Number(c.thr[key]);
  const baseV = custom > 0 ? custom : gasDefault(key, c.norm, c.mode);
  const html = `<div class="set-section"><h3>${gT("title", "Автоиндикатор опасности")}</h3>
    <label class="set-check"><input type="checkbox" id="gas_on" ${c.on ? "checked" : ""}> ${gT("on", "Включить автоиндикатор")}</label>
    <div id="gas_ctl">
      <div class="set-row"><label>${gT("norm", "Норматив")}</label>${selHtml("gas_norm", normOpts, c.norm)}</div>
      <div class="set-row"><label>${gT("mode", "Режим")}</label>
        <div style="display:flex;gap:16px;">
          <label class="set-check" style="margin:0"><input type="radio" name="gas_mode" id="gas_m_home" value="home" ${c.mode === "home" ? "checked" : ""}> ${gT("m_home", "Офис / Дом")}</label>
          <label class="set-check" style="margin:0"><input type="radio" name="gas_mode" id="gas_m_street" value="street" ${c.mode === "street" ? "checked" : ""}> ${gT("m_street", "Улица")}</label>
        </div></div>
      <div class="param-desc" id="gas_desc" style="margin-bottom:8px;"></div>
      <div class="set-row"><label>${gT("thr", "Порог")}, <span id="gas_unit"></span></label>
        <input id="gas_thr" class="set-input" type="number" step="any" min="0"></div>
      <div class="set-hint" id="gas_nowho" style="margin:0 0 6px;"></div>
    </div>
    <div class="param-desc" style="color:${dColor};font-weight:600;margin-top:6px;">${dText}</div>
    <div class="param-desc" style="margin-top:6px;">${wText}</div>
  </div>`;
  document.getElementById("param-body").insertAdjacentHTML("beforeend", html);
  document.getElementById("param-save").style.display = "";
  document.getElementById("param-cancel").textContent = t("set_cancel");
  document.getElementById("gas_thr").value = gasFmt(baseV * gasFactor(key, gasUnitId(key)));
  gasRefresh(key, false);
  let shownU = gasUnitId(key);
  document.getElementById("gas_on").addEventListener("change", () => gasRefresh(key, false));
  document.getElementById("gas_norm").addEventListener("change", () => gasRefresh(key, true));
  document.querySelectorAll('input[name="gas_mode"]').forEach(r =>
    r.addEventListener("change", () => gasRefresh(key, true)));
  const uSel = document.getElementById("pu_unit");
  if (uSel) uSel.addEventListener("change", () => {
    const nu = gasUnitId(key);
    const el = document.getElementById("gas_thr");
    const v = parseFloat(el.value);
    if (isFinite(v)) el.value = gasFmt(v / gasFactor(key, shownU) * gasFactor(key, nu));
    shownU = nu;
    document.getElementById("gas_unit").textContent = gasLabel(key);
  });
}
function gasRead() {
  const key = currentKey;
  const onEl = document.getElementById("gas_on");
  if (!onEl || !GAS_INFO[key]) return;
  const norm = document.getElementById("gas_norm").value;
  const mode = document.querySelector('input[name="gas_mode"]:checked').value;
  const def = gasDefault(key, norm, mode);
  const v = parseFloat(document.getElementById("gas_thr").value);
  let base = (isFinite(v) && v > 0) ? v / gasFactor(key, gasUnitId(key)) : def;
  const old = (SETTINGS.gas && SETTINGS.gas.thr) ? SETTINGS.gas.thr : {};
  const thr = Object.assign({}, old);
  if (Math.abs(base - def) <= def * 0.01) delete thr[key]; else thr[key] = base;
  SETTINGS.gas = { on: onEl.checked, norm: norm, mode: mode, thr: thr };
}
const _buildParamSettingsPrevGas = buildParamSettings;
buildParamSettings = function () { _buildParamSettingsPrevGas(); addGasBlock(); };
const _applyParamSettingsPrevGas = applyParamSettings;
applyParamSettings = async function () { gasRead(); return _applyParamSettingsPrevGas(); };
/* Газы: множитель порога строго по правилу «в базе мкг/м³, CO₂ — ppm» */
gasFactor = function (key, unitId) {
  const g = PARAM_UNIT_GROUP[key];
  if (g) { const f = convertUnit(1, g, unitId); return (isFinite(f) && f > 0) ? f : 1; }
  return 1;
};
/* ВОЗ: формальдегид 100 мкг/м³ за 30 минут — норма для помещений, годится для обоих режимов */
GAS_NORMS.hcho.home.w = 100;
/* Газы: поправки по сверке с СанПиН (суточные нормы вместо среднегодовых) */
GAS_NORMS.nh3.home.s = 100;
GAS_NORMS.o3.home.s = 100;
/* ===== Вкладка AQI (шестерёнка): галка и источник для каждой величины ===== */
const AQI_ROWS2 = [
  { k: "pm25", n: "PM2.5" },
  { k: "pm10", n: "PM10" },
  { k: "o3",   n: "O₃" },
  { k: "co",   n: "CO" },
  { k: "so2",  n: "SO₂" },
  { k: "no2",  n: "NO₂" }
];
function aqiWhy2(who, st) {
  const dev = (who === "dev");
  if (st === "source_off") return dev
    ? prT("aqi_r_dev_off", "устройство выключено или не введены серийный номер и ключ")
    : prT("aqi_r_web_off", "источник Air Quality выключен");
  if (st === "no_param") return dev
    ? prT("aqi_r_dev_np", "устройство не присылает этот параметр или он стоит «Не показывать»")
    : prT("aqi_r_web_np", "в окне Air Quality этот параметр стоит «Не показывать»");
  if (st === "no_data") return dev
    ? prT("aqi_r_dev_nd", "от устройства нет данных за этот период")
    : prT("aqi_r_web_nd", "от Air Quality нет данных за этот период");
  return "";
}
function aqiNote2(k) {
  const S = (typeof AQI_STATUS !== "undefined") ? AQI_STATUS : null;
  if (!S || !S.items || !S.items[k]) return "";
  const st = S.items[k];
  if (st.dev === "ok")
    return `<div class="param-desc" style="color:#37d67a;margin:2px 0 8px;">✓ ${prT("aqi_u_dev", "берётся с уличного устройства")}</div>`;
  if (st.web === "ok")
    return `<div class="param-desc" style="color:#37d67a;margin:2px 0 8px;">✓ ${prT("aqi_u_web", "берётся из интернета (Air Quality)")}</div>`;
  const isPM = (k === "pm25" || k === "pm10");
  let text = [aqiWhy2("dev", st.dev), aqiWhy2("web", st.web)].filter(Boolean).join("; ");
  if (!text) text = prT("aqi_r_none", "нет данных");
  if (!isPM) text += " — " + prT("aqi_opt", "линия строится и без неё");
  return `<div class="param-desc" style="color:${isPM ? "var(--error)" : "var(--warn)"};margin:2px 0 8px;">✕ ${text}</div>`;
}
function aqiBlockBuild2() {
  if (currentKey !== "aqi") return;
  const c = SETTINGS.aqi || {};
  const on = c.on !== false;
  const opts = [
    { id: "auto",           label: prT("td_auto", "Авто") },
    { id: "dev",            label: prT("td_dev", "Уличное устройство") },
    { id: "open-meteo-air", label: "Open-Meteo Air Quality" }
  ];
  const S = (typeof AQI_STATUS !== "undefined") ? AQI_STATUS : null;
  let fail = "";
  if (on && S && S.items && !S.ok)
    fail = `<div class="param-desc" style="color:var(--error);font-weight:600;">${prT("aqi_fail", "График не строится: нужны данные PM2.5 или PM10")}</div>`;
  const rows = AQI_ROWS2.map(r => {
    const cur = (c[r.k] === "dev" || c[r.k] === "open-meteo-air") ? c[r.k] : "auto";
    return `<div class="set-row"><label>${r.n}</label>${selHtml("aqi_src_" + r.k, opts, cur)}</div>${on ? aqiNote2(r.k) : ""}`;
  }).join("");
  const html = `<div class="set-section"><h3>AV_AQI</h3>
    <label class="set-check"><input type="checkbox" id="aqi_on" ${on ? "checked" : ""}> ${prT("aqi_on", "Показывать линию AV_AQI")}</label>
    ${fail}${rows}
  </div>`;
  document.getElementById("param-body").insertAdjacentHTML("beforeend", html);
  document.getElementById("param-save").style.display = "";
  document.getElementById("param-cancel").textContent = t("set_cancel");
}
function aqiBlockRead2() {
  const onEl = document.getElementById("aqi_on");
  if (!onEl) return;
  const o = { on: onEl.checked };
  AQI_ROWS2.forEach(r => {
    const el = document.getElementById("aqi_src_" + r.k);
    o[r.k] = el ? el.value : "auto";
  });
  SETTINGS.aqi = o;
}
const _bpsAqi2 = buildParamSettings;
buildParamSettings = function () { _bpsAqi2(); aqiBlockBuild2(); };
const _apsAqi2 = applyParamSettings;
applyParamSettings = async function () { aqiBlockRead2(); return _apsAqi2(); };
/* Умные советы: пункты с цветом (AQI) красятся в свой цвет */
const _buildAdvicePrevColor = buildAdvice;
buildAdvice = function () {
  _buildAdvicePrevColor();
  ADVICE_LIST.forEach(it => {
    if (!it.color) return;
    const box = document.getElementById("adv_" + it.id);
    if (!box) return;
    const row = box.closest("label");
    const span = row ? row.querySelector("span") : null;
    if (span) { span.style.color = it.color; span.style.fontWeight = "600"; }
  });
};
/* ===== Осадки: множитель ×N в окне шестерёнки (по образцу «Видимость») ===== */
addPrecipBlock0 = function () {
  if (currentKey !== "precip") return;
  const k = Number(SETTINGS.precip_k);
  const kv = k > 0 ? k : 100;
  const html = `<div class="set-section"><h3>${prT("pr_title", "Осадки (% / мм)")}</h3>
    <div class="param-desc">${prT("pr_cloud", "Облачность в 0-100%")}</div>
    <div class="param-desc">${prT("pr_rain", "Осадки в мм")}</div>
    <div class="set-row"><label>${prT("pr_k", "Осадки (мм)")} ×</label>
      <input id="precip_k" class="set-input" type="number" min="0" step="any" value="${kv}"></div>
    <div class="param-desc">${prT("pr_k_d", "Осадки в мм очень малы (0,2 мм за 15 минут), поэтому линия умножается на это число, чтобы быть видной рядом с облачностью. В подсказке на графике показываются настоящие мм.")}</div>
  </div>`;
  document.getElementById("param-body").insertAdjacentHTML("beforeend", html);
  document.getElementById("param-save").style.display = "";
  document.getElementById("param-cancel").textContent = t("set_cancel");
};
function readPrecipBlock() {
  const el = document.getElementById("precip_k");
  if (!el) return;
  const v = parseFloat(el.value);
  SETTINGS.precip_k = v > 0 ? v : 100;
}
const _applyParamSettingsPrevPrecip = applyParamSettings;
applyParamSettings = async function () { readPrecipBlock(); return _applyParamSettingsPrevPrecip(); };
/* ===== Умные советы: порядок как в файле, галка сортировки, режим вывода и скорость числом ===== */
function adviceOrdered() {
  return ADVICE_LIST.slice().sort((a, b) => parseInt(a.id.slice(1), 10) - parseInt(b.id.slice(1), 10));
}
buildAdvice = function () {
  const s = SETTINGS;
  const rows = adviceOrdered().map(it => {
    const off = s.advice.disabled[it.id] === true;
    const cls = "adv-row" + (it.crit ? " adv-crit" : "");
    const st = it.color ? ` style="color:${it.color};font-weight:600"` : "";
    return `<div class="${cls}"><label class="set-check"><input type="checkbox" id="adv_${it.id}" ${off ? "" : "checked"}> <span${st}>${it.text}</span></label></div>`;
  }).join("");
  const modeOpts = [{ id: "sequence", label: t("adv_seq") }, { id: "marquee", label: t("adv_marquee") }];
  const sp = Number(s.advice.speed);
  const spv = (sp >= 1 && sp <= 10) ? sp : 5;
  document.getElementById("advice-body").innerHTML = `
    <div class="set-hint">${t("advice_soon")}</div>
    <div class="set-section"><h3>${t("adv_output")}</h3>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;">
        <label class="set-check" style="margin:0"><input type="checkbox" id="adv_critfirst" ${s.advice.critical_first !== false ? "checked" : ""}> ${prT("adv_sort", "Сортировка вывода по важности")}</label>
        <div style="display:flex;gap:10px;align-items:center;">
          ${selHtml("adv_mode", modeOpts, s.advice.mode || "sequence")}
          <label style="display:flex;gap:6px;align-items:center;font-size:13px;color:var(--text-dim);white-space:nowrap;">${prT("adv_speed", "Скорость (1–10)")}
            <input id="adv_speed" class="set-input" type="number" min="1" max="10" step="1" value="${spv}" style="width:64px;"></label>
        </div>
      </div>
    </div>
    <div class="set-section"><h3>${t("adv_list")}</h3><div class="adv-scroll">${rows}</div></div>`;
};
saveAdvice = async function () {
  const s = SETTINGS;
  const cf = document.getElementById("adv_critfirst");
  if (cf) s.advice.critical_first = cf.checked;
  const m = document.getElementById("adv_mode");
  if (m) s.advice.mode = m.value;
  const sp = document.getElementById("adv_speed");
  if (sp) {
    const v = Math.round(parseFloat(sp.value));
    s.advice.speed = (v >= 1 && v <= 10) ? v : 5;
  }
  s.advice.disabled = {};
  ADVICE_LIST.forEach(it => {
    const el = document.getElementById("adv_" + it.id);
    if (el && !el.checked) s.advice.disabled[it.id] = true;
  });
  await saveSettings();
  alert(t("api_saved"));
};
/* ===== Умные советы: кнопка «Настройка» и 6 цветов важности ===== */
const ADV_LEVELS = [
  { id: 0, color: "",        name: "Белый" },
  { id: 1, color: "#ffcf4d", name: "Жёлтый" },
  { id: 2, color: "#ff9d4d", name: "Оранжевый" },
  { id: 3, color: "#ff4d4d", name: "Красный" },
  { id: 4, color: "#d62839", name: "Тёмно-красный" },
  { id: 5, color: "#a4133c", name: "Бордовый" }
];
function advLevelDefault(it) {
  if (it.id === "a63" || it.id === "a64") return 2;
  const m = { "#ffcf4d": 1, "#ff9d4d": 2, "#ff4d4d": 3, "#d62839": 4, "#a4133c": 5 };
  if (it.color && m[it.color] != null) return m[it.color];
  return it.crit ? 3 : 0;
}
function advLevel(it) {
  const lv = (SETTINGS.advice && SETTINGS.advice.levels) || {};
  const v = lv[it.id];
  return (Number.isInteger(v) && v >= 0 && v <= 5) ? v : advLevelDefault(it);
}
function advPaint(it) {
  const sp = document.getElementById("advt_" + it.id);
  if (!sp) return;
  const l = advLevel(it);
  sp.style.color = ADV_LEVELS[l].color || "var(--text)";
  sp.style.fontWeight = l ? "600" : "400";
}
function advOpenLevel(id) {
  const it = ADVICE_LIST.find(x => x.id === id);
  if (!it) return;
  let m = document.getElementById("adv-level-modal");
  if (!m) {
    m = document.createElement("div");
    m.className = "modal";
    m.id = "adv-level-modal";
    document.body.appendChild(m);
  }
  const cur = advLevel(it);
  const rows = ADV_LEVELS.map(l =>
    `<label class="set-check" style="margin-bottom:10px"><input type="radio" name="adv_lv" value="${l.id}" ${l.id === cur ? "checked" : ""}>
     <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${l.color || "var(--text)"};margin:0 6px 0 2px"></span>${prT("adv_lv" + l.id, l.name)}</label>`
  ).join("");
  m.innerHTML = `<div class="modal-card">
    <div class="modal-head"><h2>${prT("adv_cfg", "Настройка совета")}</h2>
      <button class="icon-btn" id="adv-lv-x">✕</button></div>
    <div class="modal-body">
      <div class="param-desc" style="margin-bottom:12px">${it.text}</div>
      <div class="set-hint">${prT("adv_cfg_hint", "Цвет означает важность: чем темнее, тем опаснее.")}</div>
      ${rows}
    </div>
    <div class="modal-foot">
      <button class="set-btn" id="adv-lv-cancel">${t("set_cancel")}</button>
      <button class="set-btn" id="adv-lv-ok">${prT("adv_apply", "Применить")}</button>
    </div></div>`;
  const close = () => m.classList.remove("open");
  document.getElementById("adv-lv-x").onclick = close;
  document.getElementById("adv-lv-cancel").onclick = close;
  document.getElementById("adv-lv-ok").onclick = () => {
    const r = m.querySelector('input[name="adv_lv"]:checked');
    if (r) {
      SETTINGS.advice.levels = SETTINGS.advice.levels || {};
      SETTINGS.advice.levels[id] = parseInt(r.value, 10);
      advPaint(it);
    }
    close();
  };
  m.classList.add("open");
}
const _buildAdvicePrevLv = buildAdvice;
buildAdvice = function () {
  _buildAdvicePrevLv();
  ADVICE_LIST.forEach(it => {
    const box = document.getElementById("adv_" + it.id);
    if (!box) return;
    const lab = box.closest("label");
    const row = lab.parentElement;
    const span = lab.querySelector("span");
    span.id = "advt_" + it.id;
    advPaint(it);
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.justifyContent = "space-between";
    row.style.gap = "10px";
    lab.style.flex = "1";
    const b = document.createElement("button");
    b.type = "button";
    b.className = "set-btn sm";
    b.dataset.adv = it.id;
    b.style.flex = "0 0 auto";
    b.textContent = prT("adv_cfg_btn", "Настройка");
    row.appendChild(b);
  });
  document.getElementById("advice-body").onclick = e => {
    const b = e.target.closest("[data-adv]");
    if (b) advOpenLevel(b.dataset.adv);
  };
};
const _saveAdvicePrevLv = saveAdvice;
saveAdvice = async function () {
  const lv = (SETTINGS.advice && SETTINGS.advice.levels) || {};
  const clean = {};
  ADVICE_LIST.forEach(it => {
    const v = lv[it.id];
    if (Number.isInteger(v) && v >= 0 && v <= 5 && v !== advLevelDefault(it)) clean[it.id] = v;
  });
  SETTINGS.advice.levels = clean;
  return _saveAdvicePrevLv();
};
/* ===== Умные советы: серый цвет у советов без алгоритма вывода ===== */
/* Сюда вносим номера советов, для которых уже написано условие срабатывания, например "a43". */
const ADVICE_READY = [];

advPaint = function (it) {
  const sp = document.getElementById("advt_" + it.id);
  if (!sp) return;
  if (ADVICE_READY.indexOf(it.id) < 0) {
    sp.style.color = "#8a93a6";
    sp.style.fontWeight = "400";
    sp.title = prT("adv_noalgo", "Нет алгоритма вывода");
    return;
  }
  sp.title = "";
  const l = advLevel(it);
  sp.style.color = ADV_LEVELS[l].color || "var(--text)";
  sp.style.fontWeight = l ? "600" : "400";
};
/* ===== Ветер: описание 6 градаций в окне настроек вкладки ===== */
const _buildParamSettingsPrevWind = buildParamSettings;
buildParamSettings = function () {
  _buildParamSettingsPrevWind();
  if (currentKey !== "wind_spd") return;
  const rows = [
    { n: prT("wnd_g1", "Штиль"),      r: "0 – 1,5",    c: "" },
    { n: prT("wnd_g2", "Лёгкий"),     r: "1,6 – 5,4",  c: "" },
    { n: prT("wnd_g3", "Умеренный"),  r: "5,5 – 7,9",  c: "" },
    { n: prT("wnd_g4", "Свежий"),     r: "8,0 – 10,7", c: "" },
    { n: prT("wnd_g5", "Сильный"),    r: "10,8 – 17,1", c: "#ff9d4d" },
    { n: prT("wnd_g6", "Штормовой"),  r: prT("wnd_from", "от") + " 17,2", c: "#d62839" }
  ];
  const tr = rows.map(it =>
    '<tr><td style="padding:3px 10px 3px 0;">' +
    (it.c ? '<span style="color:' + it.c + ';">■</span> ' : '') + it.n +
    '</td><td style="padding:3px 0;text-align:right;white-space:nowrap;">' + it.r + '</td></tr>'
  ).join("");
  const html = '<div class="set-section"><h3>' + prT("wnd_title", "Градации скорости ветра") +
    ', ' + prT("wnd_unit", "м/с") + '</h3>' +
    '<table style="width:100%;border-collapse:collapse;">' + tr + '</table>' +
    '<div class="param-desc" style="margin-top:8px;">' +
    prT("wnd_note", "Пунктиры на графике: оранжевый — 10,8 м/с, тёмно-красный — 17,2 м/с.") +
    '</div></div>';
  document.getElementById("param-body").insertAdjacentHTML("beforeend", html);
};
/* ===== Освещённость: автоиндикатор в окне настроек вкладки ===== */
function luxCfg() {
  const c = SETTINGS.lux || {};
  const h = Number(c.thr_home), s = Number(c.thr_street);
  return {
    on: c.on === true,
    src_in: c.src_in || "auto",
    src_out: c.src_out || "auto",
    thr_home: h > 0 ? h : 50,
    thr_street: s > 0 ? s : 400
  };
}
function luxRefresh() {
  const on = document.getElementById("lux_on").checked;
  const ctl = document.getElementById("lux_ctl");
  ctl.style.opacity = on ? "1" : "0.4";
  ctl.style.pointerEvents = on ? "" : "none";
  document.getElementById("lux_thr_home").disabled = !on;
  document.getElementById("lux_thr_street").disabled = !on;
}
const _buildParamSettingsPrevLux = buildParamSettings;
buildParamSettings = function () {
  _buildParamSettingsPrevLux();
  if (currentKey !== "lux") return;
  const c = luxCfg();
  const optsIn = [
    { id: "auto", label: prT("lux_src_auto", "Авто") },
    { id: "dev",  label: prT("lux_src_in", "Домашнее устройство") }
  ];
  const optsOut = [
    { id: "auto", label: prT("lux_src_auto", "Авто") },
    { id: "dev",  label: prT("lux_src_out", "Уличное устройство") }
  ];
  const html = '<div class="set-section"><h3>' + prT("lux_title", "Автоиндикатор") + '</h3>' +
    '<label class="set-check"><input type="checkbox" id="lux_on" ' + (c.on ? "checked" : "") + '> ' +
    prT("lux_on", "Включить автоиндикатор") + '</label>' +
    '<div id="lux_ctl">' +
    '<div class="set-row"><label>' + prT("lux_src_home_l", "Источник по умолчанию для Офис / Дом") + '</label>' +
    selHtml("lux_src_in", optsIn, c.src_in) + '</div>' +
    '<div class="set-row"><label>' + prT("lux_src_street_l", "Источник по умолчанию для Улица") + '</label>' +
    selHtml("lux_src_out", optsOut, c.src_out) + '</div>' +
    '<div class="set-row"><label>' + prT("lux_thr_home_l", "Порог «Офис / Дом»") + ', ' + prT("lux_unit", "лк") + '</label>' +
    '<input id="lux_thr_home" class="set-input" type="number" step="any" min="0" value="' + c.thr_home + '"></div>' +
    '<div class="set-row"><label>' + prT("lux_thr_street_l", "Порог «Улица»") + ', ' + prT("lux_unit", "лк") + '</label>' +
    '<input id="lux_thr_street" class="set-input" type="number" step="any" min="0" value="' + c.thr_street + '"></div>' +
    '</div>' +
    '<div class="param-desc" style="margin-top:8px;">' +
    prT("lux_desc", "Автоматизация штор и света. Когда освещённость падает ниже порога, выводится совет: включить свет или открыть шторы. Порог «Офис / Дом» — по умолчанию 50 лк, «Улица» — 400 лк. Позже советы смогут через «Умный дом» сами включать автоматику освещения или полива.") +
    '</div></div>';
  document.getElementById("param-body").insertAdjacentHTML("beforeend", html);
  document.getElementById("param-save").style.display = "";
  document.getElementById("param-cancel").textContent = t("set_cancel");
  document.getElementById("lux_on").addEventListener("change", luxRefresh);
  luxRefresh();
};
const _applyParamSettingsPrevLux = applyParamSettings;
applyParamSettings = async function () {
  const on = document.getElementById("lux_on");
  if (on && currentKey === "lux") {
    const h = parseFloat(document.getElementById("lux_thr_home").value);
    const s = parseFloat(document.getElementById("lux_thr_street").value);
    SETTINGS.lux = {
      on: on.checked,
      src_in: document.getElementById("lux_src_in").value,
      src_out: document.getElementById("lux_src_out").value,
      thr_home: h > 0 ? h : 50,
      thr_street: s > 0 ? s : 400
    };
  }
  return _applyParamSettingsPrevLux();
};
/* ===== Солнечная радиация: автоиндикатор в окне настроек вкладки ===== */
function solarCfg() {
  const c = SETTINGS.solar_ai || {};
  const h = Number(c.thr_high), l = Number(c.thr_low);
  return {
    on: c.on === true,
    src: c.src || "auto",
    thr_high: h > 0 ? h : 600,
    thr_low: l > 0 ? l : 20
  };
}
function solarRefresh() {
  const on = document.getElementById("sol_on").checked;
  const ctl = document.getElementById("sol_ctl");
  ctl.style.opacity = on ? "1" : "0.4";
  ctl.style.pointerEvents = on ? "" : "none";
  document.getElementById("sol_thr_high").disabled = !on;
  document.getElementById("sol_thr_low").disabled = !on;
}
const _buildParamSettingsPrevSolar = buildParamSettings;
buildParamSettings = function () {
  _buildParamSettingsPrevSolar();
  if (currentKey !== "solar") return;
  const c = solarCfg();
  const opts = [
    { id: "auto", label: prT("lux_src_auto", "Авто") },
    { id: "dev",  label: prT("lux_src_out", "Уличное устройство") }
  ];
  const rows = [
    [prT("sol_t1", "Ясный полдень"), "800 – 1050"],
    [prT("sol_t2", "Облачность"),    "300 – 600"],
    [prT("sol_t3", "Пасмурно"),      "50 – 200"],
    [prT("sol_t4", "Сумерки"),       "10 – 50"],
    [prT("sol_t5", "Ночь"),          "0"]
  ];
  const tr = rows.map(r =>
    '<tr><td style="padding:3px 10px 3px 0;">' + r[0] +
    '</td><td style="padding:3px 0;text-align:right;white-space:nowrap;">' + r[1] + '</td></tr>'
  ).join("");
  const html = '<div class="set-section"><h3>' + prT("sol_title", "Автоиндикатор") + '</h3>' +
    '<label class="set-check"><input type="checkbox" id="sol_on" ' + (c.on ? "checked" : "") + '> ' +
    prT("lux_on", "Включить автоиндикатор") + '</label>' +
    '<div id="sol_ctl">' +
    '<div class="set-row"><label>' + prT("sol_src_l", "Источник по умолчанию") + '</label>' +
    selHtml("sol_src", opts, c.src) + '</div>' +
    '<div class="set-row"><label>' + prT("sol_thr_high_l", "Порог «Превышение»") + ', ' + prT("sol_unit", "Вт/м²") + '</label>' +
    '<input id="sol_thr_high" class="set-input" type="number" step="any" min="0" value="' + c.thr_high + '"></div>' +
    '<div class="set-row"><label>' + prT("sol_thr_low_l", "Порог «Уменьшение»") + ', ' + prT("sol_unit", "Вт/м²") + '</label>' +
    '<input id="sol_thr_low" class="set-input" type="number" step="any" min="0" value="' + c.thr_low + '"></div>' +
    '</div></div>' +
    '<div class="set-section"><h3>' + prT("sol_tbl_title", "Солнечная радиация, Вт/м²") + '</h3>' +
    '<table style="width:100%;border-collapse:collapse;">' + tr + '</table>' +
    '<div class="param-desc" style="margin-top:8px;">' +
    prT("sol_desc", "Когда радиация выше порога «Превышение» или ниже порога «Уменьшение», выводится совет. Позже советы смогут через «Умный дом» управлять шторами, тентами и освещением.") +
    '</div>' +
    '<div class="param-desc" style="margin-top:8px;">' +
    prT("sol_note", "Установка датчика: ставьте его там, где на него не падает тень, строго горизонтально и открыто к небу.") +
    '</div></div>';
  document.getElementById("param-body").insertAdjacentHTML("beforeend", html);
  document.getElementById("param-save").style.display = "";
  document.getElementById("param-cancel").textContent = t("set_cancel");
  document.getElementById("sol_on").addEventListener("change", solarRefresh);
  solarRefresh();
};
const _applyParamSettingsPrevSolar = applyParamSettings;
applyParamSettings = async function () {
  const on = document.getElementById("sol_on");
  if (on && currentKey === "solar") {
    const h = parseFloat(document.getElementById("sol_thr_high").value);
    const l = parseFloat(document.getElementById("sol_thr_low").value);
    SETTINGS.solar_ai = {
      on: on.checked,
      src: document.getElementById("sol_src").value,
      thr_high: h > 0 ? h : 600,
      thr_low: l > 0 ? l : 20
    };
  }
  return _applyParamSettingsPrevSolar();
};
/* ===== УФ-индекс: автоиндикатор в окне настроек вкладки ===== */
function uvCfg() {
  const c = SETTINGS.uv_ai || {};
  return { on: c.on !== false, src: c.src || "auto" };
}
function uvRefresh() {
  const on = document.getElementById("uv_on").checked;
  const ctl = document.getElementById("uv_ctl");
  ctl.style.opacity = on ? "1" : "0.4";
  ctl.style.pointerEvents = on ? "" : "none";
}
const _buildParamSettingsPrevUv = buildParamSettings;
buildParamSettings = function () {
  _buildParamSettingsPrevUv();
  if (currentKey !== "uv") return;
  const c = uvCfg();
  const opts = [
    { id: "auto",       label: prT("lux_src_auto", "Авто") },
    { id: "dev",        label: prT("lux_src_out", "Уличное устройство") },
    { id: "open-meteo", label: "Open-Meteo" },
    { id: "owm",        label: "OpenWeatherMap" }
  ];
  const rows = [
    { n: prT("uv_g1", "Умеренный"),       r: "3 – 5",  c: "#ffcf4d" },
    { n: prT("uv_g2", "Высокий"),         r: "6 – 7",  c: "#ff9d4d" },
    { n: prT("uv_g3", "Очень высокий"),   r: "8 – 10", c: "#ff4d4d" },
    { n: prT("uv_g4", "Экстремальный"),   r: "11+",    c: "#d62839" }
  ];
  const tr = rows.map(it =>
    '<tr><td style="padding:3px 10px 3px 0;"><span style="color:' + it.c + ';">■</span> ' + it.n +
    '</td><td style="padding:3px 0;text-align:right;white-space:nowrap;">' + it.r + '</td></tr>'
  ).join("");
  const html = '<div class="set-section"><h3>' + prT("uv_title", "Автоиндикатор") + '</h3>' +
    '<label class="set-check"><input type="checkbox" id="uv_on" ' + (c.on ? "checked" : "") + '> ' +
    prT("lux_on", "Включить автоиндикатор") + '</label>' +
    '<div id="uv_ctl">' +
    '<div class="set-row"><label>' + prT("uv_src_l", "Источник") + '</label>' +
    selHtml("uv_src", opts, c.src) + '</div>' +
    '</div>' +
    '<table style="width:100%;border-collapse:collapse;margin-top:8px;">' + tr + '</table>' +
    '<div class="param-desc" style="margin-top:8px;">' +
    prT("uv_desc", "«Авто»: сначала уличное устройство, если его нет — Open-Meteo, потом OpenWeatherMap. Если выбрать источник вручную, берутся данные только от него. Пунктиры на графике: 3, 6, 8 и 11.") +
    '</div></div>';
  document.getElementById("param-body").insertAdjacentHTML("beforeend", html);
  document.getElementById("param-save").style.display = "";
  document.getElementById("param-cancel").textContent = t("set_cancel");
  document.getElementById("uv_on").addEventListener("change", uvRefresh);
  uvRefresh();
};
const _applyParamSettingsPrevUv = applyParamSettings;
applyParamSettings = async function () {
  const on = document.getElementById("uv_on");
  if (on && currentKey === "uv") {
    SETTINGS.uv_ai = { on: on.checked, src: document.getElementById("uv_src").value };
  }
  return _applyParamSettingsPrevUv();
};
/* ===== УФ-индекс: окно в новом виде (название, без старого текста, полные подписи градаций) ===== */
const _buildParamSettingsPrevUv2 = buildParamSettings;
buildParamSettings = function () {
  _buildParamSettingsPrevUv2();
  if (currentKey !== "uv") return;
  const c = uvCfg();
  const opts = [
    { id: "auto",       label: prT("lux_src_auto", "Авто") },
    { id: "dev",        label: prT("lux_src_out", "Уличное устройство") },
    { id: "open-meteo", label: "Open-Meteo" },
    { id: "owm",        label: "OpenWeatherMap" }
  ];
  const rows = [
    [prT("uv_r1", "Низкий: защита не требуется."), "0 – 2"],
    [prT("uv_r2", "Умеренный: необходима защита (рекомендуется крем с SPF)."), "3 – 5"],
    [prT("uv_r3", "Высокий: обязательное использование солнцезащитных средств, сокращение времени на солнце."), "6 – 7"],
    [prT("uv_r4", "Очень высокий: усиленная защита, лучше избегать солнца с полудня до 16:00."), "8 – 10"],
    [prT("uv_r5", "Экстремальный: максимальные меры предосторожности, безопаснее оставаться в помещении."), "11+"]
  ];
  const tr = rows.map(r =>
    '<tr><td style="padding:4px 12px 4px 0;">' + r[0] +
    '</td><td style="padding:4px 0;text-align:right;white-space:nowrap;vertical-align:top;">' + r[1] + '</td></tr>'
  ).join("");
  const html = '<div class="set-section"><h3>' + prT("uv_title", "Автоиндикатор") + '</h3>' +
    '<label class="set-check"><input type="checkbox" id="uv_on" ' + (c.on ? "checked" : "") + '> ' +
    prT("lux_on", "Включить автоиндикатор") + '</label>' +
    '<div id="uv_ctl">' +
    '<div class="set-row"><label>' + prT("uv_src_l", "Источник") + '</label>' +
    selHtml("uv_src", opts, c.src) + '</div>' +
    '</div>' +
    '<table style="width:100%;border-collapse:collapse;margin-top:8px;">' + tr + '</table>' +
    '<div class="param-desc" style="margin-top:8px;">' +
    prT("uv_desc", "«Авто»: сначала уличное устройство, если его нет — Open-Meteo, потом OpenWeatherMap. Если выбрать источник вручную, берутся данные только от него. Пунктиры на графике: 3, 6, 8 и 11.") +
    '</div></div>';
  document.getElementById("param-body").innerHTML = html;
  document.getElementById("param-set-title").textContent =
    t("set_page") + prT("uv_set_name", "Ультрафиолетовый индекс (УФ)");
  document.getElementById("param-save").style.display = "";
  document.getElementById("param-cancel").textContent = t("set_cancel");
  document.getElementById("uv_on").addEventListener("change", uvRefresh);
  uvRefresh();
};
/* ===== УФ-индекс: таблица градаций с цветными квадратами и короткими подписями ===== */
const _buildParamSettingsPrevUv3 = buildParamSettings;
buildParamSettings = function () {
  _buildParamSettingsPrevUv3();
  if (currentKey !== "uv") return;
  const ctl = document.getElementById("uv_ctl");
  if (!ctl || !ctl.nextElementSibling) return;
  const rows = [
    { c: "#ffffff", n: prT("uv_s1", "Низкий: защита не требуется."),          r: "0 – 2" },
    { c: "#ffcf4d", n: prT("uv_s2", "Умеренный: необходима защита."),         r: "3 – 5" },
    { c: "#ff4d4d", n: prT("uv_s3", "Высокий: обязательная защита."),         r: "6 – 7" },
    { c: "#d62839", n: prT("uv_s4", "Очень высокий: усиленная защита."),      r: "8 – 10" },
    { c: "#a4133c", n: prT("uv_s5", "Экстремальный: максимальная защита."),   r: "11+" }
  ];
  ctl.nextElementSibling.innerHTML = rows.map(it =>
    '<tr><td style="padding:4px 12px 4px 0;"><span style="color:' + it.c +
    ';text-shadow:0 0 1px #8a93a6;">■</span> ' + it.n +
    '</td><td style="padding:4px 0;text-align:right;white-space:nowrap;">' + it.r + '</td></tr>'
  ).join("");
};
/* ===== Пыльца: автоиндикатор в окне настроек вкладки ===== */
const POLLEN_KINDS = [
  { id: "alder",   f: "alder_pollen",   names: ["Ольха"],            ru: "Ольха",    d: 50, a: "a93" },
  { id: "birch",   f: "birch_pollen",   names: ["Берёза"],           ru: "Берёза",   d: 50, a: "a94" },
  { id: "grass",   f: "grass_pollen",   names: ["Травы", "Трава"],   ru: "Трава",    d: 30, a: "a95" },
  { id: "olive",   f: "olive_pollen",   names: ["Олива"],            ru: "Олива",    d: 50, a: "a96" },
  { id: "mugwort", f: "mugwort_pollen", names: ["Полынь"],           ru: "Полынь",   d: 30, a: "a97" },
  { id: "ragweed", f: "ragweed_pollen", names: ["Амброзия"],         ru: "Амброзия", d: 20, a: "a98" }
];
function pollenCfg() {
  const c = SETTINGS.pollen_ai || {};
  const thr = {};
  POLLEN_KINDS.forEach(k => {
    const v = Number(c.thr && c.thr[k.id]);
    thr[k.id] = v > 0 ? v : k.d;
  });
  return { on: c.on !== false, src: c.src || "auto", thr: thr };
}
function pollenRefresh() {
  const on = document.getElementById("pol_on").checked;
  const ctl = document.getElementById("pol_ctl");
  ctl.style.opacity = on ? "1" : "0.4";
  ctl.style.pointerEvents = on ? "" : "none";
  POLLEN_KINDS.forEach(k => { document.getElementById("pol_thr_" + k.id).disabled = !on; });
}
const _buildParamSettingsPrevPollen = buildParamSettings;
buildParamSettings = function () {
  _buildParamSettingsPrevPollen();
  if (currentKey !== "pollen") return;
  const c = pollenCfg();
  const opts = [
    { id: "auto",       label: prT("lux_src_auto", "Авто") },
    { id: "open-meteo", label: "Open-Meteo Air" }
  ];
  const unit = prT("pol_unit", "зёрен/м³");
  const rows = POLLEN_KINDS.map(k =>
    '<div class="set-row"><label>' + prT("pol_thr_l", "Порог") + ' «' + prT("pol_n_" + k.id, k.ru) + '», ' + unit + '</label>' +
    '<input id="pol_thr_' + k.id + '" class="set-input" type="number" step="any" min="0" value="' + c.thr[k.id] + '"></div>'
  ).join("");
  const html = '<div class="set-section"><h3>' + prT("pol_title", "Автоиндикатор") + '</h3>' +
    '<label class="set-check"><input type="checkbox" id="pol_on" ' + (c.on ? "checked" : "") + '> ' +
    prT("lux_on", "Включить автоиндикатор") + '</label>' +
    '<div id="pol_ctl">' +
    '<div class="set-row"><label>' + prT("uv_src_l", "Источник") + '</label>' +
    selHtml("pol_src", opts, c.src) + '</div>' +
    rows + '</div>' +
    '<div class="param-desc" style="margin-top:8px;">' +
    prT("pol_desc1", "Данные о пыльце даёт Open-Meteo Air Quality. Пороги по умолчанию ориентировочные: чувствительность у аллергиков разная. Пунктиры на графике — по одному на каждый вид пыльцы, цветом своей линии.") +
    '</div>' +
    '<div class="param-desc" style="margin-top:8px;">' +
    prT("pol_desc2", "Как настроить: если реакция начинается раньше — уменьшите порог своего аллергена; если реагируете только на высокие уровни — увеличьте. Пустое поле после сохранения вернёт значение по умолчанию.") +
    '</div>' +
    '<div class="param-desc" style="margin-top:8px;">' +
    prT("pol_desc3", "Совет аллергикам: когда порог превышен, держите окна закрытыми (особенно утром и в сухую ветреную погоду), после улицы мойте лицо и волосы и меняйте одежду, сушите бельё дома, чаще делайте влажную уборку. Лекарства — только по назначению врача.") +
    '</div></div>';
  document.getElementById("param-body").insertAdjacentHTML("beforeend", html);
  document.getElementById("param-save").style.display = "";
  document.getElementById("param-cancel").textContent = t("set_cancel");
  document.getElementById("pol_on").addEventListener("change", pollenRefresh);
  pollenRefresh();
};
const _applyParamSettingsPrevPollen = applyParamSettings;
applyParamSettings = async function () {
  const on = document.getElementById("pol_on");
  if (on && currentKey === "pollen") {
    const thr = {};
    POLLEN_KINDS.forEach(k => {
      const v = parseFloat(document.getElementById("pol_thr_" + k.id).value);
      if (v > 0 && v !== k.d) thr[k.id] = v;
    });
    SETTINGS.pollen_ai = { on: on.checked, src: document.getElementById("pol_src").value, thr: thr };
  }
  return _applyParamSettingsPrevPollen();
};
/* ===== Пыльца: пороги по умолчанию разведены, чтобы линии не лежали друг на друге ===== */
(function () {
  const d = { alder: 51, birch: 50, grass: 31, olive: 49, mugwort: 30, ragweed: 20 };
  POLLEN_KINDS.forEach(k => { if (d[k.id] > 0) k.d = d[k.id]; });
})();
/* ===== Метан CH₄: окно автоиндикатора ===== */
function ch4Cfg() {
  const c = SETTINGS.ch4 || {};
  const p = Number(c.thr_ppm);
  return {
    on: c.on !== false,
    thr_ppm: p > 0 ? p : 4400,
    t_mode: c.t_mode === "fix" ? "fix" : "auto",
    t_fix: (c.t_fix != null && isFinite(Number(c.t_fix))) ? Number(c.t_fix) : 25
  };
}
function ch4Round() {
  const u = SETTINGS && SETTINGS.units && SETTINGS.units.ch4;
  return u === "ug" ? 0 : (u === "mg" ? 1 : 2);
}
function ch4InstallRound() {
  const p = (typeof PARAMS !== "undefined") && PARAMS.find(x => x.key === "ch4");
  if (!p) return;
  Object.defineProperty(p, "round", { get: ch4Round, set: function () {}, configurable: true });
}
ch4InstallRound();
window.addEventListener("load", ch4InstallRound);
function ch4RefreshWin() {
  const on = document.getElementById("ch4_on").checked;
  const ctl = document.getElementById("ch4_ctl");
  ctl.style.opacity = on ? "1" : "0.4";
  ctl.style.pointerEvents = on ? "" : "none";
  document.getElementById("ch4_thr").disabled = !on;
  const fix = document.getElementById("ch4_tm").value === "fix";
  document.getElementById("ch4_tfix").disabled = !on || !fix;
}
const _buildParamSettingsPrevCh4 = buildParamSettings;
buildParamSettings = function () {
  _buildParamSettingsPrevCh4();
  if (currentKey !== "ch4") return;
  const c = ch4Cfg();
  const uSel = document.getElementById("pu_unit");
  const u = uSel ? uSel.value : (SETTINGS.units.ch4 || "ppm");
  const srcOpts = [ { id: "in", label: prT("ch4_src_in", "Домашнее устройство") } ];
  const tOpts = [
    { id: "auto", label: prT("ch4_t_auto", "Авто: домашний датчик t, иначе +25 °C") },
    { id: "fix",  label: prT("ch4_t_fix", "Фиксированная") }
  ];
  const html = '<div class="set-section"><h3>' + prT("ch4_title", "Автоиндикатор") + '</h3>' +
    '<label class="set-check"><input type="checkbox" id="ch4_on" ' + (c.on ? "checked" : "") + '> ' +
    prT("lux_on", "Включить автоиндикатор") + '</label>' +
    '<div id="ch4_ctl">' +
    '<div class="set-row"><label>' + prT("ch4_mode_l", "Режим") + '</label><span>' + prT("ch4_mode_v", "Офис / Дом") + '</span></div>' +
    '<div class="set-row"><label>' + prT("uv_src_l", "Источник") + '</label>' + selHtml("ch4_src", srcOpts, "in") + '</div>' +
    '<div class="set-hint" style="margin:0 0 6px;">' + prT("ch4_src_hint", "Подходит только датчик от домашнего устройства.") + '</div>' +
    '<div class="set-row"><label>' + prT("ch4_t_l", "Температура для пересчёта") + '</label>' + selHtml("ch4_tm", tOpts, c.t_mode) + '</div>' +
    '<div class="set-row"><label>' + prT("ch4_t_val", "Фиксированная температура") + ', °C</label>' +
    '<input id="ch4_tfix" class="set-input" type="number" step="any" value="' + c.t_fix + '"></div>' +
    '<div class="set-row"><label>' + prT("thr_word", "Порог") + ', <span id="ch4_unit">' + unitLabel("ch4", u) + '</span></label>' +
    '<input id="ch4_thr" class="set-input" type="number" step="any" min="0" value="' + gasFmt(ch4PpmTo(c.thr_ppm, u)) + '"></div>' +
    '</div>' +
    '<div class="param-desc" style="margin-top:8px;">' +
    prT("ch4_d_thr", "Порог по умолчанию — 10 % от нижнего предела взрываемости (НПВ). Взрывоопасная смесь начинается с 4,4 % метана в воздухе. Это запас безопасности: тревога срабатывает намного раньше, чем смесь станет опасной.") +
    '</div>' +
    '<div class="param-desc" style="margin-top:8px;">' +
    prT("ch4_d_desc", "Метан без запаха. В закрытой комнате он вытесняет воздух и может вызвать удушье. Взрывоопасен при 4,4–17 % в воздухе, самая опасная смесь около 9,5 %. Источник обычно бытовой газ.") +
    '</div>' +
    '<div class="param-desc" style="color:var(--error);font-weight:600;margin-top:8px;">' +
    prT("ch4_d_bad", "Кратковременное превышение не допустимо.") + '</div>' +
    '<div class="param-desc" style="margin-top:6px;">' + prT("ch4_d_up", "Улетучивается вверх.") + '</div>' +
    '</div>';
  document.getElementById("param-body").insertAdjacentHTML("beforeend", html);
  document.getElementById("param-save").style.display = "";
  document.getElementById("param-cancel").textContent = t("set_cancel");
  document.getElementById("ch4_on").addEventListener("change", ch4RefreshWin);
  document.getElementById("ch4_tm").addEventListener("change", ch4RefreshWin);
  let shownU = u;
  if (uSel) uSel.addEventListener("change", () => {
    const nu = uSel.value;
    const el = document.getElementById("ch4_thr");
    const v = parseFloat(el.value);
    if (isFinite(v)) el.value = gasFmt(ch4PpmTo(ch4ToPpm(v, shownU), nu));
    shownU = nu;
    document.getElementById("ch4_unit").textContent = unitLabel("ch4", nu);
  });
  ch4RefreshWin();
};
const _applyParamSettingsPrevCh4 = applyParamSettings;
applyParamSettings = async function () {
  const on = document.getElementById("ch4_on");
  if (on && currentKey === "ch4") {
    const uSel = document.getElementById("pu_unit");
    const u = uSel ? uSel.value : "ppm";
    SETTINGS.units.ch4 = u;
    const v = parseFloat(document.getElementById("ch4_thr").value);
    const ppm = v > 0 ? ch4ToPpm(v, u) : 4400;
    const tf = parseFloat(document.getElementById("ch4_tfix").value);
    const o = {
      on: on.checked,
      t_mode: document.getElementById("ch4_tm").value,
      t_fix: isFinite(tf) ? tf : 25
    };
    if (Math.abs(ppm - 4400) > 44) o.thr_ppm = ppm;
    SETTINGS.ch4 = o;
  }
  const r = await _applyParamSettingsPrevCh4();
  if (typeof ch4TempRefresh === "function") ch4TempRefresh();
  return r;
};
/* ===== Метан: в режиме «Авто» в сером поле видна реальная температура ===== */
let ch4FixKeep = 25;
async function ch4AutoTemp() {
  try {
    const v = await advLatestDevice("in", "temp");
    return (v !== null && isFinite(v)) ? Math.round(v * 10) / 10 : 25;
  } catch (e) { return 25; }
}
const _buildParamSettingsPrevCh4b = buildParamSettings;
buildParamSettings = function () {
  _buildParamSettingsPrevCh4b();
  if (currentKey !== "ch4") return;
  const tm = document.getElementById("ch4_tm");
  const tf = document.getElementById("ch4_tfix");
  if (!tm || !tf) return;
  ch4FixKeep = ch4Cfg().t_fix;
  let autoVal = null;
  const show = function () {
    if (tm.value === "fix") tf.value = ch4FixKeep;
    else tf.value = (autoVal === null) ? "" : autoVal;
  };
  tf.addEventListener("input", function () {
    const v = parseFloat(tf.value);
    if (tm.value === "fix" && isFinite(v)) ch4FixKeep = v;
  });
  tm.addEventListener("change", show);
  show();
  ch4AutoTemp().then(function (v) {
    autoVal = v;
    if (tm.value !== "fix") show();
  });
};
const _applyParamSettingsPrevCh4b = applyParamSettings;
applyParamSettings = async function () {
  const tm = document.getElementById("ch4_tm");
  const tf = document.getElementById("ch4_tfix");
  if (currentKey === "ch4" && tm && tf && tm.value !== "fix") tf.value = ch4FixKeep;
  return _applyParamSettingsPrevCh4b();
};
/* ===== Влажность: автоиндикатор в окне настроек вкладки ===== */
const HUM_DEF = { home_low: 38, home_high: 65, st_high: 90, st_low: 35 };
function humCfg() {
  const c = SETTINGS.hum_ai || {};
  const thr = {};
  Object.keys(HUM_DEF).forEach(k => {
    const v = Number(c.thr && c.thr[k]);
    thr[k] = v > 0 ? v : HUM_DEF[k];
  });
  return { on: c.on !== false, src_in: c.src_in || "auto", src_out: c.src_out || "auto", thr: thr };
}
function humRefresh() {
  const on = document.getElementById("hum_on").checked;
  const ctl = document.getElementById("hum_ctl");
  ctl.style.opacity = on ? "1" : "0.4";
  ctl.style.pointerEvents = on ? "" : "none";
  Object.keys(HUM_DEF).forEach(k => { document.getElementById("hum_thr_" + k).disabled = !on; });
}
const _buildParamSettingsPrevHum = buildParamSettings;
buildParamSettings = function () {
  _buildParamSettingsPrevHum();
  if (currentKey !== "rh") return;
  const c = humCfg();
  const optsIn = [
    { id: "auto", label: prT("lux_src_auto", "Авто") },
    { id: "dev",  label: prT("lux_src_in", "Домашнее устройство") }
  ];
  const optsOut = [
    { id: "auto",       label: prT("lux_src_auto", "Авто") },
    { id: "dev",        label: prT("lux_src_out", "Уличное устройство") },
    { id: "open-meteo", label: "Open-Meteo" },
    { id: "owm",        label: "OpenWeatherMap" }
  ];
  const rowsDef = [
    { k: "home_low",  n: prT("hum_n1", "Дом, влажность ниже") },
    { k: "home_high", n: prT("hum_n2", "Дом, влажность выше") },
    { k: "st_high",   n: prT("hum_n3", "Улица, влажность выше") },
    { k: "st_low",    n: prT("hum_n4", "Улица, влажность ниже") }
  ];
  const rows = rowsDef.map(r =>
    '<div class="set-row"><label>' + prT("thr_word", "Порог") + ': ' + r.n + ', %</label>' +
    '<input id="hum_thr_' + r.k + '" class="set-input" type="number" step="any" min="0" value="' + c.thr[r.k] + '"></div>'
  ).join("");
  const html = '<div class="set-section"><h3>' + prT("hum_title", "Автоиндикатор") + '</h3>' +
    '<label class="set-check"><input type="checkbox" id="hum_on" ' + (c.on ? "checked" : "") + '> ' +
    prT("lux_on", "Включить автоиндикатор") + '</label>' +
    '<div id="hum_ctl">' +
    '<div class="set-row"><label>' + prT("hum_src_home_l", "Источник для Офис / Дом") + '</label>' +
    selHtml("hum_src_in", optsIn, c.src_in) + '</div>' +
    '<div class="set-row"><label>' + prT("hum_src_street_l", "Источник для Улица") + '</label>' +
    selHtml("hum_src_out", optsOut, c.src_out) + '</div>' +
    rows + '</div>' +
    '<div class="param-desc" style="margin-top:8px;">' +
    prT("hum_desc", "Норма влажности: дома 30–60 %, на улице 30–100 %. Пунктиры на графике — пороги советов. Если поле порога очистить и нажать «Сохранить», вернётся значение по умолчанию.") +
    '</div></div>';
  document.getElementById("param-body").insertAdjacentHTML("beforeend", html);
  document.getElementById("param-save").style.display = "";
  document.getElementById("param-cancel").textContent = t("set_cancel");
  document.getElementById("hum_on").addEventListener("change", humRefresh);
  humRefresh();
};
const _applyParamSettingsPrevHum = applyParamSettings;
applyParamSettings = async function () {
  const on = document.getElementById("hum_on");
  if (on && currentKey === "rh") {
    const thr = {};
    Object.keys(HUM_DEF).forEach(k => {
      const v = parseFloat(document.getElementById("hum_thr_" + k).value);
      if (v > 0 && v !== HUM_DEF[k]) thr[k] = v;
    });
    SETTINGS.hum_ai = {
      on: on.checked,
      src_in: document.getElementById("hum_src_in").value,
      src_out: document.getElementById("hum_src_out").value,
      thr: thr
    };
  }
  return _applyParamSettingsPrevHum();
};
/* ===== Частицы PM: автоиндикатор в окне настроек вкладки «PM» =====
   Что здесь есть:
   1) PM_KINDS — список из четырёх видов частиц. Для каждого записано:
      id — внутреннее имя; dev — под каким именем частицу присылает устройство;
      web — под каким именем её присылает Open-Meteo Air (у PM1.0 и PM4.0 интернета нет);
      def — пять чисел «с какого значения начинается уровень»:
      Чистый (всегда 0), Приемлемый, Умеренно загрязнён, Вреден для чувствительных, Опасный;
      a — номера двух советов: «вреден» и «опасный».
   2) pmCfg() — читает сохранённые настройки и подставляет числа по умолчанию там, где поле пустое.
   3) Окно: галка, выбор источника, таблица 4 × 5 и пояснения.
   4) Сохранение: хранятся только те числа, которые ты изменил. */
const PM_KINDS = [
  { id: "pm1",  dev: "pm1",  web: null,    label: "PM1.0", def: [0, 5, 20, 30, 70],     a: ["a104", "a105"] },
  { id: "pm25", dev: "pm25", web: "pm2_5", label: "PM2.5", def: [0, 9, 35, 55, 125],    a: ["a106", "a107"] },
  { id: "pm4",  dev: "pm4",  web: null,    label: "PM4.0", def: [0, 25, 70, 110, 200],  a: ["a108", "a109"] },
  { id: "pm10", dev: "pm10", web: "pm10",  label: "PM10",  def: [0, 54, 154, 254, 354], a: ["a110", "a111"] }
];
function pmCfg() {
  const c = SETTINGS.pm_ai || {};
  const thr = {};
  PM_KINDS.forEach(k => {
    const saved = (c.thr && c.thr[k.id]) || [];
    thr[k.id] = k.def.map((d, i) => {
      const v = Number(saved[i]);
      return (i > 0 && v > 0) ? v : d;
    });
  });
  return { on: c.on !== false, src: c.src || "auto", thr: thr };
}
function pmRefresh() {
  const on = document.getElementById("pm_on").checked;
  const ctl = document.getElementById("pm_ctl");
  ctl.style.opacity = on ? "1" : "0.4";
  ctl.style.pointerEvents = on ? "" : "none";
  PM_KINDS.forEach(k => {
    for (let i = 1; i <= 4; i++) document.getElementById("pm_thr_" + k.id + "_" + i).disabled = !on;
  });
}
const _buildParamSettingsPrevPm = buildParamSettings;
buildParamSettings = function () {
  _buildParamSettingsPrevPm();
  if (currentKey !== "pm") return;
  const c = pmCfg();
  const opts = [
    { id: "auto",       label: prT("lux_src_auto", "Авто") },
    { id: "dev",        label: prT("lux_src_out", "Уличное устройство") },
    { id: "open-meteo", label: "Open-Meteo Air" }
  ];
  const levels = [
    prT("pm_lv0", "Чистый"),
    prT("pm_lv1", "Приемлемый"),
    prT("pm_lv2", "Умеренно загрязнён"),
    prT("pm_lv3", "Вреден для чувствительных"),
    prT("pm_lv4", "Опасный")
  ];
  const head = '<tr><th style="text-align:left;padding:3px 6px 3px 0;"></th>' +
    PM_KINDS.map(k => '<th style="padding:3px 4px;">' + k.label + '</th>').join("") + '</tr>';
  const body = levels.map((name, i) =>
    '<tr><td style="padding:3px 6px 3px 0;">' + name + '</td>' +
    PM_KINDS.map(k => i === 0
      ? '<td style="padding:3px 4px;text-align:center;">0</td>'
      : '<td style="padding:3px 4px;"><input id="pm_thr_' + k.id + '_' + i +
        '" class="set-input" type="number" step="any" min="0" style="width:100%;min-width:54px;" value="' +
        c.thr[k.id][i] + '"></td>').join("") + '</tr>'
  ).join("");
  const html = '<div class="set-section"><h3>' + prT("pm_title", "Автоиндикатор") + '</h3>' +
    '<label class="set-check"><input type="checkbox" id="pm_on" ' + (c.on ? "checked" : "") + '> ' +
    prT("lux_on", "Включить автоиндикатор") + '</label>' +
    '<div id="pm_ctl">' +
    '<div class="set-row"><label>' + prT("uv_src_l", "Источник") + '</label>' + selHtml("pm_src", opts, c.src) + '</div>' +
    '<div class="param-desc" style="margin:6px 0;">' + prT("pm_tbl_title", "Таблица порогов, мкг/м³: с какого значения начинается уровень") + '</div>' +
    '<table style="width:100%;border-collapse:collapse;">' + head + body + '</table>' +
    '</div>' +
    '<div class="param-desc" style="margin-top:8px;">' +
    prT("pm_desc1", "Пунктирами на графике показаны два уровня каждого вида частиц: «Вреден для чувствительных» и «Опасный». Советы тоже выводятся по этим двум уровням.") +
    '</div>' +
    '<div class="param-desc" style="margin-top:8px;">' +
    prT("pm_desc2", "Данные: PM2.5 и PM10 — от устройства или от Open-Meteo Air. PM1.0 и PM4.0 — только от уличного устройства.") +
    '</div>' +
    '<div class="param-desc" style="margin-top:8px;">' +
    prT("pm_desc3", "Числа для PM2.5 и PM10 взяты из американской шкалы EPA. Для PM1.0 и PM4.0 официальных норм нет, числа ориентировочные. Если очистить поле и нажать «Сохранить», значение вернется по умолчанию.") +
    '</div></div>';
  document.getElementById("param-body").insertAdjacentHTML("beforeend", html);
  document.getElementById("param-save").style.display = "";
  document.getElementById("param-cancel").textContent = t("set_cancel");
  document.getElementById("pm_on").addEventListener("change", pmRefresh);
  pmRefresh();
};
const _applyParamSettingsPrevPm = applyParamSettings;
applyParamSettings = async function () {
  const on = document.getElementById("pm_on");
  if (on && currentKey === "pm") {
    const thr = {};
    PM_KINDS.forEach(k => {
      const vals = [0];
      let changed = false;
      for (let i = 1; i <= 4; i++) {
        const v = parseFloat(document.getElementById("pm_thr_" + k.id + "_" + i).value);
        const val = v > 0 ? v : k.def[i];
        if (val !== k.def[i]) changed = true;
        vals.push(val);
      }
      if (changed) thr[k.id] = vals;
    });
    SETTINGS.pm_ai = { on: on.checked, src: document.getElementById("pm_src").value, thr: thr };
  }
  return _applyParamSettingsPrevPm();
};
/* ===== Радиация: автоиндикатор в окне настроек вкладки «Радиация» =====
   Устройство само присылает мкЗв/ч, сайт ничего не пересчитывает из импульсов.
   В настройках хранится (SETTINGS.rad_ai):
     on — включён ли автоиндикатор; cmp — сравнивать ли улицу с домом;
     diff — «Разница, %»; win — «Окно пиков, минут»;
     src_in / src_out — откуда брать данные для дома и для улицы;
     thr — три порога (мкЗв/ч), хранятся только если их изменили.
   Уровни по умолчанию: Внимание 0,25 / Повышенный фон 0,40 / Тревога 0,80. */
const RAD_DEF = [0.25, 0.40, 0.80];
function radCfg() {
  const c = SETTINGS.rad_ai || {};
  let thr = RAD_DEF.slice();
  if (Array.isArray(c.thr) && c.thr.length === 3) {
    const a = c.thr.map(Number);
    if (a.every(x => x > 0) && a[0] < a[1] && a[1] < a[2]) thr = a;
  }
  const w = Number(c.win), d = Number(c.diff);
  return {
    on: c.on !== false,
    src_in: c.src_in || "auto",
    src_out: c.src_out || "auto",
    cmp: c.cmp !== false,
    diff: d > 0 ? d : 50,
    win: (w >= 1 && w <= 120) ? Math.round(w) : 10,
    thr: thr
  };
}
/* Есть ли у устройства (in — домашнее, out — уличное) включённый счётчик радиации:
   устройство включено, введены серийный номер и ключ, и в карте параметров есть «rad». */
function radDevHas(which) {
  const dev = SETTINGS.devices && SETTINGS.devices[which];
  const sn = which === "out" ? SETTINGS.sn_out : SETTINGS.sn_in;
  const on = SETTINGS.config_items[which === "out" ? "dev_out" : "dev_in"] === true;
  if (!dev || !dev.map || !sn || !on) return false;
  return Object.keys(dev.map).some(k => dev.map[k] === "rad");
}
/* Уличный источник радиации есть, только если есть уличное устройство со счётчиком.
   Интернет-источника радиации пока нет. */
function radStreetExists() { return radDevHas("out"); }
function radRefresh() {
  const on = document.getElementById("rad_on").checked;
  const ctl = document.getElementById("rad_ctl");
  ctl.style.opacity = on ? "1" : "0.4";
  ctl.style.pointerEvents = on ? "" : "none";
  ["rad_thr_1", "rad_thr_2", "rad_thr_3", "rad_win", "rad_diff", "rad_cmp"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !on;
  });
}
const _buildParamSettingsPrevRad = buildParamSettings;
buildParamSettings = function () {
  _buildParamSettingsPrevRad();
  if (currentKey !== "rad") return;
  const c = radCfg();
  const uSel = document.getElementById("pu_unit");
  const u = uSel ? uSel.value : (SETTINGS.units.rad || "uSv");
  const optsIn = [
    { id: "auto", label: prT("lux_src_auto", "Авто") },
    { id: "in",   label: prT("lux_src_in", "Домашнее устройство") },
    { id: "out",  label: prT("lux_src_out", "Уличное устройство") }
  ];
  const optsOut = [
    { id: "auto", label: prT("lux_src_auto", "Авто") },
    { id: "out",  label: prT("lux_src_out", "Уличное устройство") },
    { id: "web",  label: prT("rad_src_web", "Интернет (пока нет источника)") }
  ];
  const names = [
    prT("rad_n1", "Порог «Внимание»"),
    prT("rad_n2", "Порог «Повышенный фон»"),
    prT("rad_n3", "Порог «Тревога»")
  ];
  const thrRows = names.map((n, i) =>
    '<div class="set-row"><label>' + n + ', <span class="rad_u">' + unitLabel("rad", u) + '</span></label>' +
    '<input id="rad_thr_' + (i + 1) + '" class="set-input" type="number" step="any" min="0" value="' +
    gasFmt(convertUnit(c.thr[i], "rad", u)) + '"></div>'
  ).join("");
  const cmpRow = radStreetExists()
    ? '<label class="set-check"><input type="checkbox" id="rad_cmp" ' + (c.cmp ? "checked" : "") + '> ' +
      prT("rad_cmp_l", "Сравнивать улицу с домом") + '</label>'
    : '';
  const levels = [
    { c: "#ffffff", n: prT("rad_t0", "Норма"),           r: prT("rad_to", "до") + " 0,25" },
    { c: "#ffcf4d", n: prT("rad_t1", "Внимание"),        r: "0,25 – 0,40" },
    { c: "#ff9d4d", n: prT("rad_t2", "Повышенный фон"),  r: "0,40 – 0,80" },
    { c: "#d62839", n: prT("rad_t3", "Тревога"),         r: prT("rad_from", "от") + " 0,80" }
  ];
  const tr = levels.map(it =>
    '<tr><td style="padding:3px 10px 3px 0;"><span style="color:' + it.c + ';text-shadow:0 0 1px #8a93a6;">■</span> ' + it.n +
    '</td><td style="padding:3px 0;text-align:right;white-space:nowrap;">' + it.r + '</td></tr>'
  ).join("");
  const html = '<div class="set-section"><h3>' + prT("rad_title", "Автоиндикатор") + '</h3>' +
    '<label class="set-check"><input type="checkbox" id="rad_on" ' + (c.on ? "checked" : "") + '> ' +
    prT("lux_on", "Включить автоиндикатор") + '</label>' +
    '<div id="rad_ctl">' + cmpRow +
    '<div class="set-row"><label>' + prT("rad_diff_l", "Разница, %") + '</label>' +
    '<input id="rad_diff" class="set-input" type="number" step="any" min="1" value="' + c.diff + '"></div>' +
    '<div class="set-row"><label>' + prT("rad_src_home_l", "Источник «Офис / Дом»") + '</label>' + selHtml("rad_src_in", optsIn, c.src_in) + '</div>' +
    '<div class="set-row"><label>' + prT("rad_src_street_l", "Источник «Улица»") + '</label>' + selHtml("rad_src_out", optsOut, c.src_out) + '</div>' +
    thrRows +
    '<div class="set-row"><label>' + prT("rad_win_l", "Окно пиков, минут") + '</label>' +
    '<input id="rad_win" class="set-input" type="number" step="1" min="1" max="120" value="' + c.win + '"></div>' +
    '</div>' +
    '<div class="param-desc" style="margin-top:8px;">' +
    prT("rad_d1", "Устройство само сглаживает данные и сохраняет настоящие пики. Сайт берёт максимум за «окно пиков», чтобы короткий пик не потерялся. «Разница, %» — на сколько процентов фон должен вырасти над обычным (среднее за 6 часов), чтобы появился совет о резком росте. Пустое поле после «Сохранить» вернёт значение по умолчанию. Пунктиры на графике видны, только если фон дошёл до порога.") +
    '</div></div>' +
    '<div class="set-section"><h3>' + prT("rad_tbl_title", "Уровни фона, мкЗв/ч") + '</h3>' +
    '<table style="width:100%;border-collapse:collapse;">' + tr + '</table>' +
    '<div class="param-desc" style="margin-top:8px;">' +
    prT("rad_d2", "Естественный фон в жилых помещениях 0,08–0,20 мкЗв/ч (8–20 мкР/ч). По НРБ-99/2009 мощность дозы внутри здания не должна превышать уличный фон более чем на 0,20 мкЗв/ч. В бетонных домах и при гранитной отделке фон часто выше уличного: стройматериалы содержат природные радионуклиды.") +
    '</div>' +
    '<div class="param-desc" style="margin-top:8px;">' +
    prT("rad_d3", "Счётчик Гейгера–Мюллера не видит альфа-излучение (радон) и слабо (5–15 %) видит мягкое бета-излучение. Он создан для гамма-излучения (гранит, бетон) и жёстких бета-частиц (цезий-137, стронций-90, калий-40).") +
    '</div>' +
    '<div class="param-desc" style="margin-top:8px;">' +
    prT("rad_d4", "В поездке: если в новом месте фон повышен, устройство сообщит об этом советом. Без паники: пройдите с прибором по комнатам, сравните с улицей. Перемещая устройство по жилью, можно примерно понять, где фон выше.") +
    '</div></div>';
  document.getElementById("param-body").insertAdjacentHTML("beforeend", html);
  document.getElementById("param-save").style.display = "";
  document.getElementById("param-cancel").textContent = t("set_cancel");
  /* пункт «Интернет» — серый: источника пока нет */
  const webOpt = document.getElementById("rad_src_out").parentNode.querySelector('.avp-opt[data-val="web"]');
  if (webOpt) webOpt.style.color = "#8a93a6";
  document.getElementById("rad_on").addEventListener("change", radRefresh);
  let shownU = u;
  if (uSel) uSel.addEventListener("change", () => {
    const nu = uSel.value;
    const fo = convertUnit(1, "rad", shownU), fn = convertUnit(1, "rad", nu);
    [1, 2, 3].forEach(i => {
      const el = document.getElementById("rad_thr_" + i);
      const v = parseFloat(el.value);
      if (isFinite(v) && fo > 0) el.value = gasFmt(v / fo * fn);
    });
    shownU = nu;
    document.querySelectorAll(".rad_u").forEach(s => { s.textContent = unitLabel("rad", nu); });
  });
  radRefresh();
};
const _applyParamSettingsPrevRad = applyParamSettings;
applyParamSettings = async function () {
  const on = document.getElementById("rad_on");
  if (on && currentKey === "rad") {
    const uSel = document.getElementById("pu_unit");
    const u = uSel ? uSel.value : "uSv";
    const f = convertUnit(1, "rad", u);
    const vals = [1, 2, 3].map(i => {
      const v = parseFloat(document.getElementById("rad_thr_" + i).value);
      return (v > 0 && f > 0) ? v / f : RAD_DEF[i - 1];
    });
    const ok = vals[0] < vals[1] && vals[1] < vals[2];
    const fin = ok ? vals : RAD_DEF;
    const w = parseFloat(document.getElementById("rad_win").value);
    const d = parseFloat(document.getElementById("rad_diff").value);
    const cmpEl = document.getElementById("rad_cmp");
    const o = {
      on: on.checked,
      src_in: document.getElementById("rad_src_in").value,
      src_out: document.getElementById("rad_src_out").value,
      win: (w >= 1 && w <= 120) ? Math.round(w) : 10,
      diff: d > 0 ? d : 50,
      cmp: cmpEl ? cmpEl.checked : radCfg().cmp
    };
    if (fin.some((x, i) => Math.abs(x - RAD_DEF[i]) > 0.0005)) o.thr = fin;
    SETTINGS.rad_ai = o;
  }
  return _applyParamSettingsPrevRad();
};