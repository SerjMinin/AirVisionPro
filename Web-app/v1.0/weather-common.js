/* ===== Общий помощник для всех погодных источников ===== */

/* реальный шаг данных в таблице weather (по source) */
async function weatherStepMin(source){
  try {
    const r = await client.from("weather")
      .select("ts_utc").eq("source", source)
      .order("ts_utc", { ascending:false }).limit(200);
    const rows = r.data || [];
    const uniq = {}; rows.forEach(o => { uniq[o.ts_utc] = 1; });
    const times = Object.keys(uniq).map(s => Date.parse(s)).sort((a,b)=>b-a);
    if (times.length < 2) return null;
    const diffs = [];
    for (let i=0; i<times.length-1; i++) diffs.push((times[i]-times[i+1])/60000);
    diffs.sort((a,b)=>a-b);
    return Math.round(diffs[Math.floor(diffs.length/2)]);
  } catch(e){ return null; }
}

/* реальный шаг данных в таблице geomag */
async function geomagStepMin(){
  try {
    const r = await client.from("geomag")
      .select("ts_utc").order("ts_utc", { ascending:false }).limit(200);
    const rows = r.data || [];
    const times = rows.map(o => Date.parse(o.ts_utc)).sort((a,b)=>b-a);
    if (times.length < 2) return null;
    const diffs = [];
    for (let i=0; i<times.length-1; i++) diffs.push((times[i]-times[i+1])/60000);
    diffs.sort((a,b)=>a-b);
    return Math.round(diffs[Math.floor(diffs.length/2)]);
  } catch(e){ return null; }
}

/* подпись: минуты или часы */
function fmtStep(min){
  if (min >= 60) return `раз в ~${Math.round(min/60)} ч`;
  return `раз в ~${min} мин`;
}
/* справочник вкладок для распределения (без служебных: бури/API/советы/дом) */
function tabSelectOptions(){
  const opts = [{ id:"no", label:"Не показывать" }];
  PARAMS.forEach(p => opts.push({ id:p.key, label:t(p.i18n) }));
  return opts;
}

/* рисует список «параметр → вкладка». fields = [{field, label}] */
function renderSourceMap(containerId, fields, curMap){
  const opts = tabSelectOptions();
  const rows = fields.map((f,i) => {
    const sel = (curMap && curMap[f.field] != null) ? curMap[f.field] : "no";
    return `<tr>
      <td style="width:50%;padding:4px 8px 4px 0;white-space:nowrap;">${f.label}</td>
      <td style="width:50%;padding:4px 0;">${selHtml(containerId+"_map_"+i, opts, sel)}</td>
    </tr>`;
  }).join("");
  const container = document.getElementById(containerId);
  if (!rows) { container.innerHTML = `<div class="set-hint">Источник не прислал параметров.</div>`; return; }
  container.innerHTML = `<table style="width:100%;table-layout:fixed;border-collapse:collapse;">${rows}</table>`;
  container.querySelectorAll('.avp-select').forEach(b => b.style.width = "100%");
  container.style.maxHeight = ""; container.style.overflowY = "";
  const card = container.closest(".modal-card");
  if (card){ card.style.maxHeight = "90vh"; card.style.display = "flex"; card.style.flexDirection = "column"; card.style.overflow = "hidden"; }
  const body = container.closest(".modal-body");
  if (body){ body.style.overflowY = "auto"; }
}

/* читает выбор обратно в объект {поле: вкладка} */
function readSourceMap(fields, containerId){
  const map = {};
  fields.forEach((f,i) => {
    const el = document.getElementById(containerId+"_map_"+i);
    map[f.field] = el ? el.value : "no";
  });
  return map;
}