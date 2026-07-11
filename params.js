/* ============================================================
   AirVision Pro — конфиги параметров (вкладок).
   Каждый блок КРОШЕЧНЫЙ и независимый.
     loc:  "out" | "in" | "both" | "pressure"
     type: (опц.) "compass" — рисуется роза ветров вместо графика
     lines:(опц.) несколько ключей на одном графике (для PM)
   ============================================================ */

const PARAMS = [
  { key:"temp", i18n:"p_temp", unit:"°C", loc:"both", round:"choice", color:"#4db2ff" },

  { key:"rh", i18n:"p_rh", unit:"%", loc:"both", round:0, color:"#4dff9d" },

  { key:"pressure", i18n:"p_pressure", unit:"гПа", loc:"pressure", round:0, color:"#ffcf4d",
    comments:[
      { max:970,  text:"Аномально низкое" },
      { max:1000, text:"Низкое" },
      { max:1025, text:"Нормальное" },
      { max:1040, text:"Высокое" },
      { max:9999, text:"Аномально высокое" }
    ] },

  // ВСЕ частицы PM — одна вкладка, 5 линий на одном графике:
  { key:"pm", i18n:"p_pm", unit:"мкг/м³", loc:"out", round:0,
    lines:[
      { dbkey:"pm10", label:"PM10",  color:"#b98cff" },
      { dbkey:"pm4",  label:"PM4",   color:"#9d7bff" },
      { dbkey:"pm25", label:"PM2.5", color:"#8c6bff" },
      { dbkey:"pm1",  label:"PM1",   color:"#7b5bff" },
      { dbkey:"pm05", label:"PM0.5", color:"#6a4bff" }
    ] },

  { key:"rad", i18n:"p_rad", unit:"мкЗв/ч", loc:"in", round:2, color:"#ff6b6b", algo:"j305" },

  { key:"wind_spd", i18n:"p_wind_spd", unit:"м/с", loc:"out", round:1, color:"#4dd2ff" },

  // направление ветра — кастомный компас:
  { key:"wind_dir", i18n:"p_wind_dir", unit:"°", loc:"out", type:"compass", color:"#4da6ff" },

  { key:"uv",    i18n:"p_uv",    unit:"",      loc:"out",  round:1, color:"#ff9d4d" },
  { key:"solar", i18n:"p_solar", unit:"Вт/м²", loc:"out",  round:0, color:"#ffb84d" },
  { key:"lux",   i18n:"p_lux",   unit:"лк",    loc:"both", round:0, color:"#ffe14d" },

  { key:"no2",  i18n:"p_no2",  unit:"мкг/м³", loc:"out",  round:0, color:"#ff7bce" },
  { key:"so2",  i18n:"p_so2",  unit:"мкг/м³", loc:"out",  round:0, color:"#ff6bb0" },
  { key:"no",   i18n:"p_no",   unit:"мкг/м³", loc:"out",  round:0, color:"#ff5b92" },
  { key:"co2",  i18n:"p_co2",  unit:"ppm",    loc:"in",   round:0, color:"#6bffb0" },
  { key:"co",   i18n:"p_co",   unit:"мг/м³",  loc:"both", round:1, color:"#ff8c6b" },
  { key:"o3",   i18n:"p_o3",   unit:"мкг/м³", loc:"out",  round:0, color:"#6bd2ff" },
  { key:"nh3",  i18n:"p_nh3",  unit:"мкг/м³", loc:"out",  round:0, color:"#a0ff6b" },
  { key:"hcho", i18n:"p_hcho", unit:"мг/м³",  loc:"in",   round:2, color:"#ff6bff" },

  { key:"aqi", i18n:"p_aqi", unit:"", loc:"out", round:0, color:"#ffffff" }
];

function commentFor(param, value) {
  if (!param.comments) return "";
  for (const c of param.comments) if (value <= c.max) return c.text;
  return "";
}