/* AirVision Pro — единицы, пересчёт, пороги давления по высоте.
   Базовые: temp=°C, pressure=hPa, wind_spd=m/s, rad=µSv/h, co2=ppm, co=ppm */

const UNITS = {
  temp:     { def:"C",   opts:[ {id:"C",label:"°C"}, {id:"F",label:"°F"} ] },
  pressure: { def:"hPa", opts:[ {id:"hPa",label:"гПа"}, {id:"mmHg",label:"мм рт.ст."}, {id:"mbar",label:"мбар"}, {id:"inHg",label:"дюйм рт.ст."} ] },
  wind_spd: { def:"ms",  opts:[ {id:"ms",label:"м/с"}, {id:"kmh",label:"км/ч"}, {id:"mph",label:"миль/ч"} ] },
  rad:      { def:"uSv", opts:[ {id:"uSv",label:"мкЗв/ч"}, {id:"uR",label:"мкР/ч"} ] },
  co2:      { def:"ppm", opts:[ {id:"ppm",label:"ppm"}, {id:"mgm3",label:"мг/м³"} ] },
  co:       { def:"ppm", opts:[ {id:"ppm",label:"ppm"}, {id:"mgm3",label:"мг/м³"} ] }
};

function convertUnit(value, group, toUnit) {
  if (value == null || isNaN(value)) return value;
  switch (group) {
    case "temp":     return toUnit === "F" ? value*9/5 + 32 : value;
    case "pressure":
      if (toUnit === "mmHg") return value*0.750062;
      if (toUnit === "inHg") return value*0.0295300;
      return value;
    case "wind_spd":
      if (toUnit === "kmh") return value*3.6;
      if (toUnit === "mph") return value*2.23694;
      return value;
    case "rad":  return toUnit === "uR" ? value*100 : value;
    case "co2":  return toUnit === "mgm3" ? value*1.8 : value;
    case "co":   return toUnit === "mgm3" ? value*1.145 : value;
    default: return value;
  }
}

function unitLabel(group, id) {
  const g = UNITS[group]; if (!g) return "";
  const o = g.opts.find(x => x.id === id) || g.opts.find(x => x.id === g.def);
  return o ? o.label : "";
}

const PARAM_UNIT_GROUP = { temp:"temp", pressure:"pressure", wind_spd:"wind_spd", rad:"rad", co2:"co2", co:"co" };

/* фиксированные единицы с переопределением подписи */
const FIXED_UNIT_LABEL = { lux:"Люкс" };
function paramUnitDisplay(p) {
  const g = PARAM_UNIT_GROUP[p.key];
  if (g) return unitLabel(g, SETTINGS.units[g]);
  if (FIXED_UNIT_LABEL[p.key]) return FIXED_UNIT_LABEL[p.key];
  return p.unit || "";
}

/* Барометрическая формула ISA: порог с уровня моря -> на высоту H (м), hPa */
function pressureAtAltitude(p0_hPa, altitude_m) {
  const H = altitude_m || 0;
  return p0_hPa * Math.pow(1 - 0.0065 * H / 288.15, 5.255);
}

/* Итоговые пороги (hPa). Высота = сумма (над морем + установки). */
function effectivePressureThresholds(s) {
  const base = s.pressure_thr;
  if (s.pressure_auto === false) return { ...base };
  const H = (s.alt_sea||0) + (s.alt_ground||0);
  return {
    anom_low:  pressureAtAltitude(base.anom_low, H),
    low:       pressureAtAltitude(base.low, H),
    normal:    pressureAtAltitude(base.normal, H),
    high:      pressureAtAltitude(base.high, H),
    anom_high: pressureAtAltitude(base.anom_high, H)
  };
}