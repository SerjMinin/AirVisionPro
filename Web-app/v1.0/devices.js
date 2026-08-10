/*
 * Copyright (c) 2026 Минин Сергей Александрович.
 * Licensed under the GNU Affero General Public License v3.0.
 */
/* AirVisionPro — физические устройства: уличное (out) и домашнее (in). Один файл на оба типа. */

const DEV_TITLE     = { out:"Уличное устройство", in:"Домашнее устройство" };
const DEV_SN_FIELD  = { out:"sn_out",     in:"sn_in" };
const DEV_KEY_FIELD = { out:"sn_out_key", in:"sn_in_key" };

/* какие параметры прислало устройство (список имён из базы) */
let devFields = { out:[], in:[] };

/* варианты выпадающего списка «в какую вкладку»: первым — «Не показывать» */
function devTabOptions(){
  return [{ id:"no", label:"Не показывать" }]
    .concat(PARAMS.map(p => ({ id:p.key, label:t(p.i18n) })));
}

async function openSrcDevice(which){
  const sn  = SETTINGS[DEV_SN_FIELD[which]]  || "";
  const key = SETTINGS[DEV_KEY_FIELD[which]] || "";
  document.getElementById(`src-dev-${which}-body`).innerHTML =
    `<div class="set-hint" style="text-align:left;margin:0 0 4px;">Серийный номер процессора:</div>
     <input id="dev_${which}_sn" class="set-input" style="width:100%;" placeholder="Серийный номер устройства">
     <div class="set-hint" style="text-align:left;margin:10px 0 4px;">Ключ:</div>
     <input id="dev_${which}_key" class="set-input" style="width:100%;" placeholder="Ключ устройства">
     <div style="display:flex;align-items:center;justify-content:space-between;margin:12px 0 6px;">
       <span class="set-hint" style="text-align:left;">Параметры устройства → вкладка и коррекция:</span>
       <button class="set-btn sm" type="button" onclick="refreshDeviceParams('${which}')">Обновить</button>
     </div>
     <div id="src-dev-${which}-map"><div class="set-hint">Нажмите «Обновить», чтобы получить список параметров устройства.</div></div>`;
  document.getElementById(`src-dev-${which}-modal`).classList.add("open");
  document.getElementById(`dev_${which}_sn`).value  = sn;
  document.getElementById(`dev_${which}_key`).value = key;

  document.getElementById(`src-dev-${which}-stats`).innerHTML =
    `<span>Опрос: раз в ${SETTINGS.send_interval_min || 5} мин</span>`;

  if (sn) await refreshDeviceParams(which);
}

/* получить список параметров устройства из базы (уникальные key по serial) */
async function refreshDeviceParams(which){
  const box = document.getElementById(`src-dev-${which}-map`);
  const sn  = document.getElementById(`dev_${which}_sn`).value.trim();
  if (!sn){ box.innerHTML = `<div class="set-hint">Сначала введите серийный номер.</div>`; devFields[which] = []; return; }
  box.innerHTML = `<div class="set-hint">Запрашиваю параметры…</div>`;
  let keys = [];
  try {
    const { data } = await client.from("measurements")
      .select("key").eq("serial", sn)
      .order("ts_device", { ascending:false }).limit(2000);
    if (data) keys = [...new Set(data.map(r => r.key))];
  } catch(e){ keys = []; }
  if (!keys.length){
    box.innerHTML = `<div class="set-hint">Устройство ещё не выходило на связь (нет данных). Проверьте серийный номер и питание устройства.</div>`;
    devFields[which] = [];
    return;
  }
  devFields[which] = keys;
  renderDeviceMap(which, keys);
}

/* нарисовать строки: имя параметра → вкладка + две галки коррекции */
function renderDeviceMap(which, keys){
  const dev  = (SETTINGS.devices && SETTINGS.devices[which]) || {};
  const map  = dev.map  || {};
  const corr = dev.corr || {};
  const opts = devTabOptions();
  const rows = keys.map((k,i) => {
    const cur = map[k] || "no";
    const c = corr[k] || {};
    return `
    <div style="border-bottom:1px solid rgba(255,255,255,0.08);padding:8px 0;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:center;">
        <div style="word-break:break-all;">${k}</div>
        <div>${selHtml(`dev_${which}_tab_${i}`, opts, cur)}</div>
      </div>
      <div style="display:flex;gap:14px;align-items:center;margin-top:6px;flex-wrap:wrap;">
        <label class="set-check" style="gap:4px;"><input type="checkbox" id="dev_${which}_mulon_${i}" ${c.mul_on?"checked":""}> ×</label>
        <input id="dev_${which}_mul_${i}" class="set-input" type="number" step="any" value="${c.mul!=null?c.mul:1}" style="width:80px;">
        <label class="set-check" style="gap:4px;"><input type="checkbox" id="dev_${which}_offon_${i}" ${c.off_on?"checked":""}> +</label>
        <input id="dev_${which}_off_${i}" class="set-input" type="number" step="any" value="${c.off!=null?c.off:0}" style="width:80px;">
      </div>
    </div>`;
  }).join("");
  document.getElementById(`src-dev-${which}-map`).innerHTML = rows;
  initCustomSelects(document.getElementById(`src-dev-${which}-map`));
}

function closeSrcDevice(which){ document.getElementById(`src-dev-${which}-modal`).classList.remove("open"); }

async function saveSrcDevice(which){
  const sn  = document.getElementById(`dev_${which}_sn`).value.trim();
  const key = document.getElementById(`dev_${which}_key`).value.trim();
  SETTINGS[DEV_SN_FIELD[which]]  = sn;
  SETTINGS[DEV_KEY_FIELD[which]] = key;

  if (!SETTINGS.devices) SETTINGS.devices = {};
  if (!SETTINGS.devices[which]) SETTINGS.devices[which] = {};
  const map = {}, corr = {};
  (devFields[which] || []).forEach((k,i) => {
    const tabEl = document.getElementById(`dev_${which}_tab_${i}`);
    map[k] = tabEl ? tabEl.value : "no";
    corr[k] = {
      mul_on: document.getElementById(`dev_${which}_mulon_${i}`).checked,
      mul:    parseFloat(document.getElementById(`dev_${which}_mul_${i}`).value) || 1,
      off_on: document.getElementById(`dev_${which}_offon_${i}`).checked,
      off:    parseFloat(document.getElementById(`dev_${which}_off_${i}`).value) || 0
    };
  });
  SETTINGS.devices[which].map  = map;
  SETTINGS.devices[which].corr = corr;

  await saveSettings();

  /* разблокировать галку «включить» в главных настройках, если они открыты */
  const cb = document.getElementById("cfg_dev_" + which);
  if (cb && sn && key) cb.disabled = false;

  closeSrcDevice(which);
}