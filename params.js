/* ============================================================
   AirVision Pro — конфиги всех параметров (вкладок).
   Каждый блок КРОШЕЧНЫЙ и независимый. Чтобы поправить параметр —
   меняйте только его блок. Чтобы добавить параметр — скопируйте блок.

   Поля:
     key       — код параметра (совпадает с key в базе measurements)
     i18n      — ключ названия из i18n.js
     unit      — единицы измерения
     loc       — "out" | "in" | "both" | "pressure"
                 out=Улица, in=Дом, both=два графика (улица+дом),
                 pressure=особый (все источники в один уличный график)
     round     — знаков после запятой (0 = целое); "choice" = выбор целое/1 знак
     color     — цвет линии датчика
     comments  — (опц.) пороги с текстом (для давления и т.п.)
     algo      — (опц.) спец-обработка ("j305" для трубки Гейгера)
   ============================================================ */

const PARAMS = [
  // ----- стартовый: температура (датчик + интернет) -----
  { key:"temp", i18n:"p_temp", unit:"°C", loc:"both", round:"choice", color:"#4db2ff" },

  { key:"rh",       i18n:"p_rh",       unit:"%",     loc:"both",     round:0, color:"#4dff9d" },

  // давление — ВСЕ источники в один «уличный» график
  { key:"pressure", i18n:"p_pressure", unit:"гПа",   loc:"pressure", round:0, color:"#ffcf4d",
    comments:[
      { max:970,  text:"Аномально низкое" },
      { max:1000, text:"Низкое" },
      { max:1025, text:"Нормальное" },
      { max:1040, text:"Высокое" },
      { max:9999, text:"Аномально высокое" }
    ] },

  // взвешенные частицы (улица)
  { key:"pm10", i18n:"p_pm10", unit:"мкг/м³", loc:"out", round:0, color:"#b98cff" },
  { key:"pm4",  i18n:"p_pm4",  unit:"мкг/м³", loc:"out", round:0, color:"#9d7bff" },
  { key:"pm25", i18n:"p_pm25", unit:"мкг/м³", loc:"out", round:0, color:"#8c6bff" },
  { key:"pm1",  i18n:"p_pm1",  unit:"мкг/м³", loc:"out", round:0, color:"#7b5bff" },
  { key:"pm05", i18n:"p_pm05", unit:"мкг/м³", loc:"out", round:0, color:"#6a4bff" },

  // ионизирующее излучение (дом), спец-алгоритм J305
  { key:"rad", i18n:"p_rad", unit:"мкЗв/ч", loc:"in", round:2, color:"#ff6b6b", algo:"j305" },

  // ветер (улица)
  { key:"wind_spd", i18n:"p_wind_spd", unit:"м/с", loc:"out", round:1, color:"#4dd2ff" },
  { key:"wind_dir", i18n:"p_wind_dir", unit:"°",   loc:"out", round:0, color:"#4da6ff" },

  // свет и радиация (улица/оба)
  { key:"uv",    i18n:"p_uv",    unit:"",       loc:"out",  round:1, color:"#ff9d4d" },
  { key:"solar", i18n:"p_solar", unit:"Вт/м²",  loc:"out",  round:0, color:"#ffb84d" },
  { key:"lux",   i18n:"p_lux",   unit:"лк",     loc:"both", round:0, color:"#ffe14d" },

  // газы
  { key:"no2",  i18n:"p_no2",  unit:"мкг/м³", loc:"out",  round:0, color:"#ff7bce" },
  { key:"so2",  i18n:"p_so2",  unit:"мкг/м³", loc:"out",  round:0, color:"#ff6bb0" },
  { key:"no",   i18n:"p_no",   unit:"мкг/м³", loc:"out",  round:0, color:"#ff5b92" },
  { key:"co2",  i18n:"p_co2",  unit:"ppm",    loc:"in",   round:0, color:"#6bffb0" },
  { key:"co",   i18n:"p_co",   unit:"мг/м³",  loc:"both", round:1, color:"#ff8c6b" },
  { key:"o3",   i18n:"p_o3",   unit:"мкг/м³", loc:"out",  round:0, color:"#6bd2ff" },
  { key:"nh3",  i18n:"p_nh3",  unit:"мкг/м³", loc:"out",  round:0, color:"#a0ff6b" },
  { key:"hcho", i18n:"p_hcho", unit:"мг/м³",  loc:"in",   round:2, color:"#ff6bff" },

  // индекс качества воздуха (улица)
  { key:"aqi", i18n:"p_aqi", unit:"", loc:"out", round:0, color:"#ffffff" }
];

/* Комментарий по значению (для давления и подобных): */
function commentFor(param, value) {
  if (!param.comments) return "";
  for (const c of param.comments) if (value <= c.max) return c.text;
  return "";
}