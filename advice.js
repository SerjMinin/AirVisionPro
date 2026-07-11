/* AirVision Pro — каталог умных советов.
   loc: "in" (дом) | "out" (улица) | "sys" (система/диагностика)
   crit: true — критический (красным, впереди)
   Требования к данным: needs config full для "in"; outdoor/full для "out". */

const ADVICE_LIST = [
  { id:"cond_home",      loc:"in",  crit:false, text:"Дом. Высокий риск конденсата, проветрите." },
  { id:"cond_out",       loc:"out", crit:false, text:"Улица. Высокий риск конденсата." },
  { id:"frost_out",      loc:"out", crit:false, text:"Улица. Высокий риск инея." },
  { id:"smog_winter",    loc:"out", crit:false, text:"Улица. Высокий риск зимнего смога." },
  { id:"smog_summer",    loc:"out", crit:false, text:"Улица. Высокий риск летнего смога." },
  { id:"vent_humidity",  loc:"in",  crit:false, text:"Дом. Проветривание сейчас снизит влажность в комнате на ~15%, включите увлажнитель." },
  { id:"laundry_musty",  loc:"out", crit:false, text:"Улица. Бельё будет сохнуть долго, возможен запах затхлости." },
  { id:"vent_mold",      loc:"in",  crit:false, text:"Дом. Включите вентиляцию, чтобы избежать грибка." },
  { id:"sun_danger",     loc:"out", crit:false, text:"Улица. Опасное солнце — наденьте закрытую одежду и головной убор." },
  { id:"sleep_co2",      loc:"in",  crit:false, text:"Дом. Качество сна: сон был неэффективным из-за высокого CO₂ (духота). Проветривайте комнату." },
  { id:"sleep_temp",     loc:"in",  crit:false, text:"Дом. Качество сна: сон был неэффективным из-за высокой температуры. Проветривайте комнату." },
  { id:"chem_home",      loc:"in",  crit:true,  text:"Дом. Обнаружено химическое загрязнение, включите очиститель воздуха." },
  { id:"chem_out",       loc:"out", crit:true,  text:"Улица. Обнаружено химическое загрязнение, закройте окна." },
  { id:"rad_home",       loc:"in",  crit:true,  text:"Дом. Превышение радиоактивного фона, закройте окна. Избегайте вдыхания пыли." },
  { id:"vent_open",      loc:"in",  crit:false, text:"Дом. Режим проветривания. Откройте окна — свежий воздух." },
  { id:"vent_close",     loc:"in",  crit:false, text:"Дом. Режим проветривания. Закройте окна — уличный воздух загрязнён." },
  { id:"dry_home_ok",    loc:"in",  crit:false, text:"Дом. Хорошо сушить бельё дома." },
  { id:"dry_out_ideal",  loc:"out", crit:false, text:"Улица. Идеально сушить бельё на улице." },
  { id:"dry_home_wet",   loc:"in",  crit:false, text:"Дом. На улице сыро, сушите бельё дома." },
  { id:"fire_co2",       loc:"in",  crit:true,  text:"Дом. Резкий скачок CO₂. Проверьте, нет ли пожара. Откройте окна." },
  { id:"fire_co",        loc:"in",  crit:true,  text:"Дом. Резкий скачок CO. Проверьте дымоход. Откройте окна." },
  { id:"batt_forecast",  loc:"in",  crit:false, text:"Дом. Прогноз времени до полной разрядки аккумулятора." },
  { id:"infection",      loc:"out", crit:false, text:"Улица. Сейчас в общественных местах высока вероятность заразиться." },
  { id:"asthma",         loc:"out", crit:false, text:"Улица. Сегодня высокий риск приступов астмы." },
  { id:"weather_head",   loc:"out", crit:false, text:"Улица. Резкое изменение погоды. Возможны головные боли у метеозависимых." },
  // --- добавлено ИИ ---
  { id:"air_dry",        loc:"in",  crit:false, text:"Дом. Воздух пересушен (влажность < 30%), включите увлажнитель." },
  { id:"sleep_good",     loc:"in",  crit:false, text:"Дом. Оптимальные условия для сна: проветрено, прохладно, тихо." },
  { id:"filter_change",  loc:"in",  crit:false, text:"Дом. Пора менять фильтр очистителя — растёт фоновый PM." },
  { id:"ice_risk",       loc:"out", crit:false, text:"Улица. Гололёд: температура у нуля при высокой влажности." },
  { id:"walk_ok",        loc:"out", crit:false, text:"Улица. Комфортно для прогулки и спорта — воздух чистый." },
  { id:"wind_strong",    loc:"out", crit:false, text:"Улица. Сильный ветер, закрепите лёгкие предметы." },
  { id:"module_degrade", loc:"sys", crit:false, text:"Диагностика. Высока вероятность деградации модуля — дрейф/расхождение показаний." },
  { id:"batt_left",      loc:"sys", crit:false, text:"Питание. Аккумулятор разряжается, показываю остаток заряда и время работы." },
  { id:"adaptive_bright",loc:"sys", crit:false, text:"Дисплей. Включена адаптивная яркость по датчику освещённости." }
].sort((a,b) => a.text.localeCompare(b.text, "ru"));

/* доступен ли совет при текущей конфигурации */
function adviceAvailable(item, cfg) {
  if (item.loc === "in")  return cfg === "full";              // нужно домашнее устройство
  if (item.loc === "out") return cfg === "outdoor" || cfg === "full";
  return true;                                                // sys — всегда
}