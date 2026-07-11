/* ============================================================
   AirVision Pro — локализация (11 языков).
   ДОБАВИТЬ язык: скопируйте блок, поменяйте код, переведите,
   впишите код в LANG_LIST. RTL-языки — в RTL_LANGS.
   ============================================================ */

const I18N = {
  en: { _name:"English (US)", login_title:"AirVision Pro", email:"Email", password:"Password", enter:"Sign in", err_login:"Wrong email or password",
    indoor:"Indoor", outdoor:"Outdoor", wifi:"WiFi", version:"Version", settings:"Settings", logout:"Sign out", theme:"Theme",
    advice_default:"Tips will appear as sensor data arrives.",
    to_now:"To present", wind_now:"Current", wind_freq:"Frequency, %",
    COMPASS:["N","NE","E","SE","S","SW","W","NW"],
    p_temp:"Temperature", p_rh:"Humidity", p_pressure:"Pressure", p_pm:"PM particles",
    p_rad:"Radiation", p_wind_spd:"Wind speed", p_wind_dir:"Wind direction", p_uv:"UV index", p_solar:"Solar rad.", p_lux:"Illuminance",
    p_no2:"NO₂", p_so2:"SO₂", p_no:"NO", p_co2:"CO₂", p_co:"CO", p_o3:"O₃", p_nh3:"NH₃", p_hcho:"CH₂O", p_aqi:"AQI" },

  ru: { _name:"Русский", login_title:"AirVision Pro", email:"Email", password:"Пароль", enter:"Войти", err_login:"Неверный email или пароль",
    indoor:"Дом", outdoor:"Улица", wifi:"WiFi", version:"Версия", settings:"Настройки", logout:"Выйти", theme:"Тема",
    advice_default:"Советы появятся по мере поступления данных с датчиков.",
    to_now:"К настоящему", wind_now:"Текущее", wind_freq:"Повторяемость, %",
    COMPASS:["С","СВ","В","ЮВ","Ю","ЮЗ","З","СЗ"],
    p_temp:"Температура", p_rh:"Влажность", p_pressure:"Давление", p_pm:"Частицы PM",
    p_rad:"Излучение", p_wind_spd:"Скорость ветра", p_wind_dir:"Направление ветра", p_uv:"УФ-индекс", p_solar:"Солн. радиация", p_lux:"Освещённость",
    p_no2:"NO₂", p_so2:"SO₂", p_no:"NO", p_co2:"CO₂", p_co:"CO", p_o3:"O₃", p_nh3:"NH₃", p_hcho:"CH₂O", p_aqi:"AQI" },

  "zh-CN": { _name:"中文（简体）", login_title:"AirVision Pro", email:"邮箱", password:"密码", enter:"登录", err_login:"邮箱或密码错误",
    indoor:"室内", outdoor:"室外", wifi:"WiFi", version:"版本", settings:"设置", logout:"退出", theme:"主题",
    advice_default:"数据到达后将显示提示。",
    to_now:"回到当前", wind_now:"当前", wind_freq:"频率, %",
    COMPASS:["北","东北","东","东南","南","西南","西","西北"],
    p_temp:"温度", p_rh:"湿度", p_pressure:"气压", p_pm:"PM颗粒物",
    p_rad:"辐射", p_wind_spd:"风速", p_wind_dir:"风向", p_uv:"紫外线指数", p_solar:"太阳辐射", p_lux:"照度",
    p_no2:"NO₂", p_so2:"SO₂", p_no:"NO", p_co2:"CO₂", p_co:"CO", p_o3:"O₃", p_nh3:"NH₃", p_hcho:"CH₂O", p_aqi:"AQI" },

  "zh-TW": { _name:"中文（繁體）", login_title:"AirVision Pro", email:"電子郵件", password:"密碼", enter:"登入", err_login:"電子郵件或密碼錯誤",
    indoor:"室內", outdoor:"室外", wifi:"WiFi", version:"版本", settings:"設定", logout:"登出", theme:"主題",
    advice_default:"資料到達後將顯示提示。",
    to_now:"回到目前", wind_now:"目前", wind_freq:"頻率, %",
    COMPASS:["北","東北","東","東南","南","西南","西","西北"],
    p_temp:"溫度", p_rh:"濕度", p_pressure:"氣壓", p_pm:"PM顆粒物",
    p_rad:"輻射", p_wind_spd:"風速", p_wind_dir:"風向", p_uv:"紫外線指數", p_solar:"太陽輻射", p_lux:"照度",
    p_no2:"NO₂", p_so2:"SO₂", p_no:"NO", p_co2:"CO₂", p_co:"CO", p_o3:"O₃", p_nh3:"NH₃", p_hcho:"CH₂O", p_aqi:"AQI" },

  es: { _name:"Español", login_title:"AirVision Pro", email:"Correo", password:"Contraseña", enter:"Entrar", err_login:"Correo o contraseña incorrectos",
    indoor:"Interior", outdoor:"Exterior", wifi:"WiFi", version:"Versión", settings:"Ajustes", logout:"Salir", theme:"Tema",
    advice_default:"Los consejos aparecerán a medida que lleguen los datos.",
    to_now:"Al presente", wind_now:"Actual", wind_freq:"Frecuencia, %",
    COMPASS:["N","NE","E","SE","S","SO","O","NO"],
    p_temp:"Temperatura", p_rh:"Humedad", p_pressure:"Presión", p_pm:"Partículas PM",
    p_rad:"Radiación", p_wind_spd:"Vel. viento", p_wind_dir:"Dir. viento", p_uv:"Índice UV", p_solar:"Rad. solar", p_lux:"Iluminancia",
    p_no2:"NO₂", p_so2:"SO₂", p_no:"NO", p_co2:"CO₂", p_co:"CO", p_o3:"O₃", p_nh3:"NH₃", p_hcho:"CH₂O", p_aqi:"AQI" },

  ar: { _name:"العربية", login_title:"AirVision Pro", email:"البريد الإلكتروني", password:"كلمة المرور", enter:"دخول", err_login:"بريد إلكتروني أو كلمة مرور غير صحيحة",
    indoor:"داخلي", outdoor:"خارجي", wifi:"واي فاي", version:"الإصدار", settings:"الإعدادات", logout:"خروج", theme:"السمة",
    advice_default:"ستظهر النصائح عند وصول بيانات المستشعرات.",
    to_now:"إلى الآن", wind_now:"الحالي", wind_freq:"التكرار, %",
    COMPASS:["ش","شق","ق","جق","ج","جغ","غ","شغ"],
    p_temp:"درجة الحرارة", p_rh:"الرطوبة", p_pressure:"الضغط", p_pm:"جسيمات PM",
    p_rad:"الإشعاع", p_wind_spd:"سرعة الرياح", p_wind_dir:"اتجاه الرياح", p_uv:"مؤشر UV", p_solar:"الإشعاع الشمسي", p_lux:"الإضاءة",
    p_no2:"NO₂", p_so2:"SO₂", p_no:"NO", p_co2:"CO₂", p_co:"CO", p_o3:"O₃", p_nh3:"NH₃", p_hcho:"CH₂O", p_aqi:"AQI" },

  hi: { _name:"हिन्दी", login_title:"AirVision Pro", email:"ईमेल", password:"पासवर्ड", enter:"साइन इन", err_login:"गलत ईमेल या पासवर्ड",
    indoor:"अंदर", outdoor:"बाहर", wifi:"WiFi", version:"संस्करण", settings:"सेटिंग्स", logout:"साइन आउट", theme:"थीम",
    advice_default:"सेंसर डेटा आने पर सुझाव दिखाई देंगे।",
    to_now:"वर्तमान तक", wind_now:"वर्तमान", wind_freq:"आवृत्ति, %",
    COMPASS:["उ","उपू","पू","दपू","द","दप","प","उप"],
    p_temp:"तापमान", p_rh:"आर्द्रता", p_pressure:"दबाव", p_pm:"PM कण",
    p_rad:"विकिरण", p_wind_spd:"हवा की गति", p_wind_dir:"हवा की दिशा", p_uv:"UV सूचकांक", p_solar:"सौर विकिरण", p_lux:"प्रकाश",
    p_no2:"NO₂", p_so2:"SO₂", p_no:"NO", p_co2:"CO₂", p_co:"CO", p_o3:"O₃", p_nh3:"NH₃", p_hcho:"CH₂O", p_aqi:"AQI" },

  "pt-BR": { _name:"Português (BR)", login_title:"AirVision Pro", email:"E-mail", password:"Senha", enter:"Entrar", err_login:"E-mail ou senha incorretos",
    indoor:"Interno", outdoor:"Externo", wifi:"WiFi", version:"Versão", settings:"Configurações", logout:"Sair", theme:"Tema",
    advice_default:"As dicas aparecerão conforme os dados chegarem.",
    to_now:"Ao presente", wind_now:"Atual", wind_freq:"Frequência, %",
    COMPASS:["N","NE","L","SE","S","SO","O","NO"],
    p_temp:"Temperatura", p_rh:"Umidade", p_pressure:"Pressão", p_pm:"Partículas PM",
    p_rad:"Radiação", p_wind_spd:"Vel. vento", p_wind_dir:"Dir. vento", p_uv:"Índice UV", p_solar:"Rad. solar", p_lux:"Iluminância",
    p_no2:"NO₂", p_so2:"SO₂", p_no:"NO", p_co2:"CO₂", p_co:"CO", p_o3:"O₃", p_nh3:"NH₃", p_hcho:"CH₂O", p_aqi:"AQI" },

  fr: { _name:"Français", login_title:"AirVision Pro", email:"E-mail", password:"Mot de passe", enter:"Se connecter", err_login:"E-mail ou mot de passe incorrect",
    indoor:"Intérieur", outdoor:"Extérieur", wifi:"WiFi", version:"Version", settings:"Paramètres", logout:"Déconnexion", theme:"Thème",
    advice_default:"Les conseils apparaîtront à mesure que les données arrivent.",
    to_now:"Au présent", wind_now:"Actuel", wind_freq:"Fréquence, %",
    COMPASS:["N","NE","E","SE","S","SO","O","NO"],
    p_temp:"Température", p_rh:"Humidité", p_pressure:"Pression", p_pm:"Particules PM",
    p_rad:"Radiation", p_wind_spd:"Vit. vent", p_wind_dir:"Dir. vent", p_uv:"Indice UV", p_solar:"Rad. solaire", p_lux:"Éclairement",
    p_no2:"NO₂", p_so2:"SO₂", p_no:"NO", p_co2:"CO₂", p_co:"CO", p_o3:"O₃", p_nh3:"NH₃", p_hcho:"CH₂O", p_aqi:"AQI" },

  de: { _name:"Deutsch", login_title:"AirVision Pro", email:"E-Mail", password:"Passwort", enter:"Anmelden", err_login:"Falsche E-Mail oder Passwort",
    indoor:"Innen", outdoor:"Außen", wifi:"WLAN", version:"Version", settings:"Einstellungen", logout:"Abmelden", theme:"Thema",
    advice_default:"Tipps erscheinen, sobald Sensordaten eintreffen.",
    to_now:"Zur Gegenwart", wind_now:"Aktuell", wind_freq:"Häufigkeit, %",
    COMPASS:["N","NO","O","SO","S","SW","W","NW"],
    p_temp:"Temperatur", p_rh:"Luftfeuchte", p_pressure:"Luftdruck", p_pm:"PM-Partikel",
    p_rad:"Strahlung", p_wind_spd:"Windgeschw.", p_wind_dir:"Windrichtung", p_uv:"UV-Index", p_solar:"Solarstrahlung", p_lux:"Beleuchtung",
    p_no2:"NO₂", p_so2:"SO₂", p_no:"NO", p_co2:"CO₂", p_co:"CO", p_o3:"O₃", p_nh3:"NH₃", p_hcho:"CH₂O", p_aqi:"AQI" },

  ja: { _name:"日本語", login_title:"AirVision Pro", email:"メール", password:"パスワード", enter:"ログイン", err_login:"メールまたはパスワードが違います",
    indoor:"屋内", outdoor:"屋外", wifi:"WiFi", version:"バージョン", settings:"設定", logout:"ログアウト", theme:"テーマ",
    advice_default:"センサーデータが届くとヒントが表示されます。",
    to_now:"現在へ", wind_now:"現在", wind_freq:"頻度, %",
    COMPASS:["北","北東","東","南東","南","南西","西","北西"],
    p_temp:"気温", p_rh:"湿度", p_pressure:"気圧", p_pm:"PM粒子",
    p_rad:"放射線", p_wind_spd:"風速", p_wind_dir:"風向", p_uv:"UV指数", p_solar:"日射", p_lux:"照度",
    p_no2:"NO₂", p_so2:"SO₂", p_no:"NO", p_co2:"CO₂", p_co:"CO", p_o3:"O₃", p_nh3:"NH₃", p_hcho:"CH₂O", p_aqi:"AQI" }
};

const LANG_LIST = ["en","ru","zh-CN","zh-TW","es","ar","hi","pt-BR","fr","de","ja"];
const RTL_LANGS = ["ar"];

function getLang() { return localStorage.getItem("avp_lang") || "en"; }
function setLang(code) { localStorage.setItem("avp_lang", code); applyLang(); }
function t(key) {
  const lang = getLang();
  return (I18N[lang] && I18N[lang][key] !== undefined) ? I18N[lang][key] : (I18N.en[key] !== undefined ? I18N.en[key] : key);
}
function applyLang() {
  const lang = getLang();
  document.documentElement.setAttribute("dir", RTL_LANGS.includes(lang) ? "rtl" : "ltr");
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
  applyTheme(); buildLangMenu(); applyLang();
  const btn = document.getElementById("lang-btn");
  const menu = document.getElementById("lang-menu");
  if (btn && menu) {
    btn.onclick = e => { e.stopPropagation(); menu.classList.toggle("open"); };
    document.addEventListener("click", () => menu.classList.remove("open"));
  }
}
document.addEventListener("DOMContentLoaded", initUI);