/* ============================================================
   AirVision Pro — окно настроек (модальное). Хранение в Supabase.
   ============================================================ */

let SETTINGS = null;

const DEFAULT_SETTINGS = {
  config: "full",
  sn_out: "OUT-0001", sn_in: "IN-0001",
  lat: 55.752793, lon: 37.622672, alt_sea: 150, alt_ground: 5,
  temp_round: 1,
  units: { temp:"C", pressure:"hPa", wind_spd:"ms", rad:"uSv", co2:"ppm", co:"mgm3" },
  pressure_thr: { anom_low:970, low:1000, normal:1025, high:1040 },
  sources: { "sensor":true, "open-meteo":true, "owm":true },
  tabs: {}
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

function buildSettingsForm() {
  const s = SETTINGS;
  const unitNames = { temp:"p_temp", pressure:"p_pressure", wind_spd:"p_wind_spd", rad:"p_rad", co2:"p_co2", co:"p_co" };
  const unitRows = Object.keys(UNITS).map(g =>
    `<div class="set-row"><label>${t(unitNames[g])}</label>${selHtml("u_"+g, UNITS[g].opts, s.units[g])}</div>`).join("");

  const srcRows = [["sensor","Датчик"],["open-meteo","Open-Meteo"],["owm","OpenWeatherMap"]]
    .map(([id,label]) => `<label class="set-check"><input type="checkbox" id="src_${id}" ${s.sources[id]!==false?"checked":""}> ${label}</label>`).join("");

  const tabRows = PARAMS.map(p =>
    `<label class="set-check"><input type="checkbox" id="tab_${p.key}" ${s.tabs[p.key]!==false?"checked":""}> ${t(p.i18n)}</label>`).join("");

  document.getElementById("settings-body").innerHTML = `
    <div class="set-section"><h3>${t("set_config")}</h3>
      <div class="set-row"><label><input type="radio" name="cfg" value="site" ${s.config==="site"?"checked":""}> ${t("cfg_site")}</label></div>
      <div class="set-row"><label><input type="radio" name="cfg" value="outdoor" ${s.config==="outdoor"?"checked":""}> ${t("cfg_out")}</label></div>
      <div class="set-row"><label><input type="radio" name="cfg" value="full" ${s.config==="full"?"checked":""}> ${t("cfg_full")}</label></div>
    </div>
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
    <div class="set-section"><h3>${t("set_units")}</h3>
      ${unitRows}
      <div class="set-row"><label>${t("set_rounding")}</label>${selHtml("s_round", [{id:"0",label:t("round_int")},{id:"1",label:t("round_1")}], String(s.temp_round))}</div>
    </div>
    <div class="set-section"><h3>${t("set_pressure_thr")} (гПа)</h3>
      <div class="set-row"><label>${t("thr_anom_low")}</label><input id="thr_al" class="set-input" type="number" value="${s.pressure_thr.anom_low}"></div>
      <div class="set-row"><label>${t("thr_low")}</label><input id="thr_l" class="set-input" type="number" value="${s.pressure_thr.low}"></div>
      <div class="set-row"><label>${t("thr_normal")}</label><input id="thr_n" class="set-input" type="number" value="${s.pressure_thr.normal}"></div>
      <div class="set-row"><label>${t("thr_high")}</label><input id="thr_h" class="set-input" type="number" value="${s.pressure_thr.high}"></div>
    </div>
    <div class="set-section"><h3>${t("set_sources")}</h3>${srcRows}</div>
    <div class="set-section"><h3>${t("set_tabs")}</h3><div class="set-tabs-grid">${tabRows}</div></div>
  `;
}

function readSettingsForm() {
  const s = SETTINGS;
  const cfg = document.querySelector('input[name="cfg"]:checked'); if (cfg) s.config = cfg.value;
  s.sn_out = document.getElementById("s_sn_out").value.trim();
  s.sn_in  = document.getElementById("s_sn_in").value.trim();
  s.lat = parseFloat(document.getElementById("s_lat").value);
  s.lon = parseFloat(document.getElementById("s_lon").value);
  s.alt_sea = parseFloat(document.getElementById("s_alt_sea").value);
  s.alt_ground = parseFloat(document.getElementById("s_alt_ground").value);
  s.temp_round = parseInt(document.getElementById("s_round").value);
  Object.keys(UNITS).forEach(g => { s.units[g] = document.getElementById("u_"+g).value; });
  s.pressure_thr = {
    anom_low: parseFloat(document.getElementById("thr_al").value),
    low: parseFloat(document.getElementById("thr_l").value),
    normal: parseFloat(document.getElementById("thr_n").value),
    high: parseFloat(document.getElementById("thr_h").value)
  };
  ["sensor","open-meteo","owm"].forEach(id => { s.sources[id] = document.getElementById("src_"+id).checked; });
  s.tabs = {}; PARAMS.forEach(p => { s.tabs[p.key] = document.getElementById("tab_"+p.key).checked; });
}

function openSettings() {
  buildSettingsForm();
  document.getElementById("settings-modal").classList.add("open");
}
function closeSettings() { document.getElementById("settings-modal").classList.remove("open"); }
async function applySettings() {
  readSettingsForm();
  await saveSettings();
  closeSettings();
  buildTabs(); renderParam(currentKey);
}