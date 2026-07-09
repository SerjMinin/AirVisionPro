/* ============================================================
   AirVision Pro — локализация (языки интерфейса).
   Чтобы ДОБАВИТЬ свой язык: скопируйте любой блок ниже,
   поменяйте код ("de", "fr"...) и переведите значения.
   Добавьте язык также в массив LANG_LIST.
   ============================================================ */

const I18N = {
  ru: {
    _name: "Русский",
    login_title: "AirVision Pro",
    email: "Email",
    password: "Пароль",
    enter: "Войти",
    err_login: "Неверный email или пароль"
  },
  en: {
    _name: "English (US)",
    login_title: "AirVision Pro",
    email: "Email",
    password: "Password",
    enter: "Sign in",
    err_login: "Wrong email or password"
  },
  zh: {
    _name: "中文（简体）",
    login_title: "AirVision Pro",
    email: "邮箱",
    password: "密码",
    enter: "登录",
    err_login: "邮箱或密码错误"
  }
};

// Список языков для меню глобуса (порядок = порядок в меню):
const LANG_LIST = ["ru", "en", "zh"];

/* ---- Служебное: хранение и применение языка ---- */
function getLang() {
  return localStorage.getItem("avp_lang") || "ru";
}
function setLang(code) {
  localStorage.setItem("avp_lang", code);
  applyLang();
}
function t(key) {
  const lang = getLang();
  return (I18N[lang] && I18N[lang][key]) || (I18N.ru[key] || key);
}
// Проставляет переводы во все элементы с атрибутом data-i18n:
function applyLang() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  document.querySelectorAll("[data-i18n-ph]").forEach(el => {
    el.placeholder = t(el.getAttribute("data-i18n-ph"));
  });
}

/* ---- Служебное: тема ---- */
function getTheme() {
  return localStorage.getItem("avp_theme") || "dark";
}
function setTheme(name) {
  localStorage.setItem("avp_theme", name);
  document.documentElement.setAttribute("data-theme", name);
}
function applyTheme() {
  document.documentElement.setAttribute("data-theme", getTheme());
}

/* ---- Построение меню глобуса ---- */
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

/* ---- Запуск при загрузке страницы ---- */
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