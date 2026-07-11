/* AirVision Pro — единицы и пересчёт.
   Базовые единицы (как приходят с устройств):
   temp=°C, pressure=hPa, wind_spd=m/s, rad=µSv/h, co2=ppm, co=ppm */

const UNITS = {
  temp:     { def:"C",   opts:[ {id:"C",label:"°C"}, {id:"F",label:"°F"} ] },
  pressure: { def:"hPa", opts:[ {id:"hPa",label:"гПа"}, {id:"mmHg",label:"мм рт.ст."}, {id:"mbar",label:"мбар"}, {id:"inHg",label:"дюйм рт.ст."} ] },
  wind_spd: { def:"ms",  opts:[ {id:"ms",label:"м/с"}, {id:"kmh",label:"км/ч"}, {id:"mph",label:"mph"} ] },
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

/* какой параметр к какой группе единиц относится (пусто = фиксированная единица) */
const PARAM_UNIT_GROUP = {
  temp:"temp", pressure:"pressure", wind_spd:"wind_spd", rad:"rad", co2:"co2", co:"co"
};