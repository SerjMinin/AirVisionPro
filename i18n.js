/* ============================================================
   AirVision Pro — локализация.
   ДОБАВИТЬ свой язык: скопируйте блок, поменяйте код и переведите,
   затем впишите код в LANG_LIST.
   ============================================================ */

const I18N = {
  ru: {
    _name: "Русский",
    login_title: "AirVision Pro", email: "Email", password: "Пароль",
    enter: "Войти", err_login: "Неверный email или пароль",
    indoor: "Дом", outdoor: "Улица", wifi: "WiFi", version: "Версия",
    settings: "Настройки", logout: "Выйти", theme: "Тема",
    advice_default: "Советы появятся по мере поступления данных с датчиков.",
    p_temp: "Температура", p_rh: "Влажность", p_pressure: "Давление",
    p_pm10: "PM10", p_pm4: "PM4", p_pm25: "PM2.5", p_pm1: "PM1", p_pm05: "PM0.5",
    p_rad: "Излучение", p_wind_spd: "Скорость ветра", p_wind_dir: "Направление ветра",
    p_uv: "УФ-индекс", p_solar: "Солн. радиация", p_lux: "Освещённость",
    p_no2: "NO₂", p_so2: "SO₂", p_no: "NO", p_co2: "CO₂", p_co: "CO",
    p_o3: "O₃", p_nh3: "NH₃", p_hcho: "CH₂O", p_aqi: "AQI"
  },
  en: {
    _name: "English (US)",
    login_title: "AirVision Pro", email: "Email", password: "Password",
    enter: "Sign in", err_login: "Wrong email or password",
    indoor: "Indoor", outdoor: "Outdoor", wifi: "WiFi", version: "Version",
    settings: "Settings", logout: "Sign out", theme: "Theme",
    advice_default: "Tips will appear as sensor data arrives.",
    p_temp: "Temperature", p_rh: "Humidity", p_pressure: "Pressure",
    p_pm10: "PM10", p_pm4: "PM4", p_pm25: "PM2.5", p_pm1: "PM1", p_pm05: "PM0.5",
    p_rad: "Radiation", p_wind_spd: "Wind speed", p_wind_dir: "Wind direction",
    p_uv: "UV index", p_solar: "Solar rad.", p_lux: "Illuminance",
    p_no2: "NO₂", p_so2: "SO₂", p_no: "NO", p_co2: "CO₂", p_co: "CO",
    p_o3: "O₃", p_nh3: "NH₃", p_hcho: "CH₂O", p_aqi: "AQI"
  },
  zh: {
    _name: "中文（简体）",
    login_title: "AirVision Pro", email: "邮箱", password: "密码",
    enter: "登录", err_login: "邮箱或密码错误",
    indoor: "室内", outdoor: "室外", wifi: "WiFi", version: "版本",
    settings: "设置", logout: "退出", theme: "主题",
    advice_default: "数据到达后将显示提示。",
    p_temp: "温度", p_rh: "湿度", p_pressure: "气压",
    p_pm10: "PM10", p_pm4: "PM4", p_pm25: "PM2.5", p_pm1: "PM1", p_pm05: "PM0.5",
    p_rad: "辐射", p_wind_spd: "风速", p_wind_dir: "风向",
    p_uv: "紫外线指数", p_solar: "太阳辐射", p_lux: "照度",
    p_no2: "NO₂", p_so2: "SO₂", p_no: "NO", p_co2: "CO₂", p_co: "CO",
    p_o3: "O₃", p_nh3: "NH₃", p_hcho: "CH₂O", p_aqi: "AQI"
  }
};

const LANG_LIST = ["ru", "en", "zh"];

function getLang() { return localStorage.getItem("avp_lang") || "ru"; }
function setLang(code) { localStorage.setItem("avp_lang", code); applyLang(); }
function t(key) {
  const lang = getLang();
  return (I18N[lang] && I18N[lang][key]) || (I18N.ru[key] || key);
}
function applyLang() {
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.getAttribute("data-i18n")); });
  document.querySelectorAll("[data-i18n-ph]").forEach(el => { el.placeholder = t(el.getAttribute("data-i18n-ph")); });
  if (typeof onLangChanged === "function") onLangChanged();
}

function getTheme() { return localStorage.getItem("avp_theme") || "dark"; }
function setTheme(name) {
  localStorage.setItem("avp_theme", name);
  document.documentElement.setAttribute("data-theme", name);
  if (typeof onThemeChanged === "function") onThemeChanged();
}
function applyTheme() { document.documentElement.setAttribute("data-theme", getTheme()); }

function buildLangMenu() {
  const menu = document.getElementById("lang-menu");
  if (!menu) return;
  menu.innerHTML = "";
  LANG_LIST.forEach(code => {
    const b = document.createElement("button");
    b.textContent = I18N[code]._name;
    b.onclick = () => { setLang(code); menu.classList.remove("open"); };
    menu.appendChild(b);
  });
}

function initUI() {
  applyTheme();
  buildLangMenu();
  applyLang();
  const btn = document.getElementById("lang-btn");
  const menu = document.getElementById("lang-menu");
  if (btn && menu) {
    btn.onclick = e => { e.stopPropagation(); menu.classList.toggle("open"); };
    document.addEventListener("click", () => menu.classList.remove("open"));
  }
}
document.addEventListener("DOMContentLoaded", initUI);