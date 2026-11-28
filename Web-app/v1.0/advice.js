/* 
 * Copyright (c) 2026 Минин Сергей Александрович.
 * Licensed under the GNU Affero General Public License v3.0.
 * See LICENSE file in the project root for full license information.
 */

/*
 * AirVisionPro — Smart Advice catalog (all checkboxes active by default).
 * crit=true — the advice is shown in red and is placed first.
 */

/*
 * =====================================================================
 *  FILE STRUCTURE
 * =====================================================================
 *  This file only DESCRIBES the advice. It contains no trigger logic.
 *  It defines one global array, ADVICE_LIST, used by settings.js
 *  (the "Smart advice" settings window) and app.js (the bottom advice line).
 *
 *  Entry fields:
 *    id    — unique and permanent: "a" + number. Never renumber, never reuse.
 *            Gaps in the numbering are normal: they are removed duplicates.
 *            The id is stored in user settings (SETTINGS.advice) and in app.js.
 *            Next free id: a122.
 *    crit  — true: always shown as red, shown ahead of the others.
 *    color — optional default importance level (user can override it in the
 *            "Настройка" window). No color = white (informational):
 *              "#ffcf4d" yellow       — pay attention
 *              "#ff9d4d" pink         — harmful for sensitive groups
 *              "#ff4d4d" red          — dangerous
 *              "#d62839" dark red     — very dangerous
 *              "#a4133c" burgundy     — extreme
 *    text  — advice text (Russian; translation into 11 languages is a later task).
 *
 *  The array has two parts:
 *    PART 1 (a01–a74)  — advice WITHOUT trigger conditions (catalog texts
 *                        only). Grouped by topic. Conditions are being
 *                        added topic by topic.
 *    PART 2 (a75–a121) — advice WITH trigger conditions (thresholds,
 *                        sources and logic live in app.js / settings.js).
 *
 *  Order inside the source file is by topic; at the end of the file the
 *  array is sorted by the id number, so the final order is a01, a02, ...
 *
 *  How to add a new advice: take the next free id, add one line to the
 *  proper topic below, keep the id order rule (sorted automatically).
 * =====================================================================
 */

const ADVICE_LIST = [

/* =====================================================================
 *  PART 1 — advice WITHOUT trigger conditions (a01–a74)
 * ===================================================================== */

  /* ----- Pressure ----- */
  { id:"a01", crit:false, color:"#ff9d4d", text:"Аномально высокое давление." },
  { id:"a02", crit:false, color:"#ff9d4d", text:"Аномально низкое давление." },
  { id:"a10", crit:false, color:"#ffcf4d", text:"Высокое давление." },
  { id:"a34", crit:false, color:"#ffcf4d", text:"Низкое давление." },

  /* ----- Temperature, frost, ice ----- */
  { id:"a07", crit:false, color:"#ffcf4d", text:"Высокий риск инея." },
  { id:"a11", crit:false, color:"#ff9d4d", text:"Гололёд: температура у нуля при высокой влажности." },
  { id:"a29", crit:false, color:"#ff4d4d", text:"На улице очень жарко." },
  { id:"a31", crit:false, color:"#ff4d4d", text:"На улице очень холодно." },

  /* ----- Humidity, laundry, ventilation ----- */
  { id:"a03", crit:false, text:"Бельё будет сохнуть долго, возможен запах затхлости." },
  { id:"a04", crit:false, color:"#ffcf4d", text:"Включите вентиляцию, чтобы избежать грибка." },
  { id:"a08", crit:false, color:"#ffcf4d", text:"Высокий риск конденсата, проветрите." },
  { id:"a16", crit:false, text:"Идеально сушить бельё на улице." },
  { id:"a33", crit:false, text:"На улице сыро, сушите бельё дома." },
  { id:"a59", crit:false, text:"Проветривание сейчас снизит влажность в комнате на ~15%, включите увлажнитель." },
  { id:"a61", crit:false, color:"#ffcf4d", text:"Режим проветривания. Закройте окна — уличный воздух загрязнён." },
  { id:"a62", crit:false, text:"Режим проветривания. Откройте окна — свежий воздух." },

  /* ----- Air quality: smog, AQI, particles, chemistry, health ----- */
  { id:"a06", crit:false, color:"#ff9d4d", text:"Высокий риск зимнего смога." },
  { id:"a09", crit:false, color:"#ff9d4d", text:"Высокий риск летнего смога." },
  { id:"a14", crit:false, color:"#ff9d4d", text:"Дома высокий (это плохо) индекс качества воздуха — AQI." },
  { id:"a15", crit:false, color:"#ffcf4d", text:"Дома пора менять фильтр очистителя — растёт фоновый PM." },
  { id:"a46", crit:false, color:"#ffcf4d", text:"Превышен порог PM0.5." },
  { id:"a35", crit:true,  color:"#ff4d4d", text:"Обнаружено химическое загрязнение, включите очиститель воздуха." },
  { id:"a36", crit:true,  color:"#ff4d4d", text:"Обнаружено химическое загрязнение, закройте окна." },
  { id:"a66", crit:false, color:"#ff9d4d", text:"Сегодня высокий риск приступов астмы." },
  { id:"a68", crit:false, color:"#ffcf4d", text:"Сейчас в общественных местах высока вероятность заразиться ОРВИ." },

  /* ----- AQI levels (colors as the dashed lines on the chart) ----- */
  { id:"a70", crit:false, color:"#ffcf4d", text:"AQI 51–100: качество воздуха приемлемое. Чувствительным людям стоит меньше времени проводить на улице." },
  { id:"a71", crit:false, color:"#ff9d4d", text:"AQI 101–150: воздух вреден для чувствительных групп — детей, пожилых, людей с болезнями лёгких и сердца." },
  { id:"a72", crit:false, color:"#ff4d4d", text:"AQI 151–200: воздух вреден для всех. Не рекомендуется долгая нагрузка на открытом воздухе." },
  { id:"a73", crit:false, color:"#d62839", text:"AQI 201–300: очень вредный воздух. Всем рекомендуется оставаться в помещении." },
  { id:"a74", crit:false, color:"#a4133c", text:"AQI 301–500: опасный воздух. Выходить на улицу опасно без средств защиты." },

  /* ----- CO₂ levels (ranges do not overlap) and sudden CO / CO₂ jumps ----- */
  { id:"a53", crit:false, color:"#ffcf4d", text:"Превышен порог Углекислого газа CO₂: 800–1000 ppm — Помещение пора проветрить или усилить приточную вентиляцию." },
  { id:"a54", crit:false, color:"#ff9d4d", text:"Превышен порог Углекислого газа CO₂: 1000–1500 ppm — Воздух загрязнён. Возникает сонливость, вялость, тяжесть в голове, головная боль. Требуется немедленное сквозное проветривание." },
  { id:"a55", crit:false, color:"#ff4d4d", text:"Превышен порог Углекислого газа CO₂: 1500–2500 ppm — Сильное падение продуктивности. Апатия, быстрая утомляемость, ухудшение координации. Требуется немедленное сквозное проветривание." },
  { id:"a56", crit:false, color:"#d62839", text:"Превышен порог Углекислого газа CO₂: 2500–5000 ppm — Возможны головокружение, тошнота, учащённое сердцебиение. ПДК для рабочих зон за 8 часов. Требуется немедленное сквозное проветривание." },
  { id:"a57", crit:true,  color:"#a4133c", text:"Превышен порог Углекислого газа CO₂: 5000+ ppm — Риск ацидоза и кислородного голодания. Требуется срочная эвакуация." },
  { id:"a63", crit:true,  color:"#ff4d4d", text:"Резкий скачок CO. Проверьте дымоход. Откройте окна." },
  { id:"a64", crit:true,  color:"#ff4d4d", text:"Резкий скачок CO₂. Проверьте, нет ли пожара. Откройте окна." },

  /* ----- Sleep and comfort ----- */
  { id:"a17", crit:false, color:"#ffcf4d", text:"Качество сна: сон был неэффективным из-за высокого CO₂ (духота). Проветривайте комнату." },
  { id:"a18", crit:false, color:"#ffcf4d", text:"Качество сна: сон был неэффективным из-за высокой температуры. Проветривайте комнату." },
  { id:"a38", crit:false, text:"Оптимальные условия для сна: проветрено, прохладно, тихо." },
  { id:"a19", crit:false, text:"Комфортно для прогулки и спорта — воздух чистый." },

  /* ----- Weather change ----- */
  { id:"a65", crit:false, color:"#ffcf4d", text:"Резкое изменение погоды. Возможны головные боли у метеозависимых." },

  /* ----- Geomagnetic storms G1–G5 ----- */
  { id:"a20", crit:false, text:"Магнитная буря G1 Слабая. Незначительные сбои в спутниковых системах, слабые полярные сияния на севере." },
  { id:"a21", crit:false, color:"#ffcf4d", text:"Магнитная буря G2 Умеренная. Возможны перепады напряжения в электросетях, полярные сияния видны чуть южнее." },
  { id:"a22", crit:false, color:"#ff9d4d", text:"Магнитная буря G3 Сильная. Перебои в спутниковой навигации (GPS) и низкочастотной радиосвязи." },
  { id:"a23", crit:false, color:"#ff4d4d", text:"Магнитная буря G4 Очень сильная. Массовые проблемы со связью, полярные сияния доходят до средних широт." },
  { id:"a24", crit:false, color:"#d62839", text:"Магнитная буря G5 Экстремальная. Угроза аварий на электростанциях, полный сбой спутников и КВ-связи на планете." },

  /* ----- Device: diagnostics, display, power ----- */
  { id:"a12", crit:false, color:"#ffcf4d", text:"Диагностика. Высока вероятность деградации модуля — дрейф/расхождение показаний." },
  { id:"a13", crit:false, text:"Дисплей домашнего устройства. Включена адаптивная яркость по датчику освещённости." },
  { id:"a39", crit:false, color:"#ffcf4d", text:"Питание. Аккумулятор разряжается, показываю остаток заряда и время работы." },

/* =====================================================================
 *  PART 2 — advice WITH trigger conditions (a75–a121)
 * ===================================================================== */

  /* ----- Gases: danger level and where the gas goes (yellow, red, dark red) ----- */
  { id:"a75", crit:false, color:"#ff4d4d", text:"Диоксид серы SO₂ - Кратковременное превышение опасно. Оседает вниз." },
  { id:"a76", crit:false, color:"#d62839", text:"Озон O₃ - Кратковременное превышение не допустимо. Оседает вниз." },
  { id:"a77", crit:false, color:"#d62839", text:"Диоксид азота NO₂ - Кратковременное превышение не допустимо. Оседает вниз." },
  { id:"a78", crit:false, color:"#ff4d4d", text:"Монооксид азота NO - Кратковременное превышение опасно. Растворяется в воздухе." },
  { id:"a79", crit:false, color:"#ffcf4d", text:"Аммиак NH₃ - Кратковременное превышение допустимо. Улетучивается вверх." },
  { id:"a80", crit:false, color:"#ffcf4d", text:"Углекислый газ CO₂ - Кратковременное превышение допустимо. Оседает вниз." },
  { id:"a81", crit:false, color:"#ffcf4d", text:"Угарный газ CO - Кратковременное превышение допустимо. Растворяется в воздухе." },
  { id:"a82", crit:false, color:"#d62839", text:"Формальдегид CH₂O - Кратковременное превышение не допустимо. Растворяется в воздухе." },

  /* ----- Wind (pink, dark red) ----- */
  { id:"a83", crit:false, color:"#ff9d4d", text:"Сильный ветер 10,8–17,1 м/с: закрепите лёгкие предметы, не стойте под деревьями и рекламными щитами." },
  { id:"a84", crit:false, color:"#d62839", text:"Штормовой ветер от 17,2 м/с: выходить на улицу опасно, держитесь подальше от деревьев, линий электропередач и крыш." },

  /* ----- Illuminance (yellow) ----- */
  { id:"a85", crit:false, color:"#ffcf4d", text:"Освещённость дома/в офисе уменьшилась меньше порога." },
  { id:"a86", crit:false, color:"#ffcf4d", text:"Освещённость на улице уменьшилась меньше порога." },

  /* ----- Solar radiation (yellow) ----- */
  { id:"a87", crit:false, color:"#ffcf4d", text:"Солнечная радиация превысила порог." },
  { id:"a88", crit:false, color:"#ffcf4d", text:"Солнечная радиация уменьшилась меньше порога." },

  /* ----- UV index (yellow, pink, red, dark red) ----- */
  { id:"a89", crit:false, color:"#ffcf4d", text:"УФ-индекс 3–5 (умеренный): необходима защита, рекомендуется крем с SPF." },
  { id:"a90", crit:false, color:"#ff9d4d", text:"УФ-индекс 6–7 (высокий): обязательно использовать солнцезащитные средства, сократить время на солнце." },
  { id:"a91", crit:false, color:"#ff4d4d", text:"УФ-индекс 8–10 (очень высокий): усиленная защита, лучше избегать солнца с полудня до 16:00." },
  { id:"a92", crit:false, color:"#d62839", text:"УФ-индекс 11+ (экстремальный): максимальные меры предосторожности, безопаснее оставаться в помещении." },

  /* ----- Pollen (red) ----- */
  { id:"a93", crit:false, color:"#ff4d4d", text:"Превышен опасный уровень пыльцы ольхи." },
  { id:"a94", crit:false, color:"#ff4d4d", text:"Превышен опасный уровень пыльцы берёзы." },
  { id:"a95", crit:false, color:"#ff4d4d", text:"Превышен опасный уровень пыльцы травы." },
  { id:"a96", crit:false, color:"#ff4d4d", text:"Превышен опасный уровень пыльцы оливы." },
  { id:"a97", crit:false, color:"#ff4d4d", text:"Превышен опасный уровень пыльцы полыни." },
  { id:"a98", crit:false, color:"#ff4d4d", text:"Превышен опасный уровень пыльцы амброзии." },

  /* ----- Methane (dark red) ----- */
  { id:"a99", crit:false, color:"#d62839", text:"Метан CH₄ — превышен порог. Кратковременное превышение не допустимо. Улетучивается вверх." },

  /* ----- Humidity ----- */
  { id:"a100", crit:false, color:"#ffcf4d", text:"Дом, влажность ниже 38 %." },
  { id:"a101", crit:false, color:"#ffcf4d", text:"Дом, влажность выше 65 %." },
  { id:"a102", crit:false, color:"#ff4d4d", text:"Улица, влажность выше 90 %." },
  { id:"a103", crit:false, color:"#ffcf4d", text:"Улица, влажность ниже 35 %." },

  /* ----- Particles PM (harmful — orange, shown as pink; dangerous — dark red) ----- */
  { id:"a104", crit:false, color:"#ff9d4d", text:"Частицы PM1.0: воздух вреден для чувствительных людей." },
  { id:"a105", crit:false, color:"#d62839", text:"Частицы PM1.0: опасный уровень. Оставайтесь в помещении." },
  { id:"a106", crit:false, color:"#ff9d4d", text:"Частицы PM2.5: воздух вреден для чувствительных людей." },
  { id:"a107", crit:false, color:"#d62839", text:"Частицы PM2.5: опасный уровень. Оставайтесь в помещении." },
  { id:"a108", crit:false, color:"#ff9d4d", text:"Частицы PM4.0: воздух вреден для чувствительных людей." },
  { id:"a109", crit:false, color:"#d62839", text:"Частицы PM4.0: опасный уровень. Оставайтесь в помещении." },
  { id:"a110", crit:false, color:"#ff9d4d", text:"Частицы PM10: воздух вреден для чувствительных людей." },
  { id:"a111", crit:false, color:"#d62839", text:"Частицы PM10: опасный уровень. Оставайтесь в помещении." },

  /* ----- Radiation -----
   * a112 — Attention (yellow), a113 — Elevated background (orange),
   * a114 — Alarm (dark red), a115 — sudden rise outdoors (dark red),
   * a116 — sudden spike indoors (red). */
  { id:"a112", crit:false, color:"#ffcf4d", text:"Фон выше обычного. Убедитесь, что рядом с датчиком не появились новые вещи (стройматериалы, удобрения, посуда, антиквариат)." },
  { id:"a113", crit:false, color:"#ff9d4d", text:"Значительное превышение нормы. Возьмите прибор в руки и не спеша пройдите по комнатам, чтобы понять: фонит конкретный предмет или уровень вырос везде." },
  { id:"a114", crit:false, color:"#d62839", text:"Аномально высокий уровень. Если источник локальный — отойдите от него, не трогайте руками и вызовите спецслужбы. Если фон высок во всей квартире — плотно закройте окна и следите за официальными сообщениями." },
  { id:"a115", crit:false, color:"#d62839", text:"На улице резко вырос радиационный фон. Закройте окна и следите за официальными сообщениями." },
  { id:"a116", crit:false, color:"#ff4d4d", text:"Дома резко вырос радиационный фон. Возможно, рядом с датчиком появился источник излучения. Не трогайте подозрительные предметы руками, не спеша пройдите с прибором по комнатам." },

  /* ----- Aurora -----
   * a117–a120 — forecast only (nearest term: 3 days / 2 days / 1 day / now).
   * a121 — current aurora strength; "xx" is replaced by the real percent at
   * display time. The colors of a117–a121 are set in app.js, not here. */
  { id:"a117", crit:false, text:"Есть вероятность увидеть полярное сияние через три дня. Смотри вкладку «Магнитные бури»." },
  { id:"a118", crit:false, text:"Есть вероятность увидеть полярное сияние через два дня. Смотри вкладку «Магнитные бури»." },
  { id:"a119", crit:false, text:"Есть вероятность увидеть полярное сияние через один день. Смотри вкладку «Магнитные бури»." },
  { id:"a120", crit:false, text:"Есть вероятность увидеть полярное сияние. Смотри вкладку «Магнитные бури»." },
  { id:"a121", crit:true,  text:"Текущая сила полярного сияния xx%. Есть вероятность увидеть полярное сияние. Облака и засветка города может этому помешать." }
];

/* Final order: by the id number (a01, a02, ... a121). */
ADVICE_LIST.sort((a, b) => parseInt(a.id.slice(1), 10) - parseInt(b.id.slice(1), 10));