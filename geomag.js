/* AirVision Pro — магнитные бури (NOAA SWPC, планетарный Kp). */

const GEOMAG_URL = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";

const G_TABLE = [
  { g:"G1", kp:5, name:"Слабая",       eff:"Незначительные сбои в спутниковых системах, слабые полярные сияния на севере." },
  { g:"G2", kp:6, name:"Умеренная",    eff:"Возможны перепады напряжения в электросетях, полярные сияния видны чуть южнее." },
  { g:"G3", kp:7, name:"Сильная",      eff:"Перебои в спутниковой навигации (GPS) и низкочастотной радиосвязи." },
  { g:"G4", kp:8, name:"Очень сильная",eff:"Массовые проблемы со связью, полярные сияния доходят до средних широт." },
  { g:"G5", kp:9, name:"Экстремальная",eff:"Угроза аварий на электростанциях, полный сбой спутников и КВ-связи на планете." }
];

function kpToG(kp) {
  if (kp >= 9) return G_TABLE[4];
  if (kp >= 8) return G_TABLE[3];
  if (kp >= 7) return G_TABLE[2];
  if (kp >= 6) return G_TABLE[1];
  if (kp >= 5) return G_TABLE[0];
  return null; // спокойно
}

async function buildGeomag() {
  const el = document.getElementById("geomag-body");
  el.innerHTML = `<div class="set-hint">${t("geomag_load")}</div>`;
  try {
    const r = await fetch(GEOMAG_URL, { cache:"no-store" });
    const data = await r.json();
    const rows = data.slice(1);                 // 1-я строка — заголовки
    const last = rows[rows.length - 1];
    const kp = parseFloat(last[1]);
    const when = last[0];
    const g = kpToG(kp);
    const isCalm = !g;
    const color = isCalm ? "#3fbf6a" : (kp>=8 ? "#e0413f" : kp>=7 ? "#ff7a2f" : "#e0a83f");
    el.innerHTML = `
      <div class="geo-card" style="border-color:${color}">
        <div class="geo-kp" style="color:${color}">Kp ${kp.toFixed(2)}</div>
        <div class="geo-level" style="background:${color}">${isCalm ? t("geomag_calm") : g.g + " · " + g.name}</div>
        <div class="geo-desc">${isCalm ? t("geomag_calm_desc") : g.eff}</div>
        <div class="set-hint">${t("geomag_updated")}: ${new Date(when+"Z").toLocaleString()}</div>
        <div class="set-hint">${t("geomag_source")}</div>
      </div>`;
  } catch(e) {
    el.innerHTML = `<div class="set-hint">${t("geomag_err")}</div>`;
  }
}

function openGeomagSettings() {
  const rows = G_TABLE.map(x =>
    `<tr><td>${x.g}</td><td>${x.kp}</td><td>${x.name}</td><td>${x.eff}</td></tr>`).join("");
  document.getElementById("geomag-set-title").textContent = t("set_page") + t("tab_geomag");
  document.getElementById("geomag-set-body").innerHTML = `
    <table class="geo-table">
      <thead><tr><th>Уровень (G)</th><th>Балл (Kp)</th><th>Сила бури</th><th>Последствия и эффекты</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  document.getElementById("geomag-modal").classList.add("open");
}
function closeGeomagSettings() { document.getElementById("geomag-modal").classList.remove("open"); }