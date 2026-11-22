// HomeWizard Display Card: a Home Assistant dashboard card that recreates the
// "Usage Overview" screen of the HomeWizard Energy Display (800 x 480 SVG).
//
// Inspired by the HomeWizard Energy Display. HomeWizard is a trademark of HomeWizard B.V.
// This is an independent community project; it is not affiliated with, endorsed by, or
// sponsored by HomeWizard. Icons: Material Design Icons (Pictogrammers), Apache License 2.0.
//
// Like the display, the card has three circles and three rows. Each one shows a source
// (grid, solar, home battery, water, gas, ...) in a mode (now, today, auto, costs):
//   type: custom:homewizard-display-card
//   circle_1: {source: grid, mode: now, goal_now: 7000}
//   bottom: {source: gas, mode: today}
// Values come from your own entities or else from the Energy settings.
//
// Source and documentation: https://github.com/timoverwoest/homewizard_display_card
// License: MIT

const HWDC = (() => {
  const VERSION = "0.4.0";
  const TAG = "homewizard-display-card";
  const EDITOR_TAG = "homewizard-display-card-editor";

  // ---------------------------------------------------------------- sources and slots

  // What each source can show (the "Now / Today / Auto / Costs" of the display), the mode it
  // starts with and its default goals. Auto = now while something flows, otherwise today.
  const SOURCES = {
    grid: { modes: ["now", "today", "cost"], start: "now", goals: { now: 7000, today: 25, cost: 10 } },
    solar: { modes: ["now", "today", "auto"], start: "today", goals: { now: 5000, today: 25 } },
    battery: { modes: ["now"], start: "now", goals: { now: 100 } },
    water: { modes: ["now", "today", "auto", "cost"], start: "auto", goals: { now: 10, today: 500, cost: 2 } },
    gas: { modes: ["now", "today", "auto", "cost"], start: "today", goals: { now: 2, today: 5, cost: 10 } },
    consumption: { modes: ["now", "today"], start: "now", goals: { now: 7000, today: 25 } },
    self_sufficiency: { modes: ["now", "today"], start: "today", goals: { now: 100, today: 100 } },
    device: { modes: ["now", "today", "auto"], start: "auto", goals: { now: 3000, today: 10 } },
    entity: { modes: ["now"], start: "now", goals: { now: 100 } },
    none: { modes: [], start: null, goals: {} },
  };
  const GOAL_KEY = { now: "goal_now", today: "goal_today", cost: "goal_cost" };
  const GOAL_KEYS = Object.values(GOAL_KEY);
  const MODE_GOALS = { now: ["now"], today: ["today"], auto: ["now", "today"], cost: ["cost"] };

  // The display's default Usage Overview.
  const SLOTS = ["circle_1", "circle_2", "circle_3", "top", "middle", "bottom"];
  const SLOT_DEFAULTS = {
    circle_1: { source: "grid", mode: "now" },
    circle_2: { source: "battery", mode: "now" },
    circle_3: { source: "solar", mode: "today" },
    top: { source: "grid", mode: "today" },
    middle: { source: "solar", mode: "today" },
    bottom: { source: "water", mode: "auto" },
  };

  const ENTITY_KEYS = [
    "grid_power", "grid_import", "grid_export", "solar_power", "solar_energy",
    "battery_soc", "battery_power", "water", "water_flow", "gas", "gas_flow",
  ];
  // null = no fixed default: the night background follows the day background, and the text
  // colour is worked out from the background.
  const COLOR_DEFAULTS = {
    color_background: "#05070b",
    color_background_dark: null,
    color_grid: "#a259ff",
    color_delivery: "#86d03c",
    color_battery: "#b9d2e0",
    color_water: "#3d8ff5",
    color_gas: "#f5a524",
    color_text: null,
  };
  const COLOR_KEYS = Object.keys(COLOR_DEFAULTS);
  // Darker accents for a light background, so rings, bars and units keep enough contrast.
  // Only used for colours the user did not set.
  const LIGHT_ACCENTS = {
    color_grid: "#7c3aed",
    color_delivery: "#4d8f1a",
    color_battery: "#6d8fa3",
    color_water: "#1f6fd6",
    color_gas: "#c27a00",
  };
  // Suggestions in the editor. The default stays the black of the display, by day and by night.
  const BACKGROUND_SUGGESTIONS = { display: "#05070b", day: "#f4f5f7", night: "#1c1c1c" };
  const SIGNS = ["discharge_positive", "charge_positive"];
  // Charts view: the charts of the HomeWizard app, in the app's order, and its periods.
  const VIEWS = ["display", "charts"];
  const CHARTS = ["water", "gas", "grid", "solar", "consumption", "self_sufficiency", "standby", "battery"];
  const PERIODS = ["day", "week", "month", "year"];
  // A colour ends up inside an SVG attribute, so only plain CSS colour syntax is accepted.
  const COLOR_RE = /^[#a-zA-Z0-9(),.%\s-]{1,64}$/;

  const empty = (v) => v === undefined || v === null || v === "";

  const toList = (v) => {
    if (empty(v)) return [];
    const list = Array.isArray(v) ? v : [v];
    return list.filter((x) => typeof x === "string" && x.trim() !== "").map((x) => x.trim());
  };

  const toColor = (key, v) => {
    if (Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(Number(n)))) {
      return `rgb(${v.map((n) => Math.max(0, Math.min(255, Math.round(Number(n))))).join(",")})`;
    }
    if (typeof v === "string" && COLOR_RE.test(v.trim())) return v.trim();
    throw new Error(`${key}: expected a colour such as #05070b`);
  };

  // Relative luminance (0 = black, 1 = white) of a hex or rgb() colour; null if unknown.
  const luminance = (color) => {
    const s = String(color || "").trim().toLowerCase();
    let rgb = null;
    const hex = s.match(/^#([0-9a-f]{3,8})$/);
    if (hex) {
      const h = hex[1];
      if (h.length === 3 || h.length === 4) rgb = [0, 1, 2].map((i) => parseInt(h[i] + h[i], 16));
      else if (h.length === 6 || h.length === 8) rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    }
    const fn = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
    if (fn) rgb = [fn[1], fn[2], fn[3]].map(Number);
    if (s === "white") rgb = [255, 255, 255];
    if (s === "black") rgb = [0, 0, 0];
    if (!rgb || rgb.some((n) => !Number.isFinite(n))) return null;
    const lin = rgb.map((v) => {
      const c = Math.max(0, Math.min(255, v)) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  };

  // Background and text colour for the current theme: the night background while Home
  // Assistant shows a dark theme (user profile: Auto follows the device), else the day one.
  const effectiveColors = (c, hass) => {
    const dark = Boolean(hass && hass.themes && hass.themes.darkMode);
    const background = dark && c.color_background_dark ? c.color_background_dark : c.color_background;
    const lum = luminance(background);
    const light = lum !== null && lum > 0.4;
    const text = c.color_text || (light ? "#14161a" : "#ffffff");
    const accents = {};
    if (light) {
      for (const [key, value] of Object.entries(LIGHT_ACCENTS)) {
        if (String(c[key]).toLowerCase() === COLOR_DEFAULTS[key]) accents[key] = value;
      }
    }
    return { background, text, dark, accents };
  };

  const normalizeSlot = (key, raw) => {
    const def = SLOT_DEFAULTS[key];
    const r = typeof raw === "string" ? { source: raw } : raw && typeof raw === "object" ? raw : {};
    const source = empty(r.source) ? def.source : r.source;
    const spec = SOURCES[source];
    if (!spec) throw new Error(`${key}.source: expected one of ${Object.keys(SOURCES).join(", ")}`);
    let mode = empty(r.mode) ? (source === def.source ? def.mode : spec.start) : r.mode;
    if (!spec.modes.length) mode = null;
    else if (!spec.modes.includes(mode)) throw new Error(`${key}.mode: ${source} can show ${spec.modes.join(", ")}`);
    const slot = { source, mode };
    for (const [m, g] of Object.entries(spec.goals)) {
      const k = GOAL_KEY[m];
      if (empty(r[k])) {
        slot[k] = g;
      } else {
        const n = Number(r[k]);
        if (!Number.isFinite(n) || n <= 0) throw new Error(`${key}.${k}: expected a number above 0`);
        slot[k] = n;
      }
    }
    const id = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
    if (source === "entity") slot.entity = id(r.entity);
    if (source === "device") {
      slot.power = id(r.power); // W, negative = producing
      slot.energy = id(r.energy); // meter for today
    }
    slot.color = empty(r.color) ? null : toColor(`${key}.color`, r.color);
    return slot;
  };

  // Fills in defaults and checks the values. Throws an Error with a readable message, which
  // Home Assistant shows on the card.
  const normalizeConfig = (config) => {
    if (!config || typeof config !== "object") throw new Error("Invalid configuration");
    const c = {};
    for (const key of ENTITY_KEYS) {
      const v = config[key];
      if (!empty(v) && !(typeof v === "string" || Array.isArray(v))) {
        throw new Error(`${key}: expected an entity id or a list of entity ids`);
      }
      c[key] = toList(v);
    }
    c.battery_power_sign = empty(config.battery_power_sign) ? SIGNS[0] : config.battery_power_sign;
    if (!SIGNS.includes(c.battery_power_sign)) throw new Error(`battery_power_sign: expected ${SIGNS.join(" or ")}`);
    c.use_energy_settings = config.use_energy_settings !== false;
    for (const key of COLOR_KEYS) c[key] = empty(config[key]) ? COLOR_DEFAULTS[key] : toColor(key, config[key]);
    for (const key of SLOTS) c[key] = normalizeSlot(key, config[key]);
    // Charts view, like the charts of the HomeWizard app.
    c.view = empty(config.view) ? "display" : config.view;
    if (!VIEWS.includes(c.view)) throw new Error(`view: expected ${VIEWS.join(" or ")}`);
    c.charts = toList(config.charts);
    for (const k of c.charts) {
      if (!CHARTS.includes(k)) throw new Error(`charts: unknown chart "${k}"; expected ${CHARTS.join(", ")}`);
    }
    c.chart_entities = toList(config.chart_entities);
    c.show_view_switch = config.show_view_switch !== false;
    c.period = empty(config.period) ? "day" : config.period;
    if (!PERIODS.includes(c.period)) throw new Error(`period: expected ${PERIODS.join(", ")}`);
    return c;
  };

  // ---------------------------------------------------------------- Energy settings

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

  const AUTO_KEYS = [
    "gridPower", "gridImport", "gridExport", "gridCost", "gridCompensation", "solarPower", "solar",
    "batterySoc", "batteryPower", "batteryIn", "batteryOut", "water", "waterFlow", "waterCost",
    "gas", "gasFlow", "gasCost", "homePower", "homeEnergy",
  ];

  // Collects statistic and entity ids from the Energy settings (energy/get_prefs) and the cost
  // sensors Home Assistant made for them (energy/info → cost_sensors). Reads the current flat
  // grid format and the older flow_from/flow_to lists.
  const sourcesFromPrefs = (prefs, info) => {
    const out = {};
    AUTO_KEYS.forEach((k) => { out[k] = []; });
    const costs = (info && info.cost_sensors) || {};
    const add = (key, id) => { if (id) out[key].push(id); };
    const list = prefs && Array.isArray(prefs.energy_sources) ? prefs.energy_sources : [];
    for (const s of list) {
      if (!s || typeof s !== "object") continue;
      if (s.type === "grid") {
        const from = [s, ...(s.flow_from || [])].filter((f) => f && f.stat_energy_from);
        const to = [s, ...(s.flow_to || [])].filter((f) => f && f.stat_energy_to);
        from.forEach((f) => { add("gridImport", f.stat_energy_from); add("gridCost", f.stat_cost || costs[f.stat_energy_from]); });
        to.forEach((f) => { add("gridExport", f.stat_energy_to); add("gridCompensation", f.stat_compensation || costs[f.stat_energy_to]); });
        out.gridPower.push(...powerTerms(s));
        (s.power || []).forEach((p) => out.gridPower.push(...powerTerms(p)));
      } else if (s.type === "solar") {
        add("solar", s.stat_energy_from);
        if (s.stat_rate) out.solarPower.push({ id: s.stat_rate, sign: 1 });
      } else if (s.type === "battery") {
        add("batterySoc", s.stat_soc);
        out.batteryPower.push(...powerTerms(s));
        [s.stat_energy_from, s.stat_energy_to_home, s.stat_energy_to_grid].forEach((id) => add("batteryOut", id));
        [s.stat_energy_to, s.stat_energy_from_grid, s.stat_energy_from_solar].forEach((id) => add("batteryIn", id));
      } else if (s.type === "water" || s.type === "gas") {
        add(s.type, s.stat_energy_from);
        if (s.stat_rate) out[`${s.type}Flow`].push({ id: s.stat_rate, sign: 1 });
        add(`${s.type}Cost`, s.stat_cost || costs[s.stat_energy_from]);
      } else if (s.type === "home") {
        if (s.stat_rate) out.homePower.push({ id: s.stat_rate, sign: 1 });
        add("homeEnergy", s.stat_energy_to);
      }
    }
    for (const k of AUTO_KEYS) {
      const seen = new Set();
      out[k] = out[k].filter((x) => {
        const id = typeof x === "string" ? x : x.id;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    }
    return out;
  };

  // Per value: entities from the card configuration first, otherwise the Energy settings.
  // Costs always come from the Energy settings.
  const resolveSources = (config, prefs, info) => {
    const use = config.use_energy_settings;
    const auto = sourcesFromPrefs(use ? prefs : null, use ? info : null);
    const pick = (own, fallback) => (own.length ? own : fallback);
    const terms = (ids, sign) => ids.map((id) => ({ id, sign }));
    const batterySign = config.battery_power_sign === "charge_positive" ? -1 : 1;
    return {
      ...auto,
      gridPower: pick(terms(config.grid_power, 1), auto.gridPower),
      gridImport: pick(config.grid_import, auto.gridImport),
      gridExport: pick(config.grid_export, auto.gridExport),
      solarPower: pick(terms(config.solar_power, 1), auto.solarPower),
      solar: pick(config.solar_energy, auto.solar),
      batterySoc: pick(config.battery_soc, auto.batterySoc),
      batteryPower: pick(terms(config.battery_power, batterySign), auto.batteryPower),
      water: pick(config.water, auto.water),
      waterFlow: pick(terms(config.water_flow, 1), auto.waterFlow),
      gas: pick(config.gas, auto.gas),
      gasFlow: pick(terms(config.gas_flow, 1), auto.gasFlow),
    };
  };

  const needsCosts = (config) => SLOTS.some((k) => config[k] && config[k].mode === "cost");

  // Ids whose "today" value comes from the recorder statistics.
  const meterIds = (src, withCosts) => [...new Set([
    ...src.gridImport, ...src.gridExport, ...src.solar, ...src.batteryIn, ...src.batteryOut,
    ...src.water, ...src.gas, ...src.homeEnergy,
    ...(withCosts ? [...src.gridCost, ...src.gridCompensation, ...src.waterCost, ...src.gasCost] : []),
  ])];

  // Meters of "device" slots (Energy Socket, kWh Meter) for their "today" value.
  const slotMeterIds = (config) => [...new Set(SLOTS
    .map((k) => config[k])
    .filter((s) => s && s.source === "device" && s.energy)
    .map((s) => s.energy))];

  // ---------------------------------------------------------------- units

  const FACTORS = {
    // "Wh/h" and "kWh/h": what a derivative helper on an energy meter reports.
    power: { mW: 0.001, W: 1, kW: 1e3, MW: 1e6, GW: 1e9, "Wh/h": 1, "kWh/h": 1e3 },
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
      "ft³/min": 28.316846592, "ft³/h": 28.316846592 / 60,
    },
  };
  // Unit to assume when an entity has none.
  const BASE_UNIT = { power: "W", energy: "kWh", volume: null, flow: "L/min" };

  // Converts a value to W, kWh, L or L/min ("raw": unchanged). Returns null for an unknown unit.
  const convert = (value, unit, kind) => {
    if (!Number.isFinite(value)) return null;
    if (kind === "raw") return value;
    const u = empty(unit) ? BASE_UNIT[kind] : unit;
    const f = u === null ? undefined : FACTORS[kind][u];
    return f === undefined ? null : value * f;
  };

  const entityOf = (hass, id) => (hass && hass.states ? hass.states[id] : undefined);
  const unitOf = (hass, id) => {
    const st = entityOf(hass, id);
    return st && st.attributes ? st.attributes.unit_of_measurement : undefined;
  };

  const stateValue = (hass, id, kind) => {
    const st = entityOf(hass, id);
    if (!st) return null;
    const v = parseFloat(st.state);
    if (!Number.isFinite(v)) return null;
    return convert(v, unitOf(hass, id), kind);
  };

  // Gas is a volume in most countries, but some meters count it in kWh.
  const gasKind = (hass, id) => (FACTORS.energy[unitOf(hass, id)] !== undefined ? "energy" : "volume");

  // ---------------------------------------------------------------- today (statistics)

  // Water and gas come back in litres; energy in kWh; costs in their own currency.
  const STAT_UNITS = { energy: "kWh", volume: "L" };

  // Asks the recorder for today's change of every meter, plus the last 5-minute state so the
  // card can add what happened since. Returns {id: {change, lastState, hasStats}}.
  const fetchToday = async (hass, ids, now) => {
    const result = {};
    if (!ids.length) return result;
    let recent = {};
    try {
      recent = (await hass.callWS({
        type: "recorder/statistics_during_period",
        start_time: new Date(now - 30 * 60 * 1000).toISOString(),
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
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const computeModel = (hass, src, today) => {
    const power = (terms, kind) => sumOf(terms.map((t) => {
      const v = stateValue(hass, t.id, kind || "power");
      return v === null ? null : v * t.sign;
    }));
    const meters = (ids, kind) => sumOf(ids.map((id) => todayValue(hass, id, kind, today)));
    const soc = src.batterySoc.map((id) => stateValue(hass, id, "raw")).filter((v) => v !== null);
    const gasEnergy = src.gas.length > 0 && gasKind(hass, src.gas[0]) === "energy";
    const gasToday = meters(src.gas, gasEnergy ? "energy" : "volume");
    const gasFlow = power(src.gasFlow, "flow");
    const costOf = (ids) => meters(ids, "raw");

    const m = {
      gridPower: power(src.gridPower),
      gridImport: meters(src.gridImport, "energy"),
      gridExport: meters(src.gridExport, "energy"),
      solarPower: power(src.solarPower),
      solar: meters(src.solar, "energy"),
      batterySoc: soc.length ? soc.reduce((a, b) => a + b, 0) / soc.length : null,
      batteryPower: power(src.batteryPower),
      batteryIn: meters(src.batteryIn, "energy"),
      batteryOut: meters(src.batteryOut, "energy"),
      water: meters(src.water, "volume"),
      waterFlow: power(src.waterFlow, "flow"),
      waterCost: costOf(src.waterCost),
      gas: gasToday === null ? null : gasEnergy ? gasToday : gasToday / 1000,
      gasUnit: gasEnergy ? "kWh" : "m³",
      gasFlow: gasFlow === null ? null : gasFlow * 0.06, // L/min → m³/h
      gasCost: costOf(src.gasCost),
      homePower: power(src.homePower),
      homeEnergy: meters(src.homeEnergy, "energy"),
    };
    const cost = costOf(src.gridCost);
    const comp = costOf(src.gridCompensation);
    m.gridCost = cost === null && comp === null ? null : (cost || 0) - (comp || 0);

    // Electricity use of the house: what came from the grid, the sun and the battery.
    m.consumptionNow = m.homePower !== null ? m.homePower
      : m.gridPower === null ? null : Math.max(0, m.gridPower + (m.solarPower || 0) + (m.batteryPower || 0));
    m.consumptionToday = m.homeEnergy !== null ? m.homeEnergy
      : m.gridImport === null ? null
        : Math.max(0, m.gridImport - (m.gridExport || 0) + (m.solar || 0) + (m.batteryOut || 0) - (m.batteryIn || 0));
    // Self-sufficiency: the share of that use that did not come from the grid.
    m.selfNow = m.consumptionNow > 0 && m.gridPower !== null
      ? clamp((1 - Math.max(0, m.gridPower) / m.consumptionNow) * 100, 0, 100) : null;
    m.selfToday = m.consumptionToday > 0 && m.gridImport !== null
      ? clamp((1 - m.gridImport / m.consumptionToday) * 100, 0, 100) : null;
    return m;
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
    const fmt = (value, decimals) => {
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
    fmt.currency = currencySymbol(hass, loc);
    return fmt;
  };

  const currencySymbol = (hass, loc) => {
    const code = (hass && hass.config && hass.config.currency) || "EUR";
    try {
      const part = new Intl.NumberFormat(loc, { style: "currency", currency: code }).formatToParts(1).find((p) => p.type === "currency");
      return part ? part.value : code;
    } catch (e) {
      return code;
    }
  };

  const pickLang = (lang) => (String(lang || "").toLowerCase().startsWith("nl") ? "nl" : "en");

  const editorLang = (hass) => {
    const fromHass = hass && ((hass.locale && hass.locale.language) || hass.language);
    if (fromHass) return pickLang(fromHass);
    try {
      return pickLang((typeof document !== "undefined" && document.documentElement.lang) ||
        (typeof navigator !== "undefined" && navigator.language) || "en");
    } catch (e) {
      return "en";
    }
  };

  const TEXT = {
    en: {
      source: {
        grid: "Main connection", solar: "Solar panels", battery: "Home battery", water: "Water", gas: "Gas",
        consumption: "Electricity use", self_sufficiency: "Self-sufficient", device: "Device (socket, kWh meter)",
        entity: "Own sensor", none: "None",
      },
      mode: { now: "Now", today: "Today", auto: "Auto", cost: "Costs" },
      modeHelp: {
        now: "Shows the current use",
        today: "Shows the total of today",
        auto: "Switches automatically between the total of today and the current use",
        cost: "Shows today's costs from the Energy settings",
      },
      slot: { circle_1: "Circle 1", circle_2: "Circle 2", circle_3: "Circle 3", top: "Top", middle: "Middle", bottom: "Bottom" },
      none: "no data",
      labels: {
        source: "Show",
        mode: "Mode",
        view: "Card view",
        show_view_switch: "Button on the card to switch between display and charts",
        charts_group: "Charts",
        charts: "Charts to show",
        chart_entities: "Own sensors as charts",
        period: "Start period",
        entity: "Sensor",
        power: "Power sensor",
        energy: "Energy meter",
        goal_now: "Maximum goal now",
        goal_today: "Maximum goal today",
        goal_cost: "Maximum goal costs",
        color: "Colour (optional)",
        color_background: "Background colour, day (light theme)",
        color_background_dark: "Background colour, night (dark theme)",
        sources: "Sensors",
        grid_power: "Grid power",
        grid_import: "Grid import meter(s)",
        grid_export: "Grid export meter(s)",
        solar_power: "Solar power",
        solar_energy: "Solar production meter(s)",
        battery_soc: "Home battery state of charge",
        battery_power: "Home battery power",
        battery_power_sign: "Sign of the battery power",
        water: "Water meter(s)",
        water_flow: "Water flow",
        gas: "Gas meter(s)",
        gas_flow: "Gas flow",
        use_energy_settings: "Use the Energy settings for empty fields",
        colors: "Colours",
        color_grid: "Grid and electricity use",
        color_delivery: "Delivery (solar, export, battery)",
        color_battery: "Home battery",
        color_water: "Water",
        color_gas: "Gas",
        color_text: "Text",
      },
      helpers: {
        color_background: "Pick a suggestion or type your own hex colour",
        color_background_dark: "While Home Assistant shows a dark theme; empty = same as day",
        color_text: "Empty = automatic: white on a dark background, black on a light one",
        charts: "None selected = every chart there is data for",
        chart_entities: "For example a temperature or humidity",
        sources: "Leave empty to use the Energy settings",
        grid_power: "Positive = taking from the grid, negative = returning",
        grid_import: "Total meter or daily meter; today's value comes from the statistics",
        battery_power: "Used to show when the battery delivers",
        water_flow: "Not in your Energy settings? Choose the flow sensor of your water meter",
        gas_flow: "No flow sensor? See the README: a derivative helper makes one",
        color: "Hex colour; empty = the default colour of this source",
        entity: "Any sensor with a number, for example a temperature",
        power: "In W or kW; negative = producing",
        energy: "Total meter in kWh; today's value comes from the statistics",
      },
      sign: { discharge_positive: "Positive = discharging (Home Assistant standard)", charge_positive: "Positive = charging (e.g. HomeWizard Plug-In Battery)" },
      view: { display: "Display (Usage Overview)", charts: "Charts (like the HomeWizard app)" },
      bg: {
        display: "Black of the display #05070b (default)",
        day: "Light #f4f5f7: fits a light theme",
        night: "Dark grey #1c1c1c: fits a dark theme",
      },
    },
    nl: {
      source: {
        grid: "Hoofdaansluiting", solar: "Zonnepanelen", battery: "Thuisaccu", water: "Water", gas: "Gasverbruik",
        consumption: "Stroomverbruik", self_sufficiency: "Zelfvoorzienend", device: "Apparaat (stopcontact, kWh-meter)",
        entity: "Eigen sensor", none: "Geen",
      },
      mode: { now: "Nu", today: "Vandaag", auto: "Auto", cost: "Kosten" },
      modeHelp: {
        now: "Toont het huidig verbruik",
        today: "Toont het totaal van vandaag",
        auto: "Schakelt automatisch tussen het totaal van vandaag of het huidig verbruik",
        cost: "Toont de kosten van vandaag uit de Energie-instellingen",
      },
      slot: { circle_1: "Cirkel 1", circle_2: "Cirkel 2", circle_3: "Cirkel 3", top: "Bovenaan", middle: "Midden", bottom: "Onderaan" },
      none: "geen gegevens",
      labels: {
        source: "Grafiek",
        mode: "Weergave",
        view: "Weergave van de kaart",
        show_view_switch: "Knop op de kaart om te wisselen tussen display en grafieken",
        charts_group: "Grafieken",
        charts: "Grafieken om te tonen",
        chart_entities: "Eigen sensoren als grafiek",
        period: "Startperiode",
        entity: "Sensor",
        power: "Vermogenssensor",
        energy: "Energiemeter",
        goal_now: "Maximaal doel nu",
        goal_today: "Maximaal doel vandaag",
        goal_cost: "Maximaal doel kosten",
        color: "Kleur (optioneel)",
        color_background: "Achtergrondkleur dag (licht thema)",
        color_background_dark: "Achtergrondkleur nacht (donker thema)",
        sources: "Sensoren",
        grid_power: "Netvermogen",
        grid_import: "Afnamemeter(s) net",
        grid_export: "Terugleveringsmeter(s) net",
        solar_power: "Vermogen zonnepanelen",
        solar_energy: "Opbrengstmeter(s) zonnepanelen",
        battery_soc: "Laadstand thuisaccu",
        battery_power: "Vermogen thuisaccu",
        battery_power_sign: "Teken van het accuvermogen",
        water: "Watermeter(s)",
        water_flow: "Waterdebiet",
        gas: "Gasmeter(s)",
        gas_flow: "Gasdebiet",
        use_energy_settings: "Lege velden aanvullen uit de Energie-instellingen",
        colors: "Kleuren",
        color_grid: "Net en stroomverbruik",
        color_delivery: "Levering (zon, teruglevering, accu)",
        color_battery: "Thuisaccu",
        color_water: "Water",
        color_gas: "Gas",
        color_text: "Tekst",
      },
      helpers: {
        color_background: "Kies een voorstel of typ een eigen hex-kleur",
        color_background_dark: "Zolang Home Assistant een donker thema toont; leeg = zelfde als overdag",
        color_text: "Leeg = automatisch: wit op een donkere achtergrond, zwart op een lichte",
        charts: "Niets gekozen = alle grafieken waarvoor gegevens zijn",
        chart_entities: "Bijvoorbeeld een temperatuur of luchtvochtigheid",
        sources: "Leeg laten = uit de Energie-instellingen",
        grid_power: "Positief = afname van het net, negatief = teruglevering",
        grid_import: "Totaalmeter of dagteller; de waarde van vandaag komt uit de statistieken",
        battery_power: "Bepaalt wanneer de accu levert",
        water_flow: "Niet in je Energie-instellingen? Kies de debietsensor van je watermeter",
        gas_flow: "Geen debietsensor? Zie de README: een afgeleide-hulpsensor maakt er een",
        color: "Hex-kleur; leeg = de standaardkleur van deze bron",
        entity: "Elke sensor met een getal, bijvoorbeeld een temperatuur",
        power: "In W of kW; negatief = opwek",
        energy: "Totaalmeter in kWh; de waarde van vandaag komt uit de statistieken",
      },
      sign: { discharge_positive: "Positief = ontladen (standaard van Home Assistant)", charge_positive: "Positief = laden (bijv. HomeWizard Plug-In Battery)" },
      view: { display: "Display (Usage Overview)", charts: "Grafieken (zoals de HomeWizard-app)" },
      bg: {
        display: "Zwart van het display #05070b (standaard)",
        day: "Licht #f4f5f7: past bij een licht thema",
        night: "Donkergrijs #1c1c1c: past bij een donker thema",
      },
    },
  };

  // ---------------------------------------------------------------- what a slot shows

  const ICONS = {
    // Material Design Icons: transmission-tower, white-balance-sunny, water-outline,
    // home-battery-outline, fire, power-plug-outline, sun-clock-outline, thermometer,
    // water-percent, gauge
    grid: "M8.28,5.45L6.5,4.55L7.76,2H16.23L17.5,4.55L15.72,5.44L15,4H9L8.28,5.45M18.62,8H14.09L13.3,5H10.7L9.91,8H5.38L4.1,10.55L5.89,11.44L6.62,10H17.38L18.1,11.45L19.89,10.56L18.62,8M17.77,22H15.7L15.46,21.1L12,15.9L8.53,21.1L8.3,22H6.23L9.12,11H11.19L10.83,12.35L12,14.1L13.16,12.35L12.81,11H14.88L17.77,22M11.4,15L10.5,13.65L9.32,18.13L11.4,15M14.68,18.12L13.5,13.64L12.6,15L14.68,18.12Z",
    solar: "M3.55 19.09L4.96 20.5L6.76 18.71L5.34 17.29M12 6C8.69 6 6 8.69 6 12S8.69 18 12 18 18 15.31 18 12C18 8.68 15.31 6 12 6M20 13H23V11H20M17.24 18.71L19.04 20.5L20.45 19.09L18.66 17.29M20.45 5L19.04 3.6L17.24 5.39L18.66 6.81M13 1H11V4H13M6.76 5.39L4.96 3.6L3.55 5L5.34 6.81L6.76 5.39M1 13H4V11H1M13 20H11V23H13",
    water: "M12,3.77L11.25,4.61C11.25,4.61 9.97,6.06 8.68,7.94C7.39,9.82 6,12.07 6,14.23A6,6 0 0,0 12,20.23A6,6 0 0,0 18,14.23C18,12.07 16.61,9.82 15.32,7.94C14.03,6.06 12.75,4.61 12.75,4.61L12,3.77M12,6.9C12.44,7.42 12.84,7.85 13.68,9.07C14.89,10.83 16,13.07 16,14.23C16,16.45 14.22,18.23 12,18.23C9.78,18.23 8,16.45 8,14.23C8,13.07 9.11,10.83 10.32,9.07C11.16,7.85 11.56,7.42 12,6.9Z",
    battery: "M15 9H16V7.5H20V9H21C21.55 9 22 9.45 22 10V21C22 21.55 21.55 22 21 22H15C14.45 22 14 21.55 14 21V10C14 9.45 14.45 9 15 9M16 11V14H20V11H16M12 5.69L7 10.19V18H12V20H5V12H2L12 3L14.78 5.5H14V7.17L13.76 7.27L12 5.69Z",
    gas: "M17.66 11.2C17.43 10.9 17.15 10.64 16.89 10.38C16.22 9.78 15.46 9.35 14.82 8.72C13.33 7.26 13 4.85 13.95 3C13 3.23 12.17 3.75 11.46 4.32C8.87 6.4 7.85 10.07 9.07 13.22C9.11 13.32 9.15 13.42 9.15 13.55C9.15 13.77 9 13.97 8.8 14.05C8.57 14.15 8.33 14.09 8.14 13.93C8.08 13.88 8.04 13.83 8 13.76C6.87 12.33 6.69 10.28 7.45 8.64C5.78 10 4.87 12.3 5 14.47C5.06 14.97 5.12 15.47 5.29 15.97C5.43 16.57 5.7 17.17 6 17.7C7.08 19.43 8.95 20.67 10.96 20.92C13.1 21.19 15.39 20.8 17.03 19.32C18.86 17.66 19.5 15 18.56 12.72L18.43 12.46C18.22 12 17.66 11.2 17.66 11.2M14.5 17.5C14.22 17.74 13.76 18 13.4 18.1C12.28 18.5 11.16 17.94 10.5 17.28C11.69 17 12.4 16.12 12.61 15.23C12.78 14.43 12.46 13.77 12.33 13C12.21 12.26 12.23 11.63 12.5 10.94C12.69 11.32 12.89 11.7 13.13 12C13.9 13 15.11 13.44 15.37 14.8C15.41 14.94 15.43 15.08 15.43 15.23C15.46 16.05 15.1 16.95 14.5 17.5H14.5Z",
    consumption: "M16 7V3H14V7H10V3H8V7C7 7 6 8 6 9V14.5L9.5 18V21H14.5V18L18 14.5V9C18 8 17 7 16 7M16 13.67L13.09 16.59L12.67 17H11.33L10.92 16.59L8 13.67V9.09C8 9.06 8.06 9 8.09 9H15.92C15.95 9 16 9.06 16 9.09V13.67Z",
    self_sufficiency: "M18.1 9.32L19.65 6L15.5 5.64C16.1 6.15 16.63 6.78 17.05 7.5C17.37 8.05 17.58 8.63 17.73 9.22C17.18 9.08 16.6 9 16 9C15.86 9 15.72 9 15.58 9C14.81 7.25 13.06 6 11 6C8.24 6 6 8.24 6 11C6 13.06 7.25 14.81 9 15.58C9 15.72 9 15.86 9 16C9 19.87 12.13 23 16 23S23 19.87 23 16C23 12.87 20.94 10.21 18.1 9.32M8 11C8 9.35 9.35 8 11 8C12.08 8 13.03 8.58 13.56 9.45C11.66 10.15 10.15 11.66 9.45 13.56C8.58 13.03 8 12.08 8 11M16 21C13.24 21 11 18.76 11 16S13.24 11 16 11 21 13.24 21 16 18.76 21 16 21M16.5 16.25L19.36 17.94L18.61 19.16L15 17V12H16.5V16.25M11 4C10.16 4 9.35 4.15 8.61 4.42L11 1L13.39 4.42C12.65 4.15 11.84 4 11 4M4.95 14.5C5.37 15.24 5.91 15.86 6.5 16.37L2.36 16L4.12 12.23C4.26 13 4.53 13.78 4.95 14.5M4.11 9.79L2.34 6L6.5 5.65C5.9 6.16 5.36 6.78 4.94 7.5C4.5 8.24 4.25 9 4.11 9.79Z",
    temperature: "M15 13V5A3 3 0 0 0 9 5V13A5 5 0 1 0 15 13M12 4A1 1 0 0 1 13 5V8H11V5A1 1 0 0 1 12 4Z",
    humidity: "M12,3.25C12,3.25 6,10 6,14C6,17.32 8.69,20 12,20A6,6 0 0,0 18,14C18,10 12,3.25 12,3.25M14.47,9.97L15.53,11.03L9.53,17.03L8.47,15.97M9.75,10A1.25,1.25 0 0,1 11,11.25A1.25,1.25 0 0,1 9.75,12.5A1.25,1.25 0 0,1 8.5,11.25A1.25,1.25 0 0,1 9.75,10M14.25,14.5A1.25,1.25 0 0,1 15.5,15.75A1.25,1.25 0 0,1 14.25,17A1.25,1.25 0 0,1 13,15.75A1.25,1.25 0 0,1 14.25,14.5Z",
    to_charts: "M17.45,15.18L22,7.31V19L22,21H2V3H4V15.54L9.5,6L16,9.78L20.24,2.45L21.97,3.45L16.74,12.5L10.23,8.75L4.31,19H6.57L10.96,11.44L17.45,15.18Z",
    to_display: "M21,16V4H3V16H21M21,2A2,2 0 0,1 23,4V16A2,2 0 0,1 21,18H14V20H16V22H8V20H10V18H3C1.89,18 1,17.1 1,16V4C1,2.89 1.89,2 3,2H21M5,6H14V11H5V6M15,6H19V8H15V6M19,9V14H15V9H19M5,12H9V14H5V12M10,12H14V14H10V12Z",
    entity: "M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12C20,14.4 19,16.5 17.3,18C15.9,16.7 14,16 12,16C10,16 8.2,16.7 6.7,18C5,16.5 4,14.4 4,12A8,8 0 0,1 12,4M14,5.89C13.62,5.9 13.26,6.15 13.1,6.54L11.81,9.77L11.71,10C11,10.13 10.41,10.6 10.14,11.26C9.73,12.29 10.23,13.45 11.26,13.86C12.29,14.27 13.45,13.77 13.86,12.74C14.12,12.08 14,11.32 13.57,10.76L13.67,10.5L14.96,7.29L14.97,7.26C15.17,6.75 14.92,6.17 14.41,5.96C14.28,5.91 14.15,5.89 14,5.89M10,6A1,1 0 0,0 9,7A1,1 0 0,0 10,8A1,1 0 0,0 11,7A1,1 0 0,0 10,6M7,9A1,1 0 0,0 6,10A1,1 0 0,0 7,11A1,1 0 0,0 8,10A1,1 0 0,0 7,9M17,9A1,1 0 0,0 16,10A1,1 0 0,0 17,11A1,1 0 0,0 18,10A1,1 0 0,0 17,9Z",
  };
  const BATTERY_DELIVERY_W = 20; // below this the battery counts as idle (standby noise)

  const frac = (v, goal) => (v === null || !goal ? 0 : clamp(Math.abs(v) / goal, 0, 1));

  // What one circle or row shows: value, how to format it, arc/bar fraction, colour and direction.
  // Taking energy: clockwise. Delivering (export, solar, battery discharging, self-sufficiency):
  // green and counterclockwise.
  const slotView = (key, slot, m, hass, c, today) => {
    const circle = key.startsWith("circle");
    // Delivery: green and counterclockwise. Only a negative grid or device value also gets a
    // green number, like the display does for the main connection.
    const delivery = { color: c.color_delivery, ccw: true };
    const negative = { ...delivery, green: true };
    const make = (value, type, goalMode, color, extra) => ({
      value, type, frac: frac(value, slot[GOAL_KEY[goalMode]]), color, ccw: false, green: false, icon: slot.source, ...extra,
    });
    const own = (dflt) => slot.color || dflt;
    const flowing = (v) => v !== null && v > 0;
    switch (slot.source) {
      case "grid": {
        const color = own(c.color_grid);
        if (slot.mode === "now") {
          const v = m.gridPower;
          return make(v, "power", "now", color, v !== null && v < 0 ? negative : {});
        }
        if (slot.mode === "cost") {
          const v = m.gridCost;
          return make(v, "money", "cost", color, v !== null && v < 0 ? negative : {});
        }
        if (circle && m.gridPower !== null && m.gridPower < 0) return make(m.gridExport, "energy", "today", color, negative);
        return make(m.gridImport, "energy", "today", color);
      }
      case "solar": {
        const d = { ...delivery, color: own(c.color_delivery) };
        const useNow = slot.mode === "now" || (slot.mode === "auto" && flowing(m.solarPower));
        return useNow ? make(m.solarPower, "power", "now", d.color, d) : make(m.solar, "energy", "today", d.color, d);
      }
      case "device": {
        // Energy Socket, kWh Meter and the like: negative power = producing (delivery).
        const color = own(c.color_grid);
        const power = slot.power ? stateValue(hass, slot.power, "power") : null;
        const useNow = slot.mode === "now" || (slot.mode === "auto" && power !== null && power !== 0);
        if (useNow) return make(power, "power", "now", color, { icon: "consumption", ...(power !== null && power < 0 ? negative : {}) });
        const v = slot.energy ? todayValue(hass, slot.energy, "energy", today) : null;
        return make(v, "energy", "today", color, { icon: "consumption" });
      }
      case "battery": {
        const discharging = m.batteryPower !== null && m.batteryPower > BATTERY_DELIVERY_W;
        return make(m.batterySoc, "percent", "now", own(c.color_battery), { unitColor: c.color_text, ...(discharging ? delivery : {}) });
      }
      case "water":
      case "gas": {
        const water = slot.source === "water";
        const color = own(water ? c.color_water : c.color_gas);
        const now = water ? m.waterFlow : m.gasFlow;
        const today = water ? m.water : m.gas;
        if (slot.mode === "cost") return make(water ? m.waterCost : m.gasCost, "money", "cost", color);
        const useNow = slot.mode === "now" || (slot.mode === "auto" && flowing(now));
        if (useNow) return make(now, water ? "flow" : "gasflow", "now", color);
        const type = water ? "volume" : m.gasUnit === "kWh" ? "energy" : "m3";
        return make(today, type, "today", color);
      }
      case "consumption":
        return slot.mode === "now"
          ? make(m.consumptionNow, "power", "now", own(c.color_grid))
          : make(m.consumptionToday, "energy", "today", own(c.color_grid));
      case "self_sufficiency": {
        const d = { ...delivery, color: own(c.color_delivery) };
        return make(slot.mode === "now" ? m.selfNow : m.selfToday, "percent", slot.mode, d.color, d);
      }
      case "entity": {
        const id = slot.entity;
        const v = id ? stateValue(hass, id, "raw") : null;
        const st = id ? entityOf(hass, id) : undefined;
        const dc = st && st.attributes ? st.attributes.device_class : undefined;
        return make(v, "entity", "now", own(c.color_battery), {
          unit: unitOf(hass, id) || "",
          icon: dc === "temperature" ? "temperature" : dc === "humidity" ? "humidity" : "entity",
        });
      }
      default:
        return null;
    }
  };

  // Number and unit for a view. Circles switch to kW from 10 kW, rows from 1 kW.
  const formatView = (view, fmt, circle) => {
    const v = view.value;
    if (v === null) return { text: "–", int: "–", frac: "", unit: view.unit || "" };
    const out = (f, unit) => ({ ...f, unit });
    const abs = Math.abs(v);
    switch (view.type) {
      case "power":
        return abs >= (circle ? 10000 : 1000) ? out(fmt(v / 1000, 1), "kW") : out(fmt(v, 0), "W");
      case "energy":
        return out(fmt(v, circle && abs >= 100 ? 0 : 1), "kWh");
      case "volume":
        return out(fmt(v, 0), "L");
      case "flow":
        return out(fmt(v, 1), "L/min");
      case "m3":
        return out(fmt(v, abs < 10 ? 2 : abs < 100 ? 1 : 0), "m³");
      case "gasflow":
        return out(fmt(v, 2), "m³/h");
      case "percent":
        return out(fmt(v, 0), "%");
      case "money":
        return out(fmt(v, 2), fmt.currency || "€");
      default:
        return out(fmt(v, Number.isInteger(v) ? 0 : abs < 100 ? 1 : 0), view.unit || "");
    }
  };

  // ---------------------------------------------------------------- SVG

  const FONT = 'font-family="Roboto, Noto, Helvetica, Arial, sans-serif" font-weight="700"';

  // Ring: dimmed track plus an arc from 12 o'clock with round caps (a small value is a dot).
  // Counterclockwise = the clockwise arc mirrored in the vertical axis.
  const ring = (cx, cy, r, w, f, color, ccw) => {
    const len = 2 * Math.PI * r;
    let s = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-opacity="0.3" stroke-width="${w}"/>`;
    if (f > 0) {
      const mirror = ccw ? `matrix(-1 0 0 1 ${2 * cx} 0) ` : "";
      s += `<circle class="arc${ccw ? " ccw" : ""}" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${Math.max(f * len, 0.01).toFixed(2)} ${len.toFixed(2)}" transform="${mirror}rotate(-90 ${cx} ${cy})"/>`;
    }
    return s;
  };

  // Bar: dimmed track plus the filled part. Taking energy fills from left to right, delivering
  // from right to left (like the display's line widgets).
  const bar = (x, y, w, f, color, rtl) => {
    let s = `<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y}" stroke="${color}" stroke-opacity="0.3" stroke-width="7" stroke-linecap="round"/>`;
    if (f > 0) {
      const len = Math.max(f * w, 1);
      const [x1, x2] = rtl ? [x + w, x + w - len] : [x, x + len];
      s += `<line class="fill${rtl ? " rtl" : ""}" x1="${x1}" y1="${y}" x2="${x2.toFixed(1)}" y2="${y}" stroke="${color}" stroke-width="7" stroke-linecap="round"/>`;
    }
    return s;
  };

  const icon = (x, y, path, color) => `<path transform="translate(${x} ${y}) scale(1.9)" fill="${color}" d="${path}"/>`;

  const text = (x, y, size, color, content, anchor, opacity) =>
    `<text x="${x}" y="${y}"${anchor ? ` text-anchor="${anchor}"` : ""} ${FONT} font-size="${size}" fill="${color}"${opacity ? ` fill-opacity="${opacity}"` : ""}>${content}</text>`;

  // Characters that are not plain digits get escaped, in case an entity unit contains "<" or "&".
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

  const GEOMETRY = {
    circle_1: { cx: 200, cy: 205, r: 140, w: 24, big: true },
    circle_2: { cx: 468, cy: 118, r: 76, w: 14 },
    circle_3: { cx: 468, cy: 330, r: 76, w: 14 },
    top: { y: 118 },
    middle: { y: 258 },
    bottom: { y: 398 },
  };

  const renderCircle = (g, view, f, c) => {
    if (!view) return "";
    let s = ring(g.cx, g.cy, g.r, g.w, view.frac, view.color, view.ccw);
    const len = f.text.length;
    const numberColor = view.green ? c.color_delivery : c.color_text;
    if (g.big) {
      const size = len >= 6 ? 64 : len >= 5 ? 76 : 88;
      s += text(g.cx, g.cy + 27, size, numberColor, esc(f.text), "middle");
      s += text(g.cx, g.cy + 77, 34, view.unitColor || view.color, esc(f.unit), "middle");
    } else {
      const size = len >= 6 ? 38 : len >= 5 ? 44 : len >= 4 ? 52 : 58;
      s += text(g.cx, g.cy + 10, size, numberColor, esc(f.text), "middle");
      s += text(g.cx, g.cy + 44, 26, view.unitColor || view.color, esc(f.unit), "middle");
    }
    return s;
  };

  // Row in display style: icon, big whole number, then the unit (small, top) and the decimal
  // (small and grey, below), and a bar. Width estimated at 0.57 em per character (Roboto digits
  // are 0.56 em).
  const renderRow = (g, view, f, c) => {
    if (!view) return "";
    const y = g.y;
    let s = icon(586, y - 48, ICONS[view.icon] || ICONS.entity, view.color);
    if (view.value === null) {
      s += text(650, y, 52, c.color_text, "–");
    } else {
      // Shrink the big digits when number and unit would run past the end of the bar (x = 780).
      const unitWidth = Math.max(f.unit.length, f.frac.length * 1.3) * 22 * 0.6;
      const size = Math.min(52, Math.floor((780 - 650 - 6 - unitWidth) / (Math.max(f.int.length, 1) * 0.57)));
      const xe = Math.round(650 + f.int.length * size * 0.57 + 6);
      s += text(650, y, size, c.color_text, esc(f.int)) + text(xe, y - 24, 22, c.color_text, esc(f.unit)) +
        (f.frac ? text(xe, y, 24, c.color_text, esc(f.frac), undefined, 0.6) : "");
    }
    return s + bar(596, y + 32, 184, view.frac, view.color, view.ccw);
  };

  const renderSvg = (m, config, fmt, lang, hass, today) => {
    const T = TEXT[pickLang(lang)];
    const eff = effectiveColors(config, hass);
    const c = { ...config, ...eff.accents, color_background: eff.background, color_text: eff.text };
    const parts = [];
    const spoken = [];
    for (const key of SLOTS) {
      const slot = c[key];
      const view = slotView(key, slot, m, hass, c, today);
      const circle = key.startsWith("circle");
      if (!view) continue;
      const f = formatView(view, fmt, circle);
      parts.push(circle ? renderCircle(GEOMETRY[key], view, f, c) : renderRow(GEOMETRY[key], view, f, c));
      const modeText = SOURCES[slot.source].modes.length > 1 ? ` ${T.mode[slot.mode].toLowerCase()}` : "";
      spoken.push(`${T.source[slot.source]}${modeText} ${view.value === null ? T.none : `${f.text} ${f.unit}`}`.trim());
    }
    // Under the big ring, when it shows the main connection: "↓ taken ↑ returned" today on one
    // line with "kWh" below, like the display.
    if (c.circle_1.source === "grid") {
      const segs = [];
      if (m.gridImport !== null) segs.push(`<tspan fill="${c.color_grid}">↓</tspan>${esc(fmt(m.gridImport, 1).text)}`);
      if (m.gridExport !== null) segs.push(`<tspan fill="${c.color_delivery}"${segs.length ? ' dx="16"' : ""}>↑</tspan>${esc(fmt(m.gridExport, 1).text)}`);
      if (segs.length) {
        parts.push(text(200, 410, 30, c.color_text, segs.join(""), "middle"));
        parts.push(text(200, 440, 22, c.color_text, "kWh", "middle"));
      }
    }
    return `<svg viewBox="0 0 800 480" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(spoken.join(", "))}">` +
      `<rect width="800" height="480" fill="${c.color_background}"/>${parts.join("")}</svg>`;
  };

  // ---------------------------------------------------------------- charts view

  const CHART_TEXT = {
    en: {
      title: {
        water: "Water", gas: "Gas", grid: "Main connection", solar: "Solar panels", consumption: "Electricity use",
        self_sufficiency: "Self-sufficient", standby: "Standby use", battery: "Home battery",
      },
      period: { day: "Day", week: "Week", month: "Month", year: "Year" },
      today: "Today", yesterday: "Yesterday", week: "Week", none: "No data", loading: "Loading…",
    },
    nl: {
      title: {
        water: "Water", gas: "Gasverbruik", grid: "Hoofdaansluiting", solar: "Zonnepanelen", consumption: "Stroomverbruik",
        self_sufficiency: "Zelfvoorzienend", standby: "Standby-verbruik", battery: "Thuisaccu",
      },
      period: { day: "Dag", week: "Week", month: "Maand", year: "Jaar" },
      today: "Vandaag", yesterday: "Gisteren", week: "Week", none: "Geen gegevens", loading: "Laden…",
    },
  };
  const STAT_PERIOD = { day: "5minute", week: "hour", month: "day", year: "month" };
  const CHART_ICON = {
    water: "water", gas: "gas", grid: "grid", solar: "solar", consumption: "consumption",
    self_sufficiency: "self_sufficiency", standby: "consumption", battery: "battery",
  };

  // Date parts of moment t in time zone tz (weekday 0 = Monday).
  const tzFormatters = {};
  const tzParts = (t, tz) => {
    const key = tz || "UTC";
    if (!tzFormatters[key]) {
      const opts = {
        hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric",
        hour: "numeric", minute: "numeric", second: "numeric", weekday: "short",
      };
      try {
        tzFormatters[key] = new Intl.DateTimeFormat("en-US", { ...opts, timeZone: key });
      } catch (e) {
        tzFormatters[key] = new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" });
      }
    }
    const p = {};
    for (const part of tzFormatters[key].formatToParts(new Date(t))) p[part.type] = part.value;
    return {
      y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24,
      mi: Number(p.minute), s: Number(p.second), wd: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday),
    };
  };
  const tzOffset = (t, tz) => {
    const p = tzParts(t, tz);
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000;
  };
  // Moment of local midnight y-m-d in tz. Month and day may overflow, like Date.UTC. Correcting
  // twice also gets the days of a clock change right.
  const zonedMidnight = (y, m, d, tz) => {
    const guess = Date.UTC(y, m - 1, d);
    const t = guess - tzOffset(guess, tz);
    return guess - tzOffset(t, tz);
  };

  // Start, end and buckets of a period. offset 0 = the current day/week/month/year, 1 = the one
  // before. statPeriod may be "hour" for a day that has no 5-minute statistics any more.
  const periodRange = (period, offset, now, tz, statPeriod) => {
    const p = tzParts(now, tz);
    const sp = statPeriod || STAT_PERIOD[period];
    let start;
    let end;
    let buckets = [];
    if (period === "day") {
      start = zonedMidnight(p.y, p.m, p.d - offset, tz);
      end = zonedMidnight(p.y, p.m, p.d - offset + 1, tz);
    } else if (period === "week") {
      const d0 = p.d - p.wd - 7 * offset;
      start = zonedMidnight(p.y, p.m, d0, tz);
      end = zonedMidnight(p.y, p.m, d0 + 7, tz);
    } else if (period === "month") {
      start = zonedMidnight(p.y, p.m - offset, 1, tz);
      end = zonedMidnight(p.y, p.m - offset + 1, 1, tz);
      const s = tzParts(start + 12 * 3600000, tz);
      for (let i = 0; ; i += 1) {
        const t = zonedMidnight(s.y, s.m, 1 + i, tz);
        if (t >= end) break;
        buckets.push(t);
      }
    } else {
      start = zonedMidnight(p.y - offset, 1, 1, tz);
      end = zonedMidnight(p.y - offset + 1, 1, 1, tz);
      for (let i = 0; i < 12; i += 1) buckets.push(zonedMidnight(p.y - offset, 1 + i, 1, tz));
    }
    if (period === "day" || period === "week") {
      const step = sp === "5minute" ? 300000 : 3600000;
      for (let t = start; t < end; t += step) buckets.push(t);
    }
    return { period, offset, start, end, buckets, statPeriod: sp, now };
  };

  const bucketHours = (range, i) => ((range.buckets[i + 1] !== undefined ? range.buckets[i + 1] : range.end) - range.buckets[i]) / 3600000;

  // Statistics for a period: "change" for meters and costs, "mean" for state of charge and own
  // sensors. Short-term statistics are kept about ten days; an older day falls back to hours.
  const fetchSeries = async (hass, range, changeIds, meanIds) => {
    const call = async (r, ids, types, units) => {
      if (!ids.length) return {};
      try {
        return (await hass.callWS({
          type: "recorder/statistics_during_period",
          start_time: new Date(r.start).toISOString(),
          end_time: new Date(r.end).toISOString(),
          statistic_ids: ids,
          period: r.statPeriod,
          types,
          units,
        })) || {};
      } catch (e) {
        return {};
      }
    };
    let r = range;
    let change = await call(r, changeIds, ["change"], STAT_UNITS);
    let mean = await call(r, meanIds, ["mean"], { power: "W" });
    const nothing = (o) => Object.values(o).every((rows) => !rows || !rows.length);
    if (r.period === "day" && r.statPeriod === "5minute" && nothing(change) && nothing(mean) && (changeIds.length || meanIds.length)) {
      r = periodRange("day", r.offset, r.now, null, "hour");
      r = { ...r, start: range.start, end: range.end, buckets: [] };
      for (let t = range.start; t < range.end; t += 3600000) r.buckets.push(t);
      change = await call(r, changeIds, ["change"], STAT_UNITS);
      mean = await call(r, meanIds, ["mean"], { power: "W" });
    }
    return { range: r, change, mean };
  };

  // One statistic as an array over the buckets (null = no data).
  const seriesOf = (rows, buckets, field) => {
    const index = new Map(buckets.map((t, i) => [t, i]));
    const out = new Array(buckets.length).fill(null);
    for (const row of rows || []) {
      const t = typeof row.start === "number" ? row.start : Date.parse(row.start);
      const i = index.get(t);
      if (i !== undefined && Number.isFinite(row[field])) out[i] = row[field];
    }
    return out;
  };
  const addSeries = (list, n) => {
    const out = new Array(n).fill(null);
    for (const s of list) s.forEach((v, i) => { if (v !== null) out[i] = (out[i] === null ? 0 : out[i]) + v; });
    return out;
  };
  const total = (s) => sumOf(s);
  const percentile = (values, q) => {
    const v = values.filter((x) => x !== null).sort((a, b) => a - b);
    if (!v.length) return null;
    return v[Math.min(v.length - 1, Math.floor(q * v.length))];
  };

  // Which charts to show: the configured list, or every chart that has data, in the app's order.
  const chartList = (config, src) => {
    const has = {
      water: src.water.length > 0,
      gas: src.gas.length > 0,
      grid: src.gridImport.length > 0,
      solar: src.solar.length > 0,
      consumption: src.gridImport.length > 0,
      self_sufficiency: src.gridImport.length > 0 && (src.solar.length > 0 || src.batteryOut.length > 0),
      standby: src.gridImport.length > 0,
      battery: src.batterySoc.length > 0 || src.batteryOut.length > 0,
    };
    const keys = config.charts.length ? config.charts : CHARTS.filter((k) => has[k]);
    const list = keys.filter((k) => k !== "battery").map((k) => ({ key: k }));
    for (const entity of config.chart_entities) list.push({ key: "entity", entity });
    if (keys.includes("battery")) list.push({ key: "battery" });
    return list;
  };

  const chartStatIds = (charts, src) => {
    const change = new Set();
    const mean = new Set();
    const add = (set, ids) => ids.forEach((id) => set.add(id));
    for (const ch of charts) {
      if (ch.key === "water") add(change, [...src.water, ...src.waterCost]);
      if (ch.key === "gas") add(change, [...src.gas, ...src.gasCost]);
      if (ch.key === "grid") add(change, [...src.gridImport, ...src.gridExport, ...src.gridCost, ...src.gridCompensation]);
      if (ch.key === "solar") add(change, src.solar);
      if (["consumption", "self_sufficiency", "standby"].includes(ch.key)) {
        add(change, [...src.gridImport, ...src.gridExport, ...src.solar, ...src.batteryIn, ...src.batteryOut, ...src.homeEnergy]);
      }
      if (ch.key === "battery") {
        add(change, [...src.batteryIn, ...src.batteryOut]);
        add(mean, src.batterySoc);
      }
      if (ch.key === "entity") mean.add(ch.entity);
    }
    return { change: [...change], mean: [...mean] };
  };

  // The data of one chart: series to draw, header values, cost and axis.
  // kind "area": average power per bucket (day view); "bars": amount per bucket; "line": a level.
  const chartData = (chart, data, src, c, hass) => {
    const range = data.range;
    const n = range.buckets.length;
    const ch = (ids) => addSeries(ids.map((id) => seriesOf(data.change[id], range.buckets, "change")), n);
    const dayView = range.period === "day";
    const toPower = (s) => s.map((v, i) => (v === null ? null : (v / bucketHours(range, i)) * 1000));
    const energy = (s) => (dayView ? { values: toPower(s), unit: "W" } : { values: s, unit: "kWh" });
    const cost = (plus, minus) => {
      const a = total(ch(plus));
      const b = total(ch(minus || []));
      return a === null && b === null ? null : (a || 0) - (b || 0);
    };
    const imp = ch(src.gridImport);
    const exp = ch(src.gridExport);
    const sol = ch(src.solar);
    const consumption = () => {
      if (src.homeEnergy.length) return ch(src.homeEnergy);
      const bin = ch(src.batteryIn);
      const bout = ch(src.batteryOut);
      return imp.map((v, i) => (v === null ? null
        : Math.max(0, v - (exp[i] || 0) + (sol[i] || 0) + (bout[i] || 0) - (bin[i] || 0))));
    };
    const base = { key: chart.key, icon: CHART_ICON[chart.key], cost: null };
    switch (chart.key) {
      case "water": {
        const w = ch(src.water);
        return { ...base, kind: "bars", unit: "L", decimals: 0, series: [{ values: w, color: c.color_water, arrow: "↓" }],
          header: [{ arrow: "↓", value: total(w), unit: "L", decimals: 0, color: c.color_water }], cost: cost(src.waterCost) };
      }
      case "gas": {
        const energyGas = src.gas.length > 0 && gasKind(hass, src.gas[0]) === "energy";
        const g = ch(src.gas).map((v) => (v === null ? null : energyGas ? v : v / 1000));
        const unit = energyGas ? "kWh" : "m³";
        return { ...base, kind: "bars", unit, decimals: 2, series: [{ values: g, color: c.color_gas, arrow: "↓" }],
          header: [{ arrow: "↓", value: total(g), unit, decimals: 2, color: c.color_gas }], cost: cost(src.gasCost) };
      }
      case "grid": {
        const a = energy(imp);
        const b = energy(exp);
        return { ...base, kind: dayView ? "area" : "bars", unit: a.unit, decimals: dayView ? 0 : 2,
          series: [{ values: b.values, color: c.color_delivery, arrow: "↑" }, { values: a.values, color: c.color_grid, arrow: "↓" }],
          header: [
            { arrow: "↓", value: total(imp), unit: "kWh", decimals: 1, color: c.color_grid },
            { arrow: "↑", value: total(exp), unit: "kWh", decimals: 1, color: c.color_delivery },
          ],
          cost: cost(src.gridCost, src.gridCompensation) };
      }
      case "solar": {
        const s = energy(sol);
        return { ...base, kind: dayView ? "area" : "bars", unit: s.unit, decimals: dayView ? 0 : 2,
          series: [{ values: s.values, color: c.color_delivery, arrow: "↑" }],
          header: [{ arrow: "↑", value: total(sol), unit: "kWh", decimals: 1, color: c.color_delivery }] };
      }
      case "consumption": {
        const u = consumption();
        const e = energy(u);
        return { ...base, kind: dayView ? "area" : "bars", unit: e.unit, decimals: dayView ? 0 : 2,
          series: [{ values: e.values, color: c.color_grid, arrow: "↓" }],
          header: [{ arrow: "↓", value: total(u), unit: "kWh", decimals: 1, color: c.color_grid }] };
      }
      case "self_sufficiency": {
        const u = consumption();
        const own = u.map((v, i) => (v === null ? null : Math.max(0, v - (imp[i] || 0))));
        const e = energy(u);
        const o = energy(own);
        return { ...base, kind: dayView ? "area" : "bars", unit: e.unit, decimals: dayView ? 0 : 2,
          // Own energy (solar, battery) in the delivery colour of the card, like on the display.
          series: [{ values: e.values, color: c.color_grid, arrow: "↓" }, { values: o.values, color: c.color_delivery, arrow: "⇅" }],
          header: [
            { arrow: "⇅", value: total(own), unit: "", decimals: 1, color: c.color_delivery },
            { arrow: "↓", value: total(imp), unit: "", decimals: 1, color: c.color_grid },
            { arrow: "↑", value: total(exp), unit: "kWh", decimals: 1, color: c.color_delivery },
          ] };
      }
      case "standby": {
        // Standby: the lowest power the house keeps using (5th percentile of the averages).
        const u = consumption();
        const w = toPower(u);
        const standbyW = percentile(w, 0.05);
        const hours = u.reduce((h, v, i) => (v === null ? h : h + bucketHours(range, i)), 0);
        const band = u.map((v, i) => (v === null || standbyW === null ? null
          : dayView ? standbyW : (standbyW * bucketHours(range, i)) / 1000));
        const e = energy(u);
        return { ...base, kind: dayView ? "area" : "bars", unit: e.unit, decimals: dayView ? 0 : 2,
          series: [{ values: e.values, color: c.color_grid, faint: true }, { values: band, color: c.color_grid, arrow: "↓" }],
          header: [{ arrow: "↓", value: standbyW === null ? null : (standbyW * hours) / 1000, unit: "kWh", decimals: 1, color: c.color_grid }],
          note: standbyW === null ? null : standbyW };
      }
      case "battery": {
        const socs = src.batterySoc.map((id) => seriesOf(data.mean[id], range.buckets, "mean"));
        const soc = range.buckets.map((_, i) => {
          const v = socs.map((s) => s[i]).filter((x) => x !== null);
          return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
        });
        const now = src.batterySoc.map((id) => stateValue(hass, id, "raw")).filter((v) => v !== null);
        return { ...base, kind: "line", unit: "%", decimals: 0, min: 0, max: 100,
          series: [{ values: soc, color: c.color_battery }],
          header: [
            { arrow: "↓", value: total(ch(src.batteryIn)), unit: "", decimals: 1, color: c.color_grid },
            { arrow: "↑", value: total(ch(src.batteryOut)), unit: "kWh", decimals: 1, color: c.color_delivery },
          ],
          corner: now.length ? `${Math.round(now.reduce((a, b) => a + b, 0) / now.length)} %` : null };
      }
      default: {
        // Own sensor, for example a temperature: its average per bucket as a line.
        const id = chart.entity;
        const st = entityOf(hass, id);
        const dc = st && st.attributes ? st.attributes.device_class : undefined;
        const color = dc === "temperature" ? c.color_gas : dc === "humidity" ? c.color_water : c.color_battery;
        const unit = unitOf(hass, id) || "";
        const v = stateValue(hass, id, "raw");
        return { ...base, key: "entity", icon: dc === "temperature" ? "temperature" : dc === "humidity" ? "humidity" : "entity",
          title: (st && st.attributes && st.attributes.friendly_name) || id, kind: "line", unit, decimals: 1,
          series: [{ values: seriesOf(data.mean[id], range.buckets, "mean"), color }],
          header: [{ arrow: "", value: v, unit, decimals: 1, color }] };
      }
    }
  };

  // Round axis: about five steps of 1, 2, 2.5 or 5 times a power of ten.
  const niceAxis = (lo, hi) => {
    let min = Math.min(lo, hi);
    let max = Math.max(lo, hi);
    if (max === min) max = min + (min === 0 ? 1 : Math.abs(min) * 0.1);
    const raw = (max - min) / 5;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw);
    min = Math.floor(min / step) * step;
    max = Math.ceil(max / step) * step;
    const ticks = [];
    for (let t = min; t <= max + step / 2; t += step) ticks.push(Number(t.toFixed(10)));
    return { min, max, step, ticks };
  };

  const periodLabel = (range, lang, tz) => {
    const T = CHART_TEXT[pickLang(lang)];
    const loc = pickLang(lang) === "nl" ? "nl-NL" : "en-GB";
    const mid = new Date(range.start + (range.end - range.start) / 2);
    const fmtDate = (opts) => {
      try {
        return new Intl.DateTimeFormat(loc, { ...opts, timeZone: tz || "UTC" }).format(mid);
      } catch (e) {
        return new Intl.DateTimeFormat(loc, opts).format(mid);
      }
    };
    if (range.period === "day") {
      if (range.offset === 0) return T.today;
      if (range.offset === 1) return T.yesterday;
      return fmtDate({ weekday: "short", day: "numeric", month: "short" });
    }
    if (range.period === "week") {
      const p = tzParts(range.start + 12 * 3600000, tz);
      const d = new Date(Date.UTC(p.y, p.m - 1, p.d + 3)); // Thursday decides the ISO week
      const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
      const week = 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
      return `${T.week} ${week}`;
    }
    if (range.period === "month") return fmtDate({ month: "long", year: "numeric" });
    return fmtDate({ year: "numeric" });
  };

  // Labels under the x axis: [time, text].
  const xLabels = (range, lang, tz) => {
    const loc = pickLang(lang) === "nl" ? "nl-NL" : "en-GB";
    const fmt = (t, opts) => {
      try {
        return new Intl.DateTimeFormat(loc, { ...opts, timeZone: tz || "UTC" }).format(new Date(t));
      } catch (e) {
        return new Intl.DateTimeFormat(loc, opts).format(new Date(t));
      }
    };
    if (range.period === "day") return [2, 7, 12, 17, 22].map((h) => [range.start + h * 3600000, `${String(h).padStart(2, "0")}:00`]);
    if (range.period === "week") {
      const out = [];
      for (let i = 0; i < 7; i += 1) {
        const t = range.start + i * 86400000 + 12 * 3600000;
        out.push([t, fmt(t, { weekday: "short" })]);
      }
      return out;
    }
    if (range.period === "month") {
      return range.buckets.map((t, i) => [t + 12 * 3600000, i + 1]).filter(([, d]) => d === 1 || d % 5 === 0).map(([t, d]) => [t, String(d)]);
    }
    return range.buckets.map((t) => [t + 15 * 86400000, fmt(t + 15 * 86400000, { month: "short" }).replace(".", "")]);
  };

  // A chart tile as SVG, 800 wide and as tall as the frame it fills (default 260), in the style
  // of the HomeWizard app.
  const renderChartTile = (chart, range, fmt, c, lang, tz, uid, height) => {
    const H = Math.max(200, Math.round(height || 260));
    const CH = { x0: 16, x1: 744, top: 92, bottom: H - 36, width: 800, height: H };
    const T = CHART_TEXT[pickLang(lang)];
    const parts = [];
    const sub = c.color_text;
    const span = range.end - range.start;
    const xAt = (t) => CH.x0 + ((t - range.start) / span) * (CH.x1 - CH.x0);
    const n = range.buckets.length;
    const centers = range.buckets.map((t, i) => xAt(t + ((range.buckets[i + 1] !== undefined ? range.buckets[i + 1] : range.end) - t) / 2));

    // Header: coloured totals with arrows, title, cost and icon.
    let hx = 18;
    for (const h of chart.header) {
      const num = h.value === null ? "–" : fmt(h.value, h.decimals).text;
      if (h.arrow) {
        parts.push(text(hx, 44, 22, h.color, h.arrow));
        hx += h.arrow === "⇅" ? 24 : 16; // the double arrow is wider
      }
      parts.push(text(hx, 44, 30, h.color, esc(num)));
      hx += num.length * 30 * 0.56 + 4;
      if (h.unit) {
        parts.push(text(hx, 44, 14, sub, esc(h.unit), undefined, 0.7));
        hx += h.unit.length * 14 * 0.6 + 10;
      } else {
        hx += 10;
      }
    }
    parts.push(text(18, 68, 14, sub, esc(chart.title || T.title[chart.key])));
    const corner = chart.corner || (chart.cost !== null && chart.cost !== undefined
      ? `${fmt.currency || "€"} ${fmt(chart.cost, 2).text}` : null);
    if (corner) parts.push(text(744, 34, 14, sub, esc(corner), "end", 0.7));
    parts.push(`<path transform="translate(756 14) scale(1.15)" fill="${sub}" d="${ICONS[chart.icon] || ICONS.entity}"/>`);

    // Axis.
    const values = chart.series.flatMap((s) => s.values).filter((v) => v !== null);
    const lo = chart.min !== undefined ? chart.min : chart.kind === "line" && values.length ? Math.min(...values) : 0;
    const hi = chart.max !== undefined ? chart.max : values.length ? Math.max(...values) : 1;
    const axis = niceAxis(lo, hi > lo ? hi : lo + 1);
    const yAt = (v) => CH.bottom - ((v - axis.min) / (axis.max - axis.min)) * (CH.bottom - CH.top);
    for (const t of axis.ticks) {
      const y = yAt(t).toFixed(1);
      parts.push(`<line x1="${CH.x0}" y1="${y}" x2="${CH.x1}" y2="${y}" stroke="${sub}" stroke-opacity="0.08"/>`);
      // Enough decimals for the step: 0.25 → 2, 0.002 → 3.
      const dec = axis.step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(axis.step) + (String(axis.step).includes("25") ? 1 : 0) - 1e-9));
      parts.push(text(790, Number(y) + 4, 11, sub, esc(fmt(t, dec).text), "end", 0.55));
    }
    for (const [t, label] of xLabels(range, lang, tz)) {
      parts.push(text(xAt(t).toFixed(1), H - 12, 11, sub, esc(label), "middle", 0.55));
    }

    // Series.
    const defs = [];
    chart.series.forEach((s, si) => {
      const id = `g${uid}-${si}`;
      if (chart.kind === "area") {
        defs.push(`<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity="${s.faint ? 0.35 : 0.9}"/><stop offset="1" stop-color="${s.color}" stop-opacity="${s.faint ? 0.1 : 0.15}"/></linearGradient>`);
        let seg = [];
        const flush = () => {
          if (seg.length) {
            const line = seg.map(([x, y], k) => `${k ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
            parts.push(`<path d="${line}L${seg[seg.length - 1][0].toFixed(1)} ${CH.bottom}L${seg[0][0].toFixed(1)} ${CH.bottom}Z" fill="url(#${id})"/>`);
            if (!s.faint) parts.push(`<path d="${line}" fill="none" stroke="${s.color}" stroke-width="1.5"/>`);
          }
          seg = [];
        };
        s.values.forEach((v, i) => { if (v === null) flush(); else seg.push([centers[i], yAt(Math.max(axis.min, v))]); });
        flush();
      } else if (chart.kind === "bars") {
        const w = Math.max(1, ((CH.x1 - CH.x0) / n) * 0.7);
        s.values.forEach((v, i) => {
          if (v === null || v <= 0) return;
          const y = yAt(v);
          parts.push(`<rect x="${(centers[i] - w / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${(CH.bottom - y).toFixed(1)}" rx="${Math.min(2, w / 2).toFixed(1)}" fill="${s.color}"${s.faint ? ' fill-opacity="0.35"' : ""}/>`);
        });
      } else {
        let seg = [];
        const flush = () => {
          if (seg.length) parts.push(`<path d="${seg.map(([x, y], k) => `${k ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("")}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round"/>`);
          seg = [];
        };
        s.values.forEach((v, i) => { if (v === null) flush(); else seg.push([centers[i], yAt(v)]); });
        flush();
      }
    });
    if (!values.length) parts.push(text(380, Math.round((CH.top + CH.bottom) / 2), 14, sub, esc(T.none), "middle", 0.5));
    // Pointer line and label, moved by the card.
    parts.push(`<g class="hover" visibility="hidden"><line x1="0" y1="${CH.top - 8}" x2="0" y2="${CH.bottom}" stroke="${sub}" stroke-opacity="0.6"/><text x="0" y="${CH.top - 14}" text-anchor="middle" ${FONT} font-size="13" fill="${sub}"></text></g>`);

    // What the pointer shows per bucket.
    const lc = pickLang(lang) === "nl" ? "nl-NL" : "en-GB";
    const when = (t) => {
      const opts = range.period === "day" || range.period === "week"
        ? { weekday: range.period === "week" ? "short" : undefined, hour: "2-digit", minute: "2-digit" }
        : range.period === "month" ? { day: "numeric", month: "short" } : { month: "long" };
      try {
        return new Intl.DateTimeFormat(lc, { ...opts, timeZone: tz || "UTC" }).format(new Date(t));
      } catch (e) {
        return new Intl.DateTimeFormat(lc, opts).format(new Date(t));
      }
    };
    // Each series with its arrow; zeros left out unless everything is zero.
    const labels = range.buckets.map((t, i) => {
      const vals = chart.series.filter((s) => !s.faint).map((s) => [s.arrow || "", s.values[i]]).filter(([, v]) => v !== null);
      if (!vals.length) return null;
      const shown = vals.some(([, v]) => v !== 0) ? vals.filter(([, v]) => v !== 0) : vals.slice(0, 1);
      return `${when(t)}  ${shown.map(([a, v]) => `${a}${fmt(v, chart.decimals).text}`).join("  ")} ${chart.unit}`.trim();
    });
    const svg = `<svg viewBox="0 0 ${CH.width} ${CH.height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(chart.title || T.title[chart.key])}"><defs>${defs.join("")}</defs>${parts.join("")}</svg>`;
    return { svg, meta: { centers: centers.map((x) => Number(x.toFixed(1))), labels } };
  };

  // The whole charts view: period label and one tile per chart.
  const renderCharts = (state, config, fmt, lang, hass, height) => {
    const tz = hass && hass.config ? hass.config.time_zone : undefined;
    const eff = effectiveColors(config, hass);
    const c = { ...config, ...eff.accents, color_background: eff.background, color_text: eff.text };
    const label = periodLabel(state.data.range, lang, tz);
    const tiles = state.charts.map((chart, i) => renderChartTile(chartData(chart, state.data, state.sources, c, hass), state.data.range, fmt, c, lang, tz, `${state.uid || "c"}${i}`, height));
    return { label, tiles, colors: eff };
  };

  // ---------------------------------------------------------------- editor

  // Slot as the editor shows it: defaults filled in, never throws.
  const editorSlot = (key, raw) => {
    try {
      return normalizeSlot(key, raw);
    } catch (e) {
      return normalizeSlot(key, { ...SLOT_DEFAULTS[key] });
    }
  };

  const editorData = (config) => {
    const data = { ...config };
    for (const key of SLOTS) {
      const s = editorSlot(key, config[key]);
      data[key] = { ...s, color: s.color || "" };
      if (s.mode === null) delete data[key].mode;
    }
    if (empty(data.color_background)) data.color_background = COLOR_DEFAULTS.color_background;
    // Show the defaults, so the switch is on and the sign is filled in when the config is empty.
    data.use_energy_settings = config.use_energy_settings !== false;
    data.show_view_switch = config.show_view_switch !== false;
    if (empty(data.view)) data.view = "display";
    if (empty(data.period)) data.period = "day";
    data.charts = toList(config.charts);
    if (empty(data.battery_power_sign)) data.battery_power_sign = SIGNS[0];
    return data;
  };

  const goalUnit = (source, goalMode, mode, hass, slot) => {
    if (goalMode === "cost") return currencySymbol(hass, numberLocale(hass));
    switch (source) {
      case "grid": case "solar": case "consumption": case "device": return goalMode === "now" ? "W" : "kWh";
      case "battery": case "self_sufficiency": return "%";
      case "water": return goalMode === "now" ? "L/min" : "L";
      case "gas": return goalMode === "now" ? "m³/h" : "m³";
      default: return (slot && slot.entity && unitOf(hass, slot.entity)) || undefined;
    }
  };

  const editorSchema = (config, lang, hass) => {
    const T = TEXT[pickLang(lang)];
    const slotSchema = (key) => {
      const slot = editorSlot(key, config[key]);
      const spec = SOURCES[slot.source];
      // required: no clear button, a circle or row always shows something (or "none").
      const items = [{
        name: "source",
        required: true,
        selector: { select: { mode: "dropdown", options: Object.keys(SOURCES).map((s) => ({ value: s, label: T.source[s] })) } },
      }];
      if (slot.source === "entity") items.push({ name: "entity", selector: { entity: { filter: { domain: "sensor" } } } });
      if (slot.source === "device") {
        items.push({ name: "power", selector: { entity: { filter: { domain: "sensor", device_class: "power" } } } });
        items.push({ name: "energy", selector: { entity: { filter: { domain: "sensor", device_class: "energy" } } } });
      }
      if (spec.modes.length > 1) {
        items.push({
          name: "mode",
          required: true,
          helper_text: T.modeHelp[slot.mode],
          selector: { select: { mode: "dropdown", options: spec.modes.map((m) => ({ value: m, label: T.mode[m] })) } },
        });
      }
      const goals = slot.mode ? MODE_GOALS[slot.mode] : [];
      if (goals.length) {
        items.push({
          type: "grid",
          name: "",
          schema: goals.map((g) => ({
            name: GOAL_KEY[g],
            selector: { number: { min: 0.01, step: "any", mode: "box", unit_of_measurement: goalUnit(slot.source, g, slot.mode, hass, slot) } },
          })),
        });
      }
      if (slot.source !== "none") items.push({ name: "color", selector: { text: {} } });
      const modeLabel = spec.modes.length > 1 ? `, ${T.mode[slot.mode]}` : "";
      return { name: key, type: "expandable", title: `${T.slot[key]}: ${T.source[slot.source]}${modeLabel}`, schema: items };
    };
    const entity = (name, deviceClass, multiple) => ({
      name,
      selector: {
        entity: {
          multiple: Boolean(multiple),
          filter: deviceClass ? { domain: "sensor", device_class: deviceClass } : { domain: "sensor" },
        },
      },
    });
    const C = CHART_TEXT[pickLang(lang)];
    return [
      {
        type: "grid",
        name: "",
        schema: [
          { name: "view", required: true, selector: { select: { mode: "dropdown", options: VIEWS.map((v) => ({ value: v, label: T.view[v] })) } } },
          { name: "show_view_switch", selector: { boolean: {} } },
        ],
      },
      ...SLOTS.map(slotSchema),
      {
        type: "grid",
        name: "",
        schema: [
          // A list with suggestions that also takes your own hex colour (custom_value).
          { name: "color_background", selector: { select: { custom_value: true, mode: "dropdown", options: [
            { value: BACKGROUND_SUGGESTIONS.display, label: T.bg.display },
            { value: BACKGROUND_SUGGESTIONS.day, label: T.bg.day },
          ] } } },
          { name: "color_background_dark", selector: { select: { custom_value: true, mode: "dropdown", options: [
            { value: BACKGROUND_SUGGESTIONS.display, label: T.bg.display },
            { value: BACKGROUND_SUGGESTIONS.night, label: T.bg.night },
          ] } } },
        ],
      },
      {
        name: "charts_group",
        type: "expandable",
        flatten: true,
        icon: "mdi:chart-areaspline",
        schema: [
          { name: "charts", selector: { select: { multiple: true, mode: "list", options: CHARTS.map((k) => ({ value: k, label: C.title[k] })) } } },
          { name: "chart_entities", selector: { entity: { multiple: true, filter: { domain: "sensor" } } } },
          { name: "period", required: true, selector: { select: { mode: "dropdown", options: PERIODS.map((p) => ({ value: p, label: C.period[p] })) } } },
        ],
      },
      {
        name: "sources",
        type: "expandable",
        flatten: true,
        icon: "mdi:meter-electric-outline",
        schema: [
          entity("grid_power", "power"),
          entity("grid_import", "energy", true),
          entity("grid_export", "energy", true),
          entity("solar_power", "power"),
          entity("solar_energy", "energy", true),
          entity("battery_soc", null, true),
          entity("battery_power", "power", true),
          {
            name: "battery_power_sign",
            selector: { select: { mode: "dropdown", options: SIGNS.map((v) => ({ value: v, label: T.sign[v] })) } },
          },
          entity("water", "water", true),
          entity("water_flow"),
          entity("gas", "gas", true),
          entity("gas_flow"),
          { name: "use_energy_settings", selector: { boolean: {} } },
        ],
      },
      {
        name: "colors",
        type: "expandable",
        flatten: true,
        icon: "mdi:palette",
        schema: [{
          type: "grid",
          name: "",
          schema: COLOR_KEYS.filter((k) => !k.startsWith("color_background")).map((name) => ({ name, selector: { text: {} } })),
        }],
      },
    ];
  };

  // Turns what the form returns into a tidy configuration: a new source starts from its own
  // defaults, and values equal to a default are left out.
  const cleanEditorConfig = (data, previous) => {
    const out = { ...data };
    for (const key of SLOTS) {
      const nv = { ...(data[key] || {}) };
      const before = editorSlot(key, previous ? previous[key] : undefined);
      const spec = SOURCES[nv.source] ? SOURCES[nv.source] : SOURCES[before.source];
      if (!SOURCES[nv.source]) nv.source = before.source;
      if (nv.source !== before.source) {
        const def = SLOT_DEFAULTS[key];
        const fresh = { source: nv.source };
        if (spec.modes.length > 1) fresh.mode = nv.source === def.source ? def.mode : spec.start;
        out[key] = fresh;
        continue;
      }
      if (spec.modes.length <= 1) delete nv.mode; // nothing to choose
      else if (!spec.modes.includes(nv.mode)) nv.mode = spec.modes[0];
      for (const k of GOAL_KEYS) {
        const mode = Object.keys(GOAL_KEY).find((m) => GOAL_KEY[m] === k);
        if (empty(nv[k]) || spec.goals[mode] === undefined || Number(nv[k]) === spec.goals[mode]) delete nv[k];
      }
      if (empty(nv.color)) delete nv.color;
      if (nv.source !== "entity" || empty(nv.entity)) delete nv.entity;
      for (const k of ["power", "energy"]) if (nv.source !== "device" || empty(nv[k])) delete nv[k];
      out[key] = nv;
    }
    for (const key of ENTITY_KEYS) if (toList(out[key]).length === 0) delete out[key];
    for (const key of COLOR_KEYS) {
      if (empty(out[key]) || String(out[key]).toLowerCase() === COLOR_DEFAULTS[key]) delete out[key];
    }
    if (out.battery_power_sign === SIGNS[0]) delete out.battery_power_sign;
    if (out.use_energy_settings !== false) delete out.use_energy_settings;
    if (out.show_view_switch !== false) delete out.show_view_switch;
    if (out.view === "display") delete out.view;
    if (out.period === "day") delete out.period;
    for (const key of ["charts", "chart_entities"]) if (toList(out[key]).length === 0) delete out[key];
    return out;
  };

  const editorLabel = (schema, lang) => {
    const T = TEXT[pickLang(lang)];
    return T.labels[schema.name] || T.slot[schema.name] || schema.name;
  };

  const editorHelper = (schema, lang) => schema.helper_text || TEXT[pickLang(lang)].helpers[schema.name];

  return {
    VERSION, TAG, EDITOR_TAG, SOURCES, SLOTS, SLOT_DEFAULTS, COLOR_DEFAULTS, ENTITY_KEYS, TEXT,
    luminance, effectiveColors, LIGHT_ACCENTS, BACKGROUND_SUGGESTIONS,
    VIEWS, CHARTS, PERIODS, tzParts, zonedMidnight, periodRange, bucketHours, fetchSeries, seriesOf,
    chartList, chartStatIds, chartData, niceAxis, periodLabel, xLabels, renderChartTile, renderCharts,
    CHART_TEXT, ICONS,
    normalizeConfig, normalizeSlot, sourcesFromPrefs, resolveSources, needsCosts, meterIds, slotMeterIds, convert,
    stateValue, gasKind, fetchToday, todayValue, computeModel, msToNextRefresh, dayKey, numberLocale,
    formatter, pickLang, editorLang, slotView, formatView, renderSvg, editorData, editorSchema,
    cleanEditorConfig, editorLabel, editorHelper,
  };
})();

// ------------------------------------------------------------------ custom elements

if (typeof HTMLElement !== "undefined" && typeof customElements !== "undefined") {
  const STYLE =
    ":host{display:block;height:100%}" +
    "ha-card{position:relative;height:100%;box-sizing:border-box;overflow:hidden;" +
    "background:var(--hwdc-background);color:var(--hwdc-text)}" +
    ".svg{display:flex;align-items:center;justify-content:center;width:100%;height:100%}" +
    ".svg svg{display:block;width:100%;height:100%}" +
    ".switch{position:absolute;top:6px;right:6px;z-index:1;width:32px;height:32px;padding:6px;border:0;" +
    "border-radius:50%;background:transparent;color:var(--hwdc-text);opacity:.55;cursor:pointer}" +
    ".switch:hover,.switch:focus-visible{opacity:1;background:color-mix(in srgb,var(--hwdc-text) 14%,transparent)}" +
    ".switch svg{display:block;width:20px;height:20px;fill:currentColor}" +
    // 5:3 like the display. min-height 0: no content-based minimum that would stretch the card.
    ".charts{display:flex;flex-direction:column;padding:8px;aspect-ratio:5/3;width:100%;min-height:0}" +
    ".bar{flex:none;display:flex;align-items:center;gap:4px;flex-wrap:wrap;padding:0 34px 6px 0;font:600 13px/1.2 Roboto,Noto,sans-serif}" +
    ".dots{display:inline-flex;gap:4px;margin:0 4px}" +
    ".dots button{width:6px;height:6px;padding:0;border:0;border-radius:50%;background:var(--hwdc-text);opacity:.25;cursor:pointer}" +
    ".dots button.on{opacity:.9}" +
    ".nav{width:26px;height:26px;border:0;border-radius:50%;background:transparent;color:inherit;font-size:20px;cursor:pointer}" +
    ".nav:disabled{opacity:.25;cursor:default}" +
    ".label{min-width:5.5em;text-align:center}" +
    ".tabs{display:inline-flex;gap:2px;margin-left:auto;padding:2px;border-radius:16px;" +
    "background:color-mix(in srgb,var(--hwdc-text) 8%,transparent)}" +
    ".tabs button{border:0;border-radius:14px;padding:4px 8px;background:transparent;color:inherit;font:inherit;cursor:pointer}" +
    ".tabs button.on{background:color-mix(in srgb,var(--hwdc-text) 18%,transparent);font-weight:700}" +
    ".tiles{flex:1;min-height:0;display:flex;flex-direction:column;gap:8px;overflow-y:auto;" +
    "scroll-snap-type:y mandatory;overscroll-behavior:contain;scrollbar-width:none}" +
    ".tiles::-webkit-scrollbar{display:none}" +
    ".tile{flex:none;height:100%;scroll-snap-align:start;border-radius:12px;overflow:hidden;touch-action:pan-y;" +
    "background:color-mix(in srgb,var(--hwdc-text) 4%,var(--hwdc-background))}" +
    ".tile svg{display:block;width:100%;height:100%}" +
    ".wait{padding:24px;text-align:center;opacity:.6;font:14px Roboto,Noto,sans-serif}";

  class HomeWizardDisplayCard extends HTMLElement {
    static getConfigElement() {
      return document.createElement(HWDC.EDITOR_TAG);
    }

    static getStubConfig() {
      return {};
    }

    setConfig(config) {
      const before = this._config;
      this._config = HWDC.normalizeConfig(config);
      if (!before || before.view !== this._config.view) this._view = this._config.view;
      if (!before || before.period !== this._config.period) {
        this._period = this._config.period;
        this._offset = 0;
      }
      this._svg = "";
      this._chartsKey = "";
      this._root = null;
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

    // Switch between the display and the charts, from the button on the card.
    _toggleView() {
      this._view = this._view === "charts" ? "display" : "charts";
      this._svg = "";
      this._chartsKey = "";
      this._chart = null;
      this._render();
      this._refresh();
    }

    _setPeriod(period, offset) {
      this._keepIndex = this._currentIndex(); // stay on the same chart
      this._period = period;
      this._offset = Math.max(0, offset);
      this._chart = null;
      this._chartsKey = "";
      this._render();
      this._refresh();
    }

    // Reloads the Energy settings and the statistics for the view, then plans the next refresh.
    async _refresh() {
      if (!this._hass || !this._config) return;
      clearTimeout(this._timer);
      const run = (this._run = (this._run || 0) + 1);
      const hass = this._hass;
      const config = this._config;
      const charts = this._view === "charts";
      const tz = hass.config && hass.config.time_zone;
      const day = HWDC.dayKey(Date.now(), tz);
      this._loadingDay = day;
      const costs = charts || HWDC.needsCosts(config);
      let prefs = null;
      let info = null;
      if (config.use_energy_settings) {
        try {
          prefs = await hass.callWS({ type: "energy/get_prefs" });
        } catch (e) {
          prefs = null; // no Energy settings yet
        }
        if (costs) {
          try {
            info = await hass.callWS({ type: "energy/info" });
          } catch (e) {
            info = null;
          }
        }
      }
      const sources = HWDC.resolveSources(config, prefs, info);
      if (charts) {
        const period = this._period;
        const offset = this._offset;
        const range = HWDC.periodRange(period, offset, Date.now(), tz);
        const list = HWDC.chartList(config, sources);
        const ids = HWDC.chartStatIds(list, sources);
        let data = { range, change: {}, mean: {} };
        try {
          data = await HWDC.fetchSeries(hass, range, ids.change, ids.mean);
        } catch (e) {
          console.warn(`${HWDC.TAG}:`, e);
        }
        if (run !== this._run || period !== this._period || offset !== this._offset) return;
        this._sources = sources;
        this._chart = { charts: list, data, sources };
      } else {
        let today = {};
        try {
          const ids = [...new Set([...HWDC.meterIds(sources, costs), ...HWDC.slotMeterIds(config)])];
          today = await HWDC.fetchToday(hass, ids, Date.now());
        } catch (e) {
          console.warn(`${HWDC.TAG}:`, e);
        }
        if (run !== this._run) return;
        this._sources = sources;
        this._today = today;
      }
      this._day = day;
      if (!charts || this._offset === 0) {
        this._timer = setTimeout(() => this._refresh(), HWDC.msToNextRefresh(Date.now()));
      }
      this._render();
    }

    // Builds the shadow DOM for a view once; later renders only change the content.
    _ensureRoot(view) {
      if (!this.shadowRoot) this.attachShadow({ mode: "open" });
      if (this._root === view) return;
      this._root = view;
      const sw = this._config.show_view_switch ? '<button class="switch" type="button"></button>' : "";
      if (view === "charts") {
        const tabs = HWDC.PERIODS.map((p) => `<button type="button" data-p="${p}"></button>`).join("");
        this.shadowRoot.innerHTML = `<style>${STYLE}</style><ha-card class="charts">${sw}` +
          `<div class="bar"><button class="nav prev" type="button">‹</button><span class="label"></span>` +
          `<button class="nav next" type="button">›</button><span class="dots"></span><span class="tabs">${tabs}</span></div>` +
          '<div class="tiles"></div></ha-card>';
        const root = this.shadowRoot;
        root.querySelector(".prev").addEventListener("click", () => this._setPeriod(this._period, this._offset + 1));
        root.querySelector(".next").addEventListener("click", () => this._setPeriod(this._period, this._offset - 1));
        root.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => this._setPeriod(b.dataset.p, 0)));
        const tiles = root.querySelector(".tiles");
        tiles.addEventListener("pointermove", (e) => this._hover(e));
        tiles.addEventListener("pointerdown", (e) => this._hover(e));
        tiles.addEventListener("pointerleave", () => this._hover(null));
        tiles.addEventListener("scroll", () => this._markDot(), { passive: true });
        root.querySelector(".dots").addEventListener("click", (e) => {
          const i = e.target && e.target.dataset ? Number(e.target.dataset.i) : NaN;
          const tile = root.querySelectorAll(".tile")[i];
          if (tile) tiles.scrollTo({ top: tile.offsetTop - tiles.offsetTop, behavior: "smooth" });
        });
        // Redraw when the frame changes size, so each chart keeps filling it.
        if (typeof ResizeObserver !== "undefined") {
          this._resize = new ResizeObserver(() => {
            if (this._tileHeight() !== this._lastTileHeight) {
              this._chartsKey = "";
              this._render();
            }
          });
          this._resize.observe(tiles);
        }
      } else {
        if (this._resize) this._resize.disconnect();
        this._resize = null;
        this.shadowRoot.innerHTML = `<style>${STYLE}</style><ha-card class="display">${sw}<div class="svg"></div></ha-card>`;
      }
      const button = this.shadowRoot.querySelector(".switch");
      if (button) button.addEventListener("click", (e) => { e.stopPropagation(); this._toggleView(); });
    }

    _render() {
      if (!this._config || !this._hass) return;
      try {
        const hass = this._hass;
        const day = HWDC.dayKey(Date.now(), hass.config && hass.config.time_zone);
        const today = this._view !== "charts" || this._offset === 0;
        if (today && this._day && day !== this._day && this._loadingDay !== day && this.isConnected) {
          this._refresh(); // a new day started: fetch the new statistics
        }
        const lang = (hass.locale && hass.locale.language) || hass.language;
        const nl = HWDC.pickLang(lang) === "nl";
        this._ensureRoot(this._view);
        const card = this.shadowRoot.querySelector("ha-card");
        const eff = HWDC.effectiveColors(this._config, hass);
        card.style.setProperty("--hwdc-background", eff.background);
        card.style.setProperty("--hwdc-text", eff.text);
        const button = this.shadowRoot.querySelector(".switch");
        if (button) {
          const toCharts = this._view !== "charts";
          const title = toCharts ? (nl ? "Grafieken tonen" : "Show charts") : (nl ? "Display tonen" : "Show display");
          button.title = title;
          button.setAttribute("aria-label", title);
          button.innerHTML = `<svg viewBox="0 0 24 24"><path d="${toCharts ? HWDC.ICONS.to_charts : HWDC.ICONS.to_display}"/></svg>`;
        }
        if (this._view === "charts") this._renderCharts(hass, lang);
        else this._renderDisplay(hass, lang);
      } catch (e) {
        console.warn(`${HWDC.TAG}:`, e);
      }
    }

    _renderDisplay(hass, lang) {
      const sources = this._sources || HWDC.resolveSources(this._config, null, null);
      const model = HWDC.computeModel(hass, sources, this._today || {});
      const svg = HWDC.renderSvg(model, this._config, HWDC.formatter(hass), lang, hass, this._today || {});
      if (svg === this._svg) return;
      this._svg = svg;
      this.shadowRoot.querySelector(".svg").innerHTML = svg;
    }

    _renderCharts(hass, lang) {
      const root = this.shadowRoot;
      const T = HWDC.CHART_TEXT[HWDC.pickLang(lang)];
      root.querySelectorAll(".tabs button").forEach((b) => {
        b.textContent = T.period[b.dataset.p];
        b.classList.toggle("on", b.dataset.p === this._period);
      });
      root.querySelector(".next").disabled = this._offset === 0;
      const tiles = root.querySelector(".tiles");
      if (!this._chart) {
        if (this._chartsKey !== "wait") {
          this._chartsKey = "wait";
          root.querySelector(".label").textContent = "";
          tiles.innerHTML = `<div class="wait">${T.loading}</div>`;
        }
        return;
      }
      const height = this._tileHeight();
      const out = HWDC.renderCharts(this._chart, this._config, HWDC.formatter(hass), lang, hass, height);
      const key = height + out.label + out.tiles.map((t) => t.svg).join("");
      if (key === this._chartsKey) return;
      this._chartsKey = key;
      this._lastTileHeight = height;
      root.querySelector(".label").textContent = out.label;
      const keep = tiles.scrollTop;
      tiles.innerHTML = out.tiles.map((t, i) => `<div class="tile" data-i="${i}">${t.svg}</div>`).join("") ||
        `<div class="wait">${T.none}</div>`;
      const first = tiles.querySelector(".tile");
      tiles.scrollTop = this._keepIndex !== null && this._keepIndex !== undefined && first
        ? this._keepIndex * (first.offsetHeight + 8) : keep;
      this._keepIndex = null;
      this._tileMeta = out.tiles.map((t) => t.meta);
      root.querySelector(".dots").innerHTML = out.tiles.length > 1
        ? out.tiles.map((_, i) => `<button type="button" data-i="${i}" aria-label="${i + 1}"></button>`).join("") : "";
      this._markDot();
    }

    // Height of one chart in SVG units, so it fills the frame at 800 wide.
    _tileHeight() {
      const tiles = this.shadowRoot && this.shadowRoot.querySelector(".tiles");
      if (!tiles || !tiles.clientWidth || !tiles.clientHeight) return 400;
      return Math.max(200, Math.min(1200, Math.round((800 * tiles.clientHeight) / tiles.clientWidth)));
    }

    // Index of the chart in view.
    _currentIndex() {
      const tiles = this.shadowRoot && this.shadowRoot.querySelector(".tiles");
      const first = tiles && tiles.querySelector(".tile");
      return first ? Math.round(tiles.scrollTop / (first.offsetHeight + 8)) : 0;
    }

    // Which chart is in view: highlight its dot.
    _markDot() {
      const i = this._currentIndex();
      this.shadowRoot.querySelectorAll(".dots button").forEach((b, k) => b.classList.toggle("on", k === i));
    }

    // Line and value under the pointer, like the app.
    _hover(e) {
      const root = this.shadowRoot;
      const tile = e && e.target && e.target.closest ? e.target.closest(".tile") : null;
      root.querySelectorAll(".tile .hover").forEach((g) => {
        if (!tile || !tile.contains(g)) g.setAttribute("visibility", "hidden");
      });
      if (!tile || !this._tileMeta) return;
      const meta = this._tileMeta[Number(tile.dataset.i)];
      const svg = tile.querySelector("svg");
      if (!meta || !svg) return;
      const r = svg.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 800;
      let best = -1;
      let dist = Infinity;
      meta.centers.forEach((cx, i) => {
        if (meta.labels[i] === null) return;
        const d = Math.abs(cx - x);
        if (d < dist) {
          dist = d;
          best = i;
        }
      });
      const g = svg.querySelector(".hover");
      if (best < 0 || !g) return;
      const cx = meta.centers[best];
      const line = g.querySelector("line");
      line.setAttribute("x1", cx);
      line.setAttribute("x2", cx);
      const label = g.querySelector("text");
      label.setAttribute("x", Math.max(130, Math.min(670, cx)));
      label.textContent = meta.labels[best];
      g.setAttribute("visibility", "visible");
    }

    getCardSize() {
      return this._view === "charts" ? 4 * Math.max(1, (this._chart && this._chart.charts.length) || 6) : 6;
    }

    getGridOptions() {
      return { columns: 12, rows: "auto", min_columns: 6 };
    }
  }

  // Visual editor: Home Assistant's own ha-form, rebuilt after every change so each circle and
  // row only offers the modes and goals of the chosen source, like the HomeWizard app.
  class HomeWizardDisplayCardEditor extends HTMLElement {
    setConfig(config) {
      this._config = { ...config };
      this._render();
    }

    set hass(hass) {
      this._hass = hass;
      if (this._form) {
        this._form.hass = hass;
        this._render();
      }
    }

    _render() {
      if (!this._config) return;
      const lang = HWDC.editorLang(this._hass);
      if (!this._form) {
        this._form = document.createElement("ha-form");
        this._form.addEventListener("value-changed", (ev) => {
          ev.stopPropagation();
          const config = HWDC.cleanEditorConfig(ev.detail.value, this._config);
          this._config = config;
          this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
          this._render();
        });
        this.appendChild(this._form);
      }
      this._form.computeLabel = (schema) => HWDC.editorLabel(schema, lang);
      this._form.computeHelper = (schema) => HWDC.editorHelper(schema, lang);
      if (this._hass) this._form.hass = this._hass;
      this._form.data = HWDC.editorData(this._config);
      this._form.schema = HWDC.editorSchema(this._config, lang, this._hass);
    }
  }

  if (!customElements.get(HWDC.EDITOR_TAG)) customElements.define(HWDC.EDITOR_TAG, HomeWizardDisplayCardEditor);
  if (!customElements.get(HWDC.TAG)) {
    customElements.define(HWDC.TAG, HomeWizardDisplayCard);
    window.customCards = window.customCards || [];
    window.customCards.push({
      type: HWDC.TAG,
      name: "HomeWizard Display Card",
      description: "The Usage Overview screen of the HomeWizard Energy Display: electricity, solar, home battery, water and gas at a glance.",
      preview: true,
      documentationURL: "https://github.com/timoverwoest/homewizard_display_card",
    });
    console.info(`%c HomeWizard Display Card %c ${HWDC.VERSION} `, "background:#a259ff;color:#fff", "background:#05070b;color:#fff");
  }
}
