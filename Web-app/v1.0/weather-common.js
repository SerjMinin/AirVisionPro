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