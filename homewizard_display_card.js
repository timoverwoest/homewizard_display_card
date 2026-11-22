// HomeWizard Display Card: a Home Assistant dashboard card that recreates the
// "Usage Overview" screen of the HomeWizard Energy Display (800 x 480 SVG).
//
// Inspired by the HomeWizard Energy Display. HomeWizard is a trademark of HomeWizard B.V.
// This is an independent community project; it is not affiliated with, endorsed by, or
// sponsored by HomeWizard. Icons: Material Design Icons (Pictogrammers), Apache License 2.0.
//
// Minimal configuration (everything else comes from the Energy settings):
//   type: custom:homewizard-display-card
//
// Source and documentation: https://github.com/timoverwoest/homewizard_display_card
// License: MIT

const HWDC = (() => {
  const VERSION = "0.1.0";
  const TAG = "homewizard-display-card";

  // ---------------------------------------------------------------- configuration

  const DEFAULTS = {
    grid_power: null,
    grid_import: null,
    grid_export: null,
    solar_energy: null,
    battery_soc: null,
    battery_power: null,
    battery_power_sign: "discharge_positive",
    water: null,
    water_flow: null,
    water_display: "auto",
    goal_grid_import: 25,
    goal_grid_export: 25,
    goal_solar: 25,
    goal_water: 500,
    goal_water_flow: 10,
    color_grid: "#a259ff",
    color_delivery: "#86d03c",
    color_battery: "#b9d2e0",
    color_water: "#3d8ff5",
    color_text: "#ffffff",
    color_background: "#05070b",
    use_energy_settings: true,
  };

  const ENTITY_KEYS = [
    "grid_power", "grid_import", "grid_export", "solar_energy",
    "battery_soc", "battery_power", "water", "water_flow",
  ];
  const GOAL_KEYS = ["goal_grid_import", "goal_grid_export", "goal_solar", "goal_water", "goal_water_flow"];
  const COLOR_KEYS = ["color_grid", "color_delivery", "color_battery", "color_water", "color_text", "color_background"];
  const SIGNS = ["discharge_positive", "charge_positive"];
  const WATER_MODES = ["auto", "volume", "flow"];
  // A colour ends up inside an SVG attribute, so only plain CSS colour syntax is accepted.
  const COLOR_RE = /^[#a-zA-Z0-9(),.%\s-]{1,64}$/;

  const toList = (v) => {
    if (v === null || v === undefined || v === "") return [];
    const list = Array.isArray(v) ? v : [v];
    return list.filter((x) => typeof x === "string" && x.trim() !== "").map((x) => x.trim());
  };

  const toColor = (key, v) => {
    if (Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(Number(n)))) {
      return `rgb(${v.map((n) => Math.max(0, Math.min(255, Math.round(Number(n))))).join(",")})`;
    }
    if (typeof v === "string" && COLOR_RE.test(v.trim())) return v.trim();
    throw new Error(`${key}: expected a CSS colour such as #a259ff`);
  };

  // Fills in defaults and checks the values. Throws an Error with a readable message, which
  // Home Assistant shows on the card.
  const normalizeConfig = (config) => {
    if (!config || typeof config !== "object") throw new Error("Invalid configuration");
    const c = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS)) {
      if (config[key] !== undefined && config[key] !== null && config[key] !== "") c[key] = config[key];
    }
    for (const key of ENTITY_KEYS) {
      const v = config[key];
      if (v !== undefined && v !== null && v !== "" && !(typeof v === "string" || Array.isArray(v))) {
        throw new Error(`${key}: expected an entity id or a list of entity ids`);
      }
      c[key] = toList(v);
    }
    for (const key of GOAL_KEYS) {
      const n = Number(c[key]);
      if (!Number.isFinite(n) || n <= 0) throw new Error(`${key}: expected a number above 0`);
      c[key] = n;
    }
    for (const key of COLOR_KEYS) c[key] = toColor(key, c[key]);
    if (!SIGNS.includes(c.battery_power_sign)) {
      throw new Error(`battery_power_sign: expected ${SIGNS.join(" or ")}`);
    }
    if (!WATER_MODES.includes(c.water_display)) {
      throw new Error(`water_display: expected ${WATER_MODES.join(", ")}`);
    }
    c.use_energy_settings = c.use_energy_settings !== false;
    return c;
  };

  // ---------------------------------------------------------------- sources

  // Power terms are {id, sign}: the value of entity `id` times `sign`.
  // Grid: + = taking from the grid. Battery: + = discharging (Home Assistant convention).
  const powerTerms = (src) => {
    if (!src) return [];
    if (src.stat_rate) return [{ id: src.stat_rate, sign: 1 }];
    const pc = src.power_config || {};
    if (pc.stat_rate) return [{ id: pc.stat_rate, sign: 1 }];
    if (pc.stat_rate_inverted) return [{ id: pc.stat_rate_inverted, sign: -1 }];
    const terms = [];
    if (pc.stat_rate_from) terms.push({ id: pc.stat_rate_from, sign: 1 });
    if (pc.stat_rate_to) terms.push({ id: pc.stat_rate_to, sign: -1 });
    if (pc.stat_rate_to_home) terms.push({ id: pc.stat_rate_to_home, sign: 1 });
    if (pc.stat_rate_to_grid) terms.push({ id: pc.stat_rate_to_grid, sign: 1 });
    if (pc.stat_rate_from_grid) terms.push({ id: pc.stat_rate_from_grid, sign: -1 });
    if (pc.stat_rate_from_solar) terms.push({ id: pc.stat_rate_from_solar, sign: -1 });
    return terms;
  };

  // Collects the statistic and entity ids per value from the Energy settings
  // (energy/get_prefs). Reads the current flat grid format and the older flow_from/flow_to lists.
  const sourcesFromPrefs = (prefs) => {
    const out = {
      gridPower: [], gridImport: [], gridExport: [], solar: [],
      batterySoc: [], batteryPower: [], water: [], waterFlow: [],
    };
    const list = prefs && Array.isArray(prefs.energy_sources) ? prefs.energy_sources : [];
    for (const s of list) {
      if (!s || typeof s !== "object") continue;
      if (s.type === "grid") {
        if (s.stat_energy_from) out.gridImport.push(s.stat_energy_from);
        if (s.stat_energy_to) out.gridExport.push(s.stat_energy_to);
        (s.flow_from || []).forEach((f) => f && f.stat_energy_from && out.gridImport.push(f.stat_energy_from));
        (s.flow_to || []).forEach((f) => f && f.stat_energy_to && out.gridExport.push(f.stat_energy_to));
        out.gridPower.push(...powerTerms(s));
        (s.power || []).forEach((p) => out.gridPower.push(...powerTerms(p)));
      } else if (s.type === "solar") {
        if (s.stat_energy_from) out.solar.push(s.stat_energy_from);
      } else if (s.type === "battery") {
        if (s.stat_soc) out.batterySoc.push(s.stat_soc);
        out.batteryPower.push(...powerTerms(s));
      } else if (s.type === "water") {
        if (s.stat_energy_from) out.water.push(s.stat_energy_from);
        if (s.stat_rate) out.waterFlow.push({ id: s.stat_rate, sign: 1 });
      }
    }
    const uniq = (a) => [...new Set(a)];
    const uniqTerms = (a) => a.filter((t, i) => a.findIndex((u) => u.id === t.id) === i);
    return {
      gridPower: uniqTerms(out.gridPower),
      gridImport: uniq(out.gridImport),
      gridExport: uniq(out.gridExport),
      solar: uniq(out.solar),
      batterySoc: uniq(out.batterySoc),
      batteryPower: uniqTerms(out.batteryPower),
      water: uniq(out.water),
      waterFlow: uniqTerms(out.waterFlow),
    };
  };

  // Per value: entities from the card configuration first, otherwise the Energy settings.
  const resolveSources = (config, prefs) => {
    const auto = sourcesFromPrefs(config.use_energy_settings ? prefs : null);
    const pick = (own, fallback) => (own.length ? own : fallback);
    const terms = (ids, sign) => ids.map((id) => ({ id, sign }));
    const batterySign = config.battery_power_sign === "charge_positive" ? -1 : 1;
    return {
      gridPower: pick(terms(config.grid_power, 1), auto.gridPower),
      gridImport: pick(config.grid_import, auto.gridImport),
      gridExport: pick(config.grid_export, auto.gridExport),
      solar: pick(config.solar_energy, auto.solar),
      batterySoc: pick(config.battery_soc, auto.batterySoc),
      batteryPower: pick(terms(config.battery_power, batterySign), auto.batteryPower),
      water: pick(config.water, auto.water),
      waterFlow: pick(terms(config.water_flow, 1), auto.waterFlow),
    };
  };

  // Ids whose "today" value comes from the recorder statistics.
  const meterIds = (src) => [...new Set([...src.gridImport, ...src.gridExport, ...src.solar, ...src.water])];

  // ---------------------------------------------------------------- units

  const FACTORS = {
    power: { mW: 0.001, W: 1, kW: 1e3, MW: 1e6, GW: 1e9 },
    energy: {
      mWh: 1e-6, Wh: 1e-3, kWh: 1, MWh: 1e3, GWh: 1e6, TWh: 1e9,
      J: 1 / 3.6e6, kJ: 1 / 3600, MJ: 1 / 3.6, GJ: 1e3 / 3.6, cal: 4.184 / 3.6e6, kcal: 4.184 / 3600,
      Mcal: 4.184 / 3.6, Gcal: 4184 / 3.6,
    },
    volume: {
      mL: 1e-3, L: 1, "m³": 1e3, "ft³": 28.316846592, gal: 3.785411784, CCF: 2831.6846592,
      MCF: 28316.846592, "fl. oz.": 0.0295735295625,
    },
    flow: {
      "L/min": 1, "L/h": 1 / 60, "L/s": 60, "mL/s": 0.06, "m³/h": 1000 / 60, "m³/min": 1000,
      "m³/s": 60000, "gal/min": 3.785411784, "gal/h": 3.785411784 / 60, "gal/d": 3.785411784 / 1440,
      "ft³/min": 28.316846592,
    },
  };
  // Unit to assume when an entity has none.
  const BASE_UNIT = { power: "W", energy: "kWh", volume: null, flow: "L/min" };

  // Converts a value to W, kWh, L or L/min ("raw": unchanged). Returns null for an unknown unit.
  const convert = (value, unit, kind) => {
    if (!Number.isFinite(value)) return null;
    if (kind === "raw") return value;
    const u = unit === undefined || unit === null || unit === "" ? BASE_UNIT[kind] : unit;
    const f = u === null ? undefined : FACTORS[kind][u];
    return f === undefined ? null : value * f;
  };

  const stateValue = (hass, id, kind) => {
    const st = hass && hass.states ? hass.states[id] : undefined;
    if (!st) return null;
    const v = parseFloat(st.state);
    if (!Number.isFinite(v)) return null;
    return convert(v, st.attributes ? st.attributes.unit_of_measurement : undefined, kind);
  };

  // ---------------------------------------------------------------- today (statistics)

  const STAT_UNITS = { energy: "kWh", volume: "L" };

  // Asks the recorder for today's change of every meter, plus the last 5-minute state so the
  // card can add what happened since. Returns {id: {change, lastState, hasStats}}.
  const fetchToday = async (hass, ids, now) => {
    const result = {};
    if (!ids.length) return result;
    const start = new Date(now - 30 * 60 * 1000).toISOString();
    let recent = {};
    try {
      recent = (await hass.callWS({
        type: "recorder/statistics_during_period",
        start_time: start,
        statistic_ids: ids,
        period: "5minute",
        types: ["state"],
        units: STAT_UNITS,
      })) || {};
    } catch (e) {
      recent = {};
    }
    await Promise.all(ids.map(async (id) => {
      let change = null;
      try {
        const r = await hass.callWS({
          type: "recorder/statistic_during_period",
          statistic_id: id,
          calendar: { period: "day" },
          types: ["change"],
          units: STAT_UNITS,
        });
        if (r && Number.isFinite(r.change)) change = r.change;
      } catch (e) {
        change = null;
      }
      // Only meter statistics (state_class total/total_increasing) have a "state" per row; a
      // measurement sensor has mean/min/max and counts as "no statistics".
      const rows = (Array.isArray(recent[id]) ? recent[id] : []).filter((r) => r && Number.isFinite(r.state));
      result[id] = {
        change,
        lastState: rows.length ? rows[rows.length - 1].state : null,
        hasStats: change !== null || rows.length > 0,
      };
    }));
    return result;
  };

  // Today's value of one meter: the statistics change plus the live increase since the last
  // 5-minute statistic. An entity without statistics is shown as is (a daily sensor).
  const todayValue = (hass, id, kind, today) => {
    const t = today ? today[id] : undefined;
    if (!t) return null;
    const current = stateValue(hass, id, kind);
    if (!t.hasStats) return current;
    let v = t.change === null ? 0 : t.change;
    if (current !== null && t.lastState !== null) {
      v += current >= t.lastState ? current - t.lastState : current; // smaller = meter was reset
    }
    return v;
  };

  const sumOf = (values) => {
    const ok = values.filter((v) => v !== null);
    return ok.length ? ok.reduce((a, b) => a + b, 0) : null;
  };

  const computeModel = (hass, src, today) => {
    const power = (terms, kind) => sumOf(terms.map((t) => {
      const v = stateValue(hass, t.id, kind);
      return v === null ? null : v * t.sign;
    }));
    const meters = (ids, kind) => sumOf(ids.map((id) => todayValue(hass, id, kind, today)));
    const soc = src.batterySoc.map((id) => stateValue(hass, id, "raw")).filter((v) => v !== null);
    return {
      gridPower: power(src.gridPower, "power"),
      gridImport: meters(src.gridImport, "energy"),
      gridExport: meters(src.gridExport, "energy"),
      solar: meters(src.solar, "energy"),
      batterySoc: soc.length ? soc.reduce((a, b) => a + b, 0) / soc.length : null,
      batteryPower: power(src.batteryPower, "power"),
      water: meters(src.water, "volume"),
      waterFlow: power(src.waterFlow, "flow"),
    };
  };

  // ---------------------------------------------------------------- time

  // Next refresh: 25 s after the next 5-minute boundary, when the recorder has compiled the
  // new short-term statistics.
  const msToNextRefresh = (now) => {
    const period = 300000;
    const offset = 25000;
    const next = Math.floor((now - offset) / period) * period + period + offset;
    return Math.max(5000, next - now);
  };

  const dayFormatters = {};
  // Calendar day in the Home Assistant server time zone, the same day the statistics use.
  const dayKey = (now, timeZone) => {
    const tz = timeZone || "UTC";
    try {
      if (!dayFormatters[tz]) {
        dayFormatters[tz] = new Intl.DateTimeFormat("en-CA", {
          timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
        });
      }
      return dayFormatters[tz].format(new Date(now));
    } catch (e) {
      return new Date(now).toISOString().slice(0, 10);
    }
  };

  // ---------------------------------------------------------------- numbers and language

  // Same mapping as the Home Assistant frontend (user profile → Number format).
  const numberLocale = (hass) => {
    const l = (hass && hass.locale) || {};
    const lang = l.language || (hass && hass.language) || "en";
    switch (l.number_format) {
      case "comma_decimal": return ["en-US", "en"];
      case "decimal_comma": return ["de", "es", "it"];
      case "space_comma": return ["fr", "sv", "cs"];
      case "system": return undefined;
      default: return lang;
    }
  };

  // Returns fmt(value, decimals) → {text, int, frac}. No thousands separator, like the display.
  const formatter = (hass) => {
    const loc = numberLocale(hass);
    const cache = {};
    const make = (d) => {
      const opts = { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false };
      try {
        return new Intl.NumberFormat(loc, opts);
      } catch (e) {
        return new Intl.NumberFormat("en", opts);
      }
    };
    return (value, decimals) => {
      const nf = cache[decimals] || (cache[decimals] = make(decimals));
      let v = Number(value.toFixed(decimals));
      if (v === 0) v = 0; // no "-0"
      let int = "";
      let frac = "";
      for (const p of nf.formatToParts(v)) {
        if (p.type === "fraction") frac += p.value;
        else if (p.type === "integer" || p.type === "minusSign") int += p.value;
      }
      return { text: nf.format(v), int, frac };
    };
  };

  const pickLang = (lang) => (String(lang || "").toLowerCase().startsWith("nl") ? "nl" : "en");

  const editorLang = () => {
    try {
      return pickLang((typeof document !== "undefined" && document.documentElement.lang) ||
        (typeof navigator !== "undefined" && navigator.language) || "en");
    } catch (e) {
      return "en";
    }
  };

  // ---------------------------------------------------------------- SVG

  const FONT = 'font-family="Roboto, Noto, Helvetica, Arial, sans-serif" font-weight="700"';
  const ICONS = {
    // Material Design Icons: transmission-tower, white-balance-sunny, water-outline
    grid: "M8.28,5.45L6.5,4.55L7.76,2H16.23L17.5,4.55L15.72,5.44L15,4H9L8.28,5.45M18.62,8H14.09L13.3,5H10.7L9.91,8H5.38L4.1,10.55L5.89,11.44L6.62,10H17.38L18.1,11.45L19.89,10.56L18.62,8M17.77,22H15.7L15.46,21.1L12,15.9L8.53,21.1L8.3,22H6.23L9.12,11H11.19L10.83,12.35L12,14.1L13.16,12.35L12.81,11H14.88L17.77,22M11.4,15L10.5,13.65L9.32,18.13L11.4,15M14.68,18.12L13.5,13.64L12.6,15L14.68,18.12Z",
    solar: "M3.55 19.09L4.96 20.5L6.76 18.71L5.34 17.29M12 6C8.69 6 6 8.69 6 12S8.69 18 12 18 18 15.31 18 12C18 8.68 15.31 6 12 6M20 13H23V11H20M17.24 18.71L19.04 20.5L20.45 19.09L18.66 17.29M20.45 5L19.04 3.6L17.24 5.39L18.66 6.81M13 1H11V4H13M6.76 5.39L4.96 3.6L3.55 5L5.34 6.81L6.76 5.39M1 13H4V11H1M13 20H11V23H13",
    water: "M12,3.77L11.25,4.61C11.25,4.61 9.97,6.06 8.68,7.94C7.39,9.82 6,12.07 6,14.23A6,6 0 0,0 12,20.23A6,6 0 0,0 18,14.23C18,12.07 16.61,9.82 15.32,7.94C14.03,6.06 12.75,4.61 12.75,4.61L12,3.77M12,6.9C12.44,7.42 12.84,7.85 13.68,9.07C14.89,10.83 16,13.07 16,14.23C16,16.45 14.22,18.23 12,18.23C9.78,18.23 8,16.45 8,14.23C8,13.07 9.11,10.83 10.32,9.07C11.16,7.85 11.56,7.42 12,6.9Z",
  };
  const BATTERY_DELIVERY_W = 20; // below this the battery counts as idle (standby noise)
  const SHOW_EXPORT_KWH = 0.05; // ↑ under the big ring from this export today

  const frac = (v, goal) => (v === null ? 0 : Math.max(0, Math.min(1, v / goal)));

  // Ring: dimmed track plus an arc from 12 o'clock with round caps (a small value is a dot).
  // Taking energy: clockwise. Delivering (export, solar, battery discharging): counterclockwise,
  // the clockwise arc mirrored in the vertical axis.
  const ring = (cx, cy, r, w, f, color, ccw) => {
    const len = 2 * Math.PI * r;
    let s = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-opacity="0.3" stroke-width="${w}"/>`;
    if (f > 0) {
      const mirror = ccw ? `matrix(-1 0 0 1 ${2 * cx} 0) ` : "";
      s += `<circle class="arc${ccw ? " ccw" : ""}" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${Math.max(f * len, 0.01).toFixed(2)} ${len.toFixed(2)}" transform="${mirror}rotate(-90 ${cx} ${cy})"/>`;
    }
    return s;
  };

  const bar = (x, y, w, f, color) =>
    `<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y}" stroke="${color}" stroke-opacity="0.3" stroke-width="7" stroke-linecap="round"/>` +
    (f > 0 ? `<line x1="${x}" y1="${y}" x2="${(x + Math.max(f * w, 1)).toFixed(1)}" y2="${y}" stroke="${color}" stroke-width="7" stroke-linecap="round"/>` : "");

  const icon = (x, y, path, color) => `<path transform="translate(${x} ${y}) scale(1.9)" fill="${color}" d="${path}"/>`;

  const text = (x, y, size, color, content, anchor) =>
    `<text x="${x}" y="${y}"${anchor ? ` text-anchor="${anchor}"` : ""} ${FONT} font-size="${size}" fill="${color}">${content}</text>`;

  // Right column in display style: big whole number, then the unit (small, top) and the
  // decimal (below). Width estimated at 0.57 em per character (Roboto digits are 0.56 em).
  const columnValue = (x, y, v, decimals, unit, fmt, color) => {
    if (v === null) return text(x, y, 52, color, "–");
    const f = fmt(v, decimals);
    const xe = Math.round(x + f.int.length * 52 * 0.57 + 6);
    return text(x, y, 52, color, f.int) + text(xe, y - 24, 22, color, unit) + (f.frac ? text(xe, y, 28, color, f.frac) : "");
  };

  const LABELS = {
    en: { grid: "Grid", import: "taken today", export: "returned today", battery: "Home battery", solar: "Solar today", water: "Water today", flow: "Water flow", none: "no data" },
    nl: { grid: "Net", import: "vandaag afgenomen", export: "vandaag teruggeleverd", battery: "Thuisaccu", solar: "Zon vandaag", water: "Water vandaag", flow: "Waterdebiet", none: "geen gegevens" },
  };

  const renderSvg = (m, c, fmt, lang) => {
    const L = LABELS[pickLang(lang)];
    const T = c.color_text;
    const exporting = m.gridPower !== null && m.gridPower < 0;
    const parts = [];

    // Big ring: grid power now; arc = taken today / goal, or returned today / goal when exporting.
    parts.push(exporting
      ? ring(200, 205, 140, 24, frac(m.gridExport, c.goal_grid_export), c.color_delivery, true)
      : ring(200, 205, 140, 24, frac(m.gridImport, c.goal_grid_import), c.color_grid, false));
    let main = "–";
    let mainUnit = "W";
    if (m.gridPower !== null) {
      const kw = Math.abs(m.gridPower) >= 10000;
      main = kw ? fmt(m.gridPower / 1000, 1).text : fmt(m.gridPower, 0).text;
      mainUnit = kw ? "kW" : "W";
    }
    parts.push(text(200, 232, main.length >= 5 ? 76 : 88, exporting ? c.color_delivery : T, main, "middle"));
    parts.push(text(200, 282, 34, exporting ? c.color_delivery : c.color_grid, mainUnit, "middle"));
    const below = [];
    if (m.gridImport !== null) below.push(["↓", m.gridImport, c.color_grid]);
    if (m.gridExport !== null && m.gridExport >= SHOW_EXPORT_KWH) below.push(["↑", m.gridExport, c.color_delivery]);
    below.forEach(([arrow, v, color], i) => {
      const x = below.length === 1 ? 200 : 135 + i * 130;
      parts.push(text(x, 408, 32, T, `<tspan fill="${color}">${arrow}</tspan>${fmt(v, 1).text}`, "middle"));
      parts.push(text(x, 438, 22, T, "kWh", "middle"));
    });

    // Small ring, top: home battery state of charge. Green and counterclockwise while discharging.
    const discharging = m.batteryPower !== null && m.batteryPower > BATTERY_DELIVERY_W;
    parts.push(ring(468, 118, 76, 14, frac(m.batterySoc, 100), discharging ? c.color_delivery : c.color_battery, discharging));
    parts.push(text(468, 128, 58, T, m.batterySoc === null ? "–" : fmt(m.batterySoc, 0).text, "middle"));
    parts.push(text(468, 162, 26, T, "%", "middle"));

    // Small ring, bottom: solar today. Always delivery: green, counterclockwise.
    parts.push(ring(468, 330, 76, 14, frac(m.solar, c.goal_solar), c.color_delivery, true));
    parts.push(text(468, 340, 52, T, m.solar === null ? "–" : fmt(m.solar, m.solar >= 100 ? 0 : 1).text, "middle"));
    parts.push(text(468, 374, 26, c.color_delivery, "kWh", "middle"));

    // Right column: grid taken today, solar today, water (auto: flow while water runs).
    parts.push(icon(586, 70, ICONS.grid, c.color_grid));
    parts.push(columnValue(650, 118, m.gridImport, 1, "kWh", fmt, T));
    parts.push(bar(596, 150, 184, frac(m.gridImport, c.goal_grid_import), c.color_grid));
    parts.push(icon(586, 210, ICONS.solar, c.color_delivery));
    parts.push(columnValue(650, 258, m.solar, 1, "kWh", fmt, T));
    parts.push(bar(596, 290, 184, frac(m.solar, c.goal_solar), c.color_delivery));
    const flowing = m.waterFlow !== null && m.waterFlow > 0;
    const showFlow = c.water_display === "flow" || (c.water_display === "auto" && flowing);
    parts.push(icon(586, 350, ICONS.water, c.color_water));
    parts.push(showFlow
      ? columnValue(650, 398, m.waterFlow, 1, "L/min", fmt, T)
      : columnValue(650, 398, m.water, 0, "L", fmt, T));
    parts.push(bar(596, 430, 184, showFlow ? frac(m.waterFlow, c.goal_water_flow) : frac(m.water, c.goal_water), c.color_water));

    // Text for screen readers.
    const say = (v, d, unit) => (v === null ? L.none : `${fmt(v, d).text} ${unit}`);
    const label = [
      `${L.grid} ${m.gridPower === null ? L.none : `${main} ${mainUnit}`}`,
      `${L.import} ${say(m.gridImport, 1, "kWh")}`,
      `${L.export} ${say(m.gridExport, 1, "kWh")}`,
      `${L.battery} ${say(m.batterySoc, 0, "%")}`,
      `${L.solar} ${say(m.solar, 1, "kWh")}`,
      showFlow ? `${L.flow} ${say(m.waterFlow, 1, "L/min")}` : `${L.water} ${say(m.water, 0, "L")}`,
    ].join(", ");

    return `<svg viewBox="0 0 800 480" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}">` +
      `<rect width="800" height="480" fill="${c.color_background}"/>${parts.join("")}</svg>`;
  };

  // ---------------------------------------------------------------- editor

  const FORM_TEXT = {
    en: {
      labels: {
        grid_power: "Grid power",
        grid_import: "Grid import meter(s)",
        grid_export: "Grid export meter(s)",
        solar_energy: "Solar production meter(s)",
        battery_soc: "Home battery state of charge",
        battery_power: "Home battery power",
        battery_power_sign: "Sign of the battery power",
        water: "Water meter(s)",
        water_flow: "Water flow",
        water_display: "Water row shows",
        goals: "Daily goals",
        goal_grid_import: "Grid import (kWh)",
        goal_grid_export: "Grid export (kWh)",
        goal_solar: "Solar (kWh)",
        goal_water: "Water (L)",
        goal_water_flow: "Water flow (L/min)",
        colors: "Colours",
        color_grid: "Grid",
        color_delivery: "Delivery (solar, export, battery)",
        color_battery: "Home battery",
        color_water: "Water",
        color_text: "Text",
        color_background: "Background",
        use_energy_settings: "Use the Energy settings for empty fields",
      },
      helpers: {
        grid_power: "Positive = taking from the grid, negative = returning. Empty: from the Energy settings.",
        grid_import: "Total meter or daily meter; today's value comes from the statistics. Empty: from the Energy settings.",
        grid_export: "Total meter or daily meter. Empty: from the Energy settings.",
        solar_energy: "Total meter or daily meter. Empty: from the Energy settings.",
        battery_soc: "Several batteries: their average. Empty: from the Energy settings.",
        battery_power: "Used to show when the battery delivers. Empty: from the Energy settings.",
        water: "Total meter or daily meter. Empty: from the Energy settings.",
        water_flow: "Empty: from the Energy settings.",
        color_grid: "CSS colour, default #a259ff",
        color_delivery: "CSS colour, default #86d03c",
        color_battery: "CSS colour, default #b9d2e0",
        color_water: "CSS colour, default #3d8ff5",
        color_text: "CSS colour, default #ffffff",
        color_background: "CSS colour, default #05070b",
      },
      sign: { discharge_positive: "Positive = discharging (Home Assistant standard)", charge_positive: "Positive = charging (e.g. HomeWizard Plug-In Battery)" },
      water: { auto: "Automatic: flow while water runs, else litres today", volume: "Litres today", flow: "Flow (L/min)" },
    },
    nl: {
      labels: {
        grid_power: "Netvermogen",
        grid_import: "Afnamemeter(s) net",
        grid_export: "Terugleveringsmeter(s) net",
        solar_energy: "Opbrengstmeter(s) zonnepanelen",
        battery_soc: "Laadstand thuisaccu",
        battery_power: "Vermogen thuisaccu",
        battery_power_sign: "Teken van het accuvermogen",
        water: "Watermeter(s)",
        water_flow: "Waterdebiet",
        water_display: "Waterrij toont",
        goals: "Dagdoelen",
        goal_grid_import: "Afname net (kWh)",
        goal_grid_export: "Teruglevering (kWh)",
        goal_solar: "Zon (kWh)",
        goal_water: "Water (L)",
        goal_water_flow: "Waterdebiet (L/min)",
        colors: "Kleuren",
        color_grid: "Net",
        color_delivery: "Levering (zon, teruglevering, accu)",
        color_battery: "Thuisaccu",
        color_water: "Water",
        color_text: "Tekst",
        color_background: "Achtergrond",
        use_energy_settings: "Lege velden aanvullen uit de Energie-instellingen",
      },
      helpers: {
        grid_power: "Positief = afname van het net, negatief = teruglevering. Leeg: uit de Energie-instellingen.",
        grid_import: "Totaalmeter of dagteller; de waarde van vandaag komt uit de statistieken. Leeg: uit de Energie-instellingen.",
        grid_export: "Totaalmeter of dagteller. Leeg: uit de Energie-instellingen.",
        solar_energy: "Totaalmeter of dagteller. Leeg: uit de Energie-instellingen.",
        battery_soc: "Meerdere accu's: het gemiddelde. Leeg: uit de Energie-instellingen.",
        battery_power: "Bepaalt wanneer de accu levert. Leeg: uit de Energie-instellingen.",
        water: "Totaalmeter of dagteller. Leeg: uit de Energie-instellingen.",
        water_flow: "Leeg: uit de Energie-instellingen.",
        color_grid: "CSS-kleur, standaard #a259ff",
        color_delivery: "CSS-kleur, standaard #86d03c",
        color_battery: "CSS-kleur, standaard #b9d2e0",
        color_water: "CSS-kleur, standaard #3d8ff5",
        color_text: "CSS-kleur, standaard #ffffff",
        color_background: "CSS-kleur, standaard #05070b",
      },
      sign: { discharge_positive: "Positief = ontladen (standaard van Home Assistant)", charge_positive: "Positief = laden (bijv. HomeWizard Plug-In Battery)" },
      water: { auto: "Automatisch: debiet als er water loopt, anders liters vandaag", volume: "Liters vandaag", flow: "Debiet (L/min)" },
    },
  };

  const configForm = (lang) => {
    const t = FORM_TEXT[pickLang(lang)];
    // No device class filter for state of charge and water flow: template and group sensors
    // for those often have none.
    const entity = (name, deviceClass, multiple) => ({
      name,
      selector: {
        entity: {
          multiple: Boolean(multiple),
          filter: deviceClass ? { domain: "sensor", device_class: deviceClass } : { domain: "sensor" },
        },
      },
    });
    const number = (name, max, step, unit) => ({
      name,
      selector: { number: { min: step, max, step, mode: "box", unit_of_measurement: unit } },
    });
    return {
      schema: [
        entity("grid_power", "power"),
        entity("grid_import", "energy", true),
        entity("grid_export", "energy", true),
        entity("solar_energy", "energy", true),
        entity("battery_soc"),
        entity("battery_power", "power"),
        {
          name: "battery_power_sign",
          selector: { select: { mode: "dropdown", options: SIGNS.map((v) => ({ value: v, label: t.sign[v] })) } },
        },
        entity("water", "water", true),
        entity("water_flow"),
        {
          name: "water_display",
          selector: { select: { mode: "dropdown", options: WATER_MODES.map((v) => ({ value: v, label: t.water[v] })) } },
        },
        { name: "use_energy_settings", selector: { boolean: {} } },
        {
          name: "goals",
          type: "expandable",
          flatten: true,
          icon: "mdi:flag-checkered",
          schema: [
            {
              type: "grid",
              name: "",
              schema: [
                number("goal_grid_import", 1000, 0.1, "kWh"),
                number("goal_grid_export", 1000, 0.1, "kWh"),
                number("goal_solar", 1000, 0.1, "kWh"),
                number("goal_water", 100000, 1, "L"),
                number("goal_water_flow", 1000, 0.1, "L/min"),
              ],
            },
          ],
        },
        {
          name: "colors",
          type: "expandable",
          flatten: true,
          icon: "mdi:palette",
          schema: [
            {
              type: "grid",
              name: "",
              schema: COLOR_KEYS.map((name) => ({ name, selector: { text: {} } })),
            },
          ],
        },
      ],
      computeLabel: (schema) => t.labels[schema.name],
      computeHelper: (schema) => t.helpers[schema.name],
      // Anything the form cannot show (for example a colour as [r, g, b]) → YAML editor.
      assertConfig: (config) => {
        for (const key of COLOR_KEYS) {
          if (config[key] !== undefined && typeof config[key] !== "string") {
            throw new Error(`${key} is not a text value`);
          }
        }
        for (const key of ["grid_power", "battery_soc", "battery_power", "water_flow"]) {
          if (Array.isArray(config[key]) && config[key].length > 1) {
            throw new Error(`${key} has more than one entity`);
          }
        }
      },
    };
  };

  return {
    VERSION, TAG, DEFAULTS, normalizeConfig, sourcesFromPrefs, resolveSources, meterIds,
    convert, stateValue, fetchToday, todayValue, computeModel, msToNextRefresh, dayKey,
    numberLocale, formatter, pickLang, editorLang, renderSvg, configForm,
  };
})();

// ------------------------------------------------------------------ custom element

if (typeof HTMLElement !== "undefined" && typeof customElements !== "undefined") {
  class HomeWizardDisplayCard extends HTMLElement {
    static getConfigForm() {
      return HWDC.configForm(HWDC.editorLang());
    }

    static getStubConfig() {
      return {};
    }

    setConfig(config) {
      this._config = HWDC.normalizeConfig(config);
      this._svg = "";
      if (this._hass && this.isConnected) this._refresh();
      else this._render();
    }

    set hass(hass) {
      const first = !this._hass;
      this._hass = hass;
      if (first && this.isConnected) this._refresh();
      else this._render();
    }

    get hass() {
      return this._hass;
    }

    connectedCallback() {
      if (this._hass) this._refresh();
    }

    disconnectedCallback() {
      clearTimeout(this._timer);
      this._timer = null;
      this._run = (this._run || 0) + 1; // a refresh that is still running stops scheduling
    }

    // Reloads the Energy settings and today's statistics, then plans the next refresh.
    async _refresh() {
      if (!this._hass || !this._config) return;
      clearTimeout(this._timer);
      const run = (this._run = (this._run || 0) + 1);
      const hass = this._hass;
      const day = HWDC.dayKey(Date.now(), hass.config && hass.config.time_zone);
      this._loadingDay = day;
      let prefs = null;
      if (this._config.use_energy_settings) {
        try {
          prefs = await hass.callWS({ type: "energy/get_prefs" });
        } catch (e) {
          prefs = null; // no Energy settings yet
        }
      }
      const sources = HWDC.resolveSources(this._config, prefs);
      let today = {};
      try {
        today = await HWDC.fetchToday(hass, HWDC.meterIds(sources), Date.now());
      } catch (e) {
        console.warn(`${HWDC.TAG}:`, e);
      }
      if (run !== this._run) return;
      this._sources = sources;
      this._today = today;
      this._day = day;
      this._timer = setTimeout(() => this._refresh(), HWDC.msToNextRefresh(Date.now()));
      this._render();
    }

    _render() {
      if (!this._config || !this._hass) return;
      try {
        const hass = this._hass;
        const day = HWDC.dayKey(Date.now(), hass.config && hass.config.time_zone);
        if (this._day && day !== this._day && this._loadingDay !== day && this.isConnected) {
          this._refresh(); // a new day started: fetch the new statistics
        }
        const sources = this._sources || HWDC.resolveSources(this._config, null);
        const model = HWDC.computeModel(hass, sources, this._today || {});
        const lang = (hass.locale && hass.locale.language) || hass.language;
        const svg = HWDC.renderSvg(model, this._config, HWDC.formatter(hass), lang);
        if (svg === this._svg) return;
        this._svg = svg;
        if (!this.shadowRoot) {
          this.attachShadow({ mode: "open" });
          this.shadowRoot.innerHTML =
            "<style>" +
            ":host{display:block;height:100%}" +
            "ha-card{display:flex;align-items:center;justify-content:center;height:100%;" +
            "box-sizing:border-box;overflow:hidden;background:var(--hwdc-background)}" +
            "svg{display:block;width:100%;height:100%}" +
            "</style><ha-card></ha-card>";
        }
        const card = this.shadowRoot.querySelector("ha-card");
        card.style.setProperty("--hwdc-background", this._config.color_background);
        card.innerHTML = svg;
      } catch (e) {
        console.warn(`${HWDC.TAG}:`, e);
      }
    }

    getCardSize() {
      return 6;
    }

    getGridOptions() {
      return { columns: 12, rows: "auto", min_columns: 6 };
    }
  }

  if (!customElements.get(HWDC.TAG)) {
    customElements.define(HWDC.TAG, HomeWizardDisplayCard);
    window.customCards = window.customCards || [];
    window.customCards.push({
      type: HWDC.TAG,
      name: "HomeWizard Display Card",
      description: "The Usage Overview screen of the HomeWizard Energy Display: grid, home battery, solar and water at a glance.",
      preview: true,
      documentationURL: "https://github.com/timoverwoest/homewizard_display_card",
    });
    console.info(`%c HomeWizard Display Card %c ${HWDC.VERSION} `, "background:#a259ff;color:#fff", "background:#05070b;color:#fff");
  }
}
