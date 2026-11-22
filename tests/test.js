// Tests for homewizard_display_card.js. They run after the card file in the same global scope:
//   jsc:  jsc homewizard_display_card.js tests/test.js
//   node: node tests/run-node.js
// Only the pure functions in HWDC are tested; the custom elements need a browser.
// All entity ids are placeholders.

const out = typeof print === "function" ? print : (s) => console.log(s);
let passed = 0;
const failures = [];
const test = (name, fn) => {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failures.push(`${name}: ${e && e.message ? e.message : e}`);
  }
};
const pending = [];
const testAsync = (name, fn) => {
  pending.push(fn().then(() => { passed += 1; }, (e) => { failures.push(`${name}: ${e && e.message ? e.message : e}`); }));
};
const eq = (a, b, msg) => {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`${msg || "not equal"}: got ${sa}, expected ${sb}`);
};
const near = (a, b, msg) => {
  if (a === null || a === undefined || Math.abs(a - b) > 1e-9) throw new Error(`${msg || "not near"}: got ${a}, expected ${b}`);
};
const ok = (cond, msg) => {
  if (!cond) throw new Error(msg || "expected true");
};
const throws = (fn, re) => {
  try {
    fn();
  } catch (e) {
    if (re && !re.test(String(e.message))) throw new Error(`wrong error: ${e.message}`);
    return;
  }
  throw new Error("expected an error");
};

const st = (state, unit, extra) => ({ state: String(state), attributes: { unit_of_measurement: unit, ...(extra || {}) } });
const hassNl = (states, extra) => ({
  states, locale: { language: "nl", number_format: "language" }, config: { time_zone: "Europe/Amsterdam", currency: "EUR" }, ...(extra || {}),
});

// ------------------------------------------------------------------ configuration

test("defaults follow the display's Usage Overview", () => {
  const c = HWDC.normalizeConfig({ type: "custom:homewizard-display-card" });
  eq(c.circle_1, { source: "grid", mode: "now", goal_now: 7000, goal_today: 25, goal_cost: 10, color: null });
  eq(c.circle_2.source, "battery");
  eq(c.circle_2.goal_now, 100);
  eq([c.circle_3.source, c.circle_3.mode, c.circle_3.goal_today], ["solar", "today", 25]);
  eq([c.top.source, c.top.mode], ["grid", "today"]);
  eq([c.middle.source, c.middle.mode], ["solar", "today"]);
  eq([c.bottom.source, c.bottom.mode, c.bottom.goal_now, c.bottom.goal_today], ["water", "auto", 10, 500]);
  eq(c.color_background, "#05070b");
  eq(c.battery_power_sign, "discharge_positive");
  eq(c.use_energy_settings, true);
  eq(c.grid_power, []);
});

test("slots: source, mode and goals", () => {
  const c = HWDC.normalizeConfig({
    circle_1: { source: "water", mode: "today", goal_today: 300 },
    circle_3: "gas",
    bottom: { source: "solar" },
    middle: { source: "none" },
  });
  eq([c.circle_1.source, c.circle_1.mode, c.circle_1.goal_today, c.circle_1.goal_now], ["water", "today", 300, 10]);
  eq([c.circle_3.source, c.circle_3.mode], ["gas", "today"], "shorthand; gas starts with today");
  eq([c.bottom.source, c.bottom.mode], ["solar", "today"]);
  eq(c.middle.mode, null);
  throws(() => HWDC.normalizeConfig({ top: { source: "wind" } }), /top.source/);
  throws(() => HWDC.normalizeConfig({ top: { source: "battery", mode: "today" } }), /top.mode/);
  throws(() => HWDC.normalizeConfig({ circle_2: { goal_now: 0 } }), /circle_2.goal_now/);
  throws(() => HWDC.normalizeConfig({ circle_2: { color: "red;}" } }), /circle_2.color/);
});

test("device and entity slots keep their sensors", () => {
  const c = HWDC.normalizeConfig({
    top: { source: "device", power: " sensor.socket_power ", energy: "sensor.socket_energy" },
    middle: { source: "entity", entity: "sensor.room_temperature" },
  });
  eq([c.top.power, c.top.energy, c.top.mode], ["sensor.socket_power", "sensor.socket_energy", "auto"]);
  eq(c.middle.entity, "sensor.room_temperature");
});

test("entities become lists, empty values fall back", () => {
  const c = HWDC.normalizeConfig({ grid_power: "sensor.grid_power", grid_import: ["sensor.import_t1", "sensor.import_t2", ""], color_water: "" });
  eq(c.grid_power, ["sensor.grid_power"]);
  eq(c.grid_import, ["sensor.import_t1", "sensor.import_t2"]);
  eq(c.color_water, "#3d8ff5");
  throws(() => HWDC.normalizeConfig({ grid_power: 12 }), /grid_power/);
});

test("colours are checked; background accepts any hex colour", () => {
  eq(HWDC.normalizeConfig({ color_background: "#1c1c1c" }).color_background, "#1c1c1c");
  eq(HWDC.normalizeConfig({ color_background: "#000" }).color_background, "#000");
  throws(() => HWDC.normalizeConfig({ color_background: '#fff"/><script>' }), /color_background/);
  eq(HWDC.normalizeConfig({ color_grid: [10, 20, 300] }).color_grid, "rgb(10,20,255)");
});

test("options are checked", () => {
  throws(() => HWDC.normalizeConfig({ battery_power_sign: "plus" }), /battery_power_sign/);
  throws(() => HWDC.normalizeConfig(null));
  eq(HWDC.normalizeConfig({ use_energy_settings: false }).use_energy_settings, false);
});

// ------------------------------------------------------------------ Energy settings

const PREFS = {
  energy_sources: [
    { type: "grid", stat_energy_from: "sensor.import_t1", stat_energy_to: "sensor.export_t1", stat_rate: "sensor.grid_power" },
    { type: "grid", stat_energy_from: "sensor.import_t2", stat_energy_to: "sensor.export_t2", stat_cost: "sensor.own_cost_t2" },
    { type: "solar", stat_energy_from: "sensor.solar_total", stat_rate: "sensor.solar_power" },
    { type: "solar", stat_energy_from: "sensor.solar_old" },
    { type: "battery", stat_energy_from: "sensor.bat_out", stat_energy_to: "sensor.bat_in", stat_rate: "sensor.bat_power", stat_soc: "sensor.bat_soc" },
    { type: "battery", stat_energy_from: "sensor.bat2_out", stat_energy_to: "sensor.bat2_in", stat_soc: "sensor.bat2_soc", power_config: { stat_rate_inverted: "sensor.bat2_power" } },
    { type: "water", stat_energy_from: "sensor.water_total", stat_rate: "sensor.water_flow" },
    { type: "gas", stat_energy_from: "sensor.gas_total" },
  ],
  device_consumption: [],
};
const INFO = {
  cost_sensors: {
    "sensor.import_t1": "sensor.import_t1_cost",
    "sensor.import_t2": "sensor.import_t2_cost",
    "sensor.export_t1": "sensor.export_t1_compensation",
    "sensor.export_t2": "sensor.export_t2_compensation",
    "sensor.water_total": "sensor.water_total_cost",
    "sensor.gas_total": "sensor.gas_total_cost",
  },
  solar_forecast_domains: [],
};

test("Energy settings, current flat format with costs", () => {
  const s = HWDC.sourcesFromPrefs(PREFS, INFO);
  eq(s.gridImport, ["sensor.import_t1", "sensor.import_t2"]);
  eq(s.gridExport, ["sensor.export_t1", "sensor.export_t2"]);
  eq(s.gridCost, ["sensor.import_t1_cost", "sensor.own_cost_t2"], "explicit stat_cost wins");
  eq(s.gridCompensation, ["sensor.export_t1_compensation", "sensor.export_t2_compensation"]);
  eq(s.gridPower, [{ id: "sensor.grid_power", sign: 1 }]);
  eq(s.solar, ["sensor.solar_total", "sensor.solar_old"]);
  eq(s.solarPower, [{ id: "sensor.solar_power", sign: 1 }]);
  eq(s.batterySoc, ["sensor.bat_soc", "sensor.bat2_soc"]);
  eq(s.batteryPower, [{ id: "sensor.bat_power", sign: 1 }, { id: "sensor.bat2_power", sign: -1 }]);
  eq(s.batteryOut, ["sensor.bat_out", "sensor.bat2_out"]);
  eq(s.batteryIn, ["sensor.bat_in", "sensor.bat2_in"]);
  eq([s.water, s.waterFlow, s.waterCost], [["sensor.water_total"], [{ id: "sensor.water_flow", sign: 1 }], ["sensor.water_total_cost"]]);
  eq([s.gas, s.gasCost], [["sensor.gas_total"], ["sensor.gas_total_cost"]]);
});

test("Energy settings, older flow_from/flow_to format", () => {
  const s = HWDC.sourcesFromPrefs({
    energy_sources: [{
      type: "grid",
      flow_from: [{ stat_energy_from: "sensor.import_t1" }, { stat_energy_from: "sensor.import_t2" }],
      flow_to: [{ stat_energy_to: "sensor.export_t1" }],
      power: [{ power_config: { stat_rate_from: "sensor.grid_in", stat_rate_to: "sensor.grid_out" } }],
    }],
  }, null);
  eq(s.gridImport, ["sensor.import_t1", "sensor.import_t2"]);
  eq(s.gridExport, ["sensor.export_t1"]);
  eq(s.gridPower, [{ id: "sensor.grid_in", sign: 1 }, { id: "sensor.grid_out", sign: -1 }]);
});

test("Energy settings: battery with directions, home source, nothing", () => {
  const s = HWDC.sourcesFromPrefs({
    energy_sources: [
      { type: "battery", stat_energy_to_home: "sensor.b_home", stat_energy_from_grid: "sensor.b_grid", power_config: { stat_rate_to_home: "sensor.b_p_home", stat_rate_from_grid: "sensor.b_p_grid" } },
      { type: "home", stat_rate: "sensor.home_power", stat_energy_to: "sensor.home_energy" },
    ],
  });
  eq(s.batteryPower, [{ id: "sensor.b_p_home", sign: 1 }, { id: "sensor.b_p_grid", sign: -1 }]);
  eq([s.batteryOut, s.batteryIn], [["sensor.b_home"], ["sensor.b_grid"]]);
  eq([s.homePower, s.homeEnergy], [[{ id: "sensor.home_power", sign: 1 }], ["sensor.home_energy"]]);
  eq(HWDC.sourcesFromPrefs(null).gridImport, []);
  eq(HWDC.sourcesFromPrefs({ energy_sources: [null, 5, { type: "grid" }] }).gridPower, []);
});

test("own entities win, per value; costs only when a slot needs them", () => {
  const c = HWDC.normalizeConfig({ grid_power: "sensor.my_power", battery_power: "sensor.my_battery", battery_power_sign: "charge_positive", gas: "sensor.my_gas" });
  const s = HWDC.resolveSources(c, PREFS, INFO);
  eq(s.gridPower, [{ id: "sensor.my_power", sign: 1 }]);
  eq(s.batteryPower, [{ id: "sensor.my_battery", sign: -1 }]);
  eq(s.gas, ["sensor.my_gas"]);
  eq(s.gridImport, ["sensor.import_t1", "sensor.import_t2"], "rest still from the Energy settings");
  eq(HWDC.needsCosts(c), false);
  ok(!HWDC.meterIds(s, false).includes("sensor.import_t1_cost"));
  ok(HWDC.meterIds(s, true).includes("sensor.import_t1_cost"));
  eq(HWDC.needsCosts(HWDC.normalizeConfig({ top: { source: "grid", mode: "cost" } })), true);
  const off = HWDC.resolveSources(HWDC.normalizeConfig({ use_energy_settings: false }), PREFS, INFO);
  eq([off.gridImport, off.gridCost], [[], []]);
});

test("device meters are fetched too", () => {
  const c = HWDC.normalizeConfig({ top: { source: "device", energy: "sensor.socket_energy" }, middle: { source: "device", energy: "sensor.socket_energy" } });
  eq(HWDC.slotMeterIds(c), ["sensor.socket_energy"]);
});

// ------------------------------------------------------------------ units

test("unit conversion", () => {
  near(HWDC.convert(1500, "Wh", "energy"), 1.5);
  near(HWDC.convert(3.6, "MJ", "energy"), 1);
  near(HWDC.convert(0.158, "m³", "volume"), 158);
  near(HWDC.convert(0.6, "m³/h", "flow"), 10);
  near(HWDC.convert(2.5, "kW", "power"), 2500);
  near(HWDC.convert(1.2, "kWh/h", "power"), 1200, "derivative helper on a kWh meter");
  near(HWDC.convert(0.01, "m³/min", "flow"), 10, "derivative helper on a water meter");
  near(HWDC.convert(800, undefined, "power"), 800);
  near(HWDC.convert(64, "%", "raw"), 64);
  eq(HWDC.convert(1, "furlong", "energy"), null);
  eq(HWDC.convert(1, undefined, "volume"), null);
  eq(HWDC.convert(NaN, "W", "power"), null);
});

test("gas in m³ or in kWh", () => {
  const h = { states: { "sensor.gas_m3": st(1, "m³"), "sensor.gas_kwh": st(1, "kWh") } };
  eq(HWDC.gasKind(h, "sensor.gas_m3"), "volume");
  eq(HWDC.gasKind(h, "sensor.gas_kwh"), "energy");
  eq(HWDC.gasKind(h, "external:gas"), "volume");
});

// ------------------------------------------------------------------ today

test("today: statistics plus live increase", () => {
  const h = { states: { "sensor.import_t1": st("12345.6", "kWh") } };
  near(HWDC.todayValue(h, "sensor.import_t1", "energy", { "sensor.import_t1": { change: 20.5, lastState: 12345.4, hasStats: true } }), 20.7);
});

test("today: live value in another unit than the statistics", () => {
  const h = { states: { "sensor.water_total": st("1.010", "m³") } };
  near(HWDC.todayValue(h, "sensor.water_total", "volume", { "sensor.water_total": { change: 150, lastState: 1002, hasStats: true } }), 158);
});

test("today: daily meter reset since the last statistic; no statistics; not fetched", () => {
  const h = { states: { "sensor.import_today": st("0.1", "kWh"), "sensor.solar_today": st("6000", "Wh") } };
  near(HWDC.todayValue(h, "sensor.import_today", "energy", { "sensor.import_today": { change: null, lastState: 12.3, hasStats: true } }), 0.1);
  near(HWDC.todayValue(h, "sensor.solar_today", "energy", { "sensor.solar_today": { change: null, lastState: null, hasStats: false } }), 6);
  eq(HWDC.todayValue(h, "sensor.x", "energy", {}), null);
});

const fakeCallWS = (calls, data) => async (msg) => {
  calls.push(msg);
  if (msg.type === "recorder/statistics_during_period") return data.recent;
  if (msg.type === "recorder/statistic_during_period") {
    if (data.fail === msg.statistic_id) throw new Error("boom");
    return data.change[msg.statistic_id] === undefined ? {} : { change: data.change[msg.statistic_id] };
  }
  throw new Error(`unexpected ${msg.type}`);
};

testAsync("fetchToday asks the recorder correctly", async () => {
  const calls = [];
  const hass = {
    callWS: fakeCallWS(calls, {
      recent: { "sensor.import_t1": [{ start: 1, state: 100.1 }, { start: 2, state: 100.4 }], "sensor.measure": [{ start: 1, mean: 5 }] },
      change: { "sensor.import_t1": 20.5 },
      fail: "sensor.broken",
    }),
  };
  const now = Date.UTC(2026, 10, 22, 10, 18, 51);
  const r = await HWDC.fetchToday(hass, ["sensor.import_t1", "sensor.measure", "sensor.broken"], now);
  eq(r["sensor.import_t1"], { change: 20.5, lastState: 100.4, hasStats: true });
  eq(r["sensor.measure"], { change: null, lastState: null, hasStats: false }, "measurement sensor = no meter statistics");
  eq(r["sensor.broken"], { change: null, lastState: null, hasStats: false });
  const recent = calls.find((c) => c.type === "recorder/statistics_during_period");
  eq([recent.period, recent.types, recent.units, recent.start_time], ["5minute", ["state"], { energy: "kWh", volume: "L" }, "2026-11-22T09:48:51.000Z"]);
  const one = calls.find((c) => c.type === "recorder/statistic_during_period");
  eq([one.calendar, one.types], [{ period: "day" }, ["change"]]);
  eq(await HWDC.fetchToday(hass, [], now), {});
});

// ------------------------------------------------------------------ time and numbers

test("refresh 25 s after each 5-minute boundary", () => {
  eq(HWDC.msToNextRefresh(Date.UTC(2026, 10, 22, 10, 18, 51)), (60 + 9 + 25) * 1000);
  eq(HWDC.msToNextRefresh(Date.UTC(2026, 10, 22, 10, 20, 20)), 5000);
  eq(HWDC.msToNextRefresh(Date.UTC(2026, 10, 22, 10, 20, 25)), 300000);
});

test("day in the server time zone", () => {
  const t = Date.UTC(2026, 10, 22, 23, 30, 0);
  eq(HWDC.dayKey(t, "Europe/Amsterdam"), "2026-11-23");
  eq(HWDC.dayKey(t, "America/New_York"), "2026-11-22");
  eq(HWDC.dayKey(t, "Not/AZone"), "2026-11-22");
});

test("number format follows the user profile", () => {
  const nl = HWDC.formatter(hassNl({}));
  eq(nl(20.7, 1), { text: "20,7", int: "20", frac: "7" });
  eq(nl(3666, 0).text, "3666", "no thousands separator, like the display");
  eq(nl(-0.04, 1).text, "0,0", "no minus zero");
  eq(nl.currency, "€");
  eq(HWDC.formatter({ locale: { language: "nl", number_format: "comma_decimal" } })(20.7, 1).text, "20.7");
  eq(HWDC.formatter({ locale: { language: "en", number_format: "decimal_comma" } })(0.1, 1).text, "0,1");
  eq(HWDC.formatter({ locale: { language: "en" }, config: { currency: "USD" } }).currency, "$");
  eq(HWDC.numberLocale({ locale: { language: "fr", number_format: "system" } }), undefined);
  eq(HWDC.formatter({ locale: { language: "xx-invalid-!!" } })(1.5, 1).text, "1.5");
});

// ------------------------------------------------------------------ what the slots show

const OWN = {
  grid_power: "sensor.grid_power",
  grid_import: "sensor.import_today",
  grid_export: "sensor.export_today",
  battery_soc: "sensor.battery_soc",
  battery_power: "sensor.battery_power",
  battery_power_sign: "charge_positive",
  solar_energy: "sensor.solar_today",
  solar_power: "sensor.solar_power",
  water: "sensor.water_today",
  water_flow: "sensor.water_flow",
  gas: "sensor.gas_today",
  use_energy_settings: false,
};
const NO_STATS = { change: null, lastState: null, hasStats: false };
const TODAY = Object.fromEntries(["sensor.import_today", "sensor.export_today", "sensor.solar_today", "sensor.water_today", "sensor.gas_today", "sensor.socket_energy"].map((id) => [id, NO_STATS]));
const scenario = (p, imp, exp, soc, waterM3, flow, bat, solar, extra) => hassNl({
  "sensor.grid_power": st(p, "W"),
  "sensor.import_today": st(imp, "kWh"),
  "sensor.export_today": st(exp, "kWh"),
  "sensor.battery_soc": st(soc, "%"),
  "sensor.water_today": st(waterM3, "m³"),
  "sensor.water_flow": st(flow, "L/min"),
  "sensor.battery_power": st(bat, "W"),
  "sensor.solar_today": st(solar, "kWh"),
  "sensor.solar_power": st(0, "W"),
  "sensor.gas_today": st(1.234, "m³"),
  ...(extra || {}),
});
const draw = (hass, slots) => {
  const c = HWDC.normalizeConfig({ ...OWN, ...(slots || {}) });
  const m = HWDC.computeModel(hass, HWDC.resolveSources(c, null, null), TODAY);
  return { c, m, svg: HWDC.renderSvg(m, c, HWDC.formatter(hass), "nl", hass, TODAY) };
};
const count = (s, needle) => s.split(needle).length - 1;
const ringArc = (svg, cx, cy) => {
  const m = svg.match(new RegExp(`<circle class="arc( ccw)?" cx="${cx}" cy="${cy}" r="\\d+"[^>]*stroke-dasharray="([\\d.]+) ([\\d.]+)"`));
  return m ? { ccw: Boolean(m[1]), frac: Number(m[2]) / Number(m[3]) } : null;
};

test("photo 10:18: circle 1 = grid now against 7000 W", () => {
  const { svg } = draw(scenario(3666, 20.7, 0, 0, 0.158, 0, 9, 0.1));
  const arc = ringArc(svg, 200, 205);
  ok(Math.abs(arc.frac - 3666 / 7000) < 0.001, `arc ${arc.frac}`);
  eq(arc.ccw, false);
  ok(svg.includes(">3666</text>"), "grid power");
  ok(svg.includes("↓</tspan>20,7<tspan") && svg.includes('dx="16">↑</tspan>0,0</text>'), "taken and returned today on one line under the ring");
  ok(svg.includes('font-size="24" fill="#ffffff" fill-opacity="0.6">7</text>'), "row decimal small and grey");
  ok(svg.includes('stroke="#b9d2e0" stroke-opacity="0.3"'), "battery ring in battery colour, charging");
  ok(svg.includes(">158</text>") && svg.includes(">L</text>"), "water auto: litres today while nothing runs");
  ok(svg.includes('aria-label="Hoofdaansluiting nu 3666 W'), "Dutch screen reader text");
  eq(count(svg, "<path "), 3, "three row icons");
});

test("exporting: green, counterclockwise, bars from right to left", () => {
  const { svg } = draw(scenario(-2150, 3.4, 8.6, 64, 0.212, 7.5, -450, 14.2));
  const arc = ringArc(svg, 200, 205);
  ok(arc.ccw && Math.abs(arc.frac - 2150 / 7000) < 0.001, "big ring");
  ok(svg.includes('fill="#86d03c">-2150</text>'), "green negative number");
  ok(svg.includes("↑</tspan>8,6"), "export today");
  ok(ringArc(svg, 468, 118).ccw, "battery delivers → counterclockwise");
  ok(ringArc(svg, 468, 330).ccw, "solar always counterclockwise");
  ok(svg.includes('class="fill rtl" x1="780" y1="290"'), "solar bar fills from the right");
  ok(svg.includes('class="fill" x1="596" y1="150"'), "grid bar fills from the left");
  ok(svg.includes(">L/min</text>") && svg.includes(">7</text>") && svg.includes(">5</text>"), "water auto: flow 7,5 while running");
});

test("circle in today mode switches to export while exporting; rows do not", () => {
  const slots = { circle_1: { source: "grid", mode: "today" } };
  const { svg } = draw(scenario(-500, 3.4, 8.6, 50, 0.1, 0, 0, 5), slots);
  ok(ringArc(svg, 200, 205).ccw, "circle shows export");
  ok(svg.includes(">8,6</text>"));
  ok(svg.includes('class="fill" x1="596" y1="150"'), "top row still shows taken today, left to right");
});

test("kW from 10 kW in circles and from 1 kW in rows; arcs capped", () => {
  const { svg } = draw(scenario(12345, 40, 0, 100, 1, 0, 0, 30), { top: { source: "grid", mode: "now" } });
  ok(svg.includes(">12,3</text>") && svg.includes(">kW</text>"));
  ok(svg.includes(">12</text>") && svg.includes(">3</text>"), "row 12 kW 3");
  const full = (2 * Math.PI * 140).toFixed(2);
  ok(svg.includes(`stroke-dasharray="${full} ${full}"`), "arc capped at 100 %");
});

test("gas, solar now, consumption and self-sufficiency", () => {
  const h = scenario(500, 4, 1, 50, 0.1, 0, 300, 6, { "sensor.solar_power": st(1200, "W") });
  const { m, svg } = draw(h, {
    circle_3: { source: "gas", mode: "today" },
    top: { source: "consumption", mode: "now" },
    middle: { source: "self_sufficiency", mode: "today" },
    bottom: { source: "solar", mode: "auto" },
  });
  near(m.gas, 1.234);
  ok(svg.includes(">1,23</text>") && svg.includes(">m³</text>"), "gas today in m³");
  // The battery sensor counts charging as positive: +300 W = charging, so the house uses less.
  near(m.consumptionNow, 500 + 1200 - 300);
  near(m.consumptionToday, 4 - 1 + 6);
  near(m.selfToday, (1 - 4 / 9) * 100);
  ok(svg.includes(">56</text>") && svg.includes(">%</text>"), "self-sufficient 56 %");
  eq(count(svg, ">kW</text>"), 2, "consumption 1,4 kW and solar 1,2 kW in rows");
  ok(svg.includes(">4</text>") && svg.includes(">2</text>"), "decimals 4 and 2");
});

test("costs: grid net, negative = earning", () => {
  const c = HWDC.normalizeConfig({ circle_1: { source: "grid", mode: "cost" }, bottom: { source: "water", mode: "cost" } });
  const hass = hassNl({});
  const src = HWDC.resolveSources(c, PREFS, INFO);
  const today = {
    "sensor.import_t1_cost": { change: 1.2, lastState: null, hasStats: true },
    "sensor.own_cost_t2": { change: 0.8, lastState: null, hasStats: true },
    "sensor.export_t1_compensation": { change: 2.5, lastState: null, hasStats: true },
    "sensor.water_total_cost": { change: 0.42, lastState: null, hasStats: true },
  };
  const m = HWDC.computeModel(hass, src, today);
  near(Number(m.gridCost.toFixed(9)), -0.5);
  const svg = HWDC.renderSvg(m, c, HWDC.formatter(hass), "nl", hass, today);
  ok(svg.includes('fill="#86d03c">-0,50</text>') && svg.includes(">€</text>"), "earning shown green");
  ok(svg.includes(">0</text>") && svg.includes(">42</text>"), "water costs 0,42 in a row");
});

test("device: socket power now, its meter today; producing = delivery", () => {
  const h = scenario(100, 1, 0, 50, 0.1, 0, 0, 1, { "sensor.socket_power": st(-350, "W"), "sensor.socket_energy": st(4.2, "kWh") });
  let r = draw(h, { top: { source: "device", mode: "auto", power: "sensor.socket_power", energy: "sensor.socket_energy" } });
  ok(r.svg.includes('class="fill rtl" x1="780" y1="150"'), "producing socket fills from the right");
  ok(r.svg.includes(">-350</text>"));
  r = draw(scenario(100, 1, 0, 50, 0.1, 0, 0, 1, { "sensor.socket_power": st(0, "W"), "sensor.socket_energy": st(4.2, "kWh") }),
    { top: { source: "device", mode: "auto", power: "sensor.socket_power", energy: "sensor.socket_energy" } });
  ok(r.svg.includes(">4</text>") && r.svg.includes(">kWh</text>"), "auto at 0 W shows today");
});

test("own sensor (temperature) and none", () => {
  const h = scenario(100, 1, 0, 50, 0.1, 0, 0, 1, { "sensor.room_temperature": st(21.46, "°C", { device_class: "temperature" }) });
  const { svg } = draw(h, { top: { source: "entity", entity: "sensor.room_temperature", goal_now: 30 }, middle: { source: "none" }, circle_3: { source: "none" } });
  ok(svg.includes(">21</text>") && svg.includes(">°C</text>") && svg.includes(">5</text>"), "21,5 °C");
  eq(count(svg, "<path "), 2, "two icons: temperature and water");
  ok(!svg.includes('cx="468" cy="330"'), "empty circle 3");
});

test("no data → dashes, no arcs, no errors", () => {
  const c = HWDC.normalizeConfig({});
  const m = HWDC.computeModel({ states: {} }, HWDC.resolveSources(c, null, null), {});
  const svg = HWDC.renderSvg(m, c, HWDC.formatter({}), "en", { states: {} }, {});
  ok(count(svg, ">–</text>") >= 6, "dashes");
  ok(!svg.includes('class="arc') && !svg.includes('class="fill'), "no arcs or bars");
  ok(svg.includes('aria-label="Main connection now no data'), "English screen reader text");
});

test("background colour is used", () => {
  const { svg } = draw(scenario(100, 1, 0, 50, 0.1, 0, 0, 1), { color_background: "#1c1c1c" });
  ok(svg.includes('<rect width="800" height="480" fill="#1c1c1c"/>'));
});

test("units with markup are escaped", () => {
  const h = scenario(100, 1, 0, 50, 0.1, 0, 0, 1, { "sensor.odd": st(5, "<b>&") });
  const { svg } = draw(h, { top: { source: "entity", entity: "sensor.odd" } });
  ok(svg.includes("&lt;b&gt;&amp;") && !svg.includes("<b>"));
});

// ------------------------------------------------------------------ editor

const walk = (schema, fn) => schema.forEach((s) => { fn(s); if (s.schema) walk(s.schema, fn); });

test("editor: like the app, only the modes and goals of the chosen source", () => {
  const schema = HWDC.editorSchema({ bottom: { source: "water", mode: "auto" }, circle_2: { source: "battery" } }, "nl", hassNl({}));
  const slot = (k) => schema.find((s) => s.name === k);
  eq(slot("circle_1").title, "Cirkel 1: Hoofdaansluiting, Nu");
  eq(slot("circle_2").title, "Cirkel 2: Thuisaccu");
  eq(slot("bottom").title, "Onderaan: Water, Auto");
  const names = (k) => { const n = []; walk(slot(k).schema, (s) => s.name && n.push(s.name)); return n; };
  eq(names("bottom"), ["source", "mode", "goal_now", "goal_today", "color"]);
  eq(names("circle_2"), ["source", "goal_now", "color"], "battery: no mode choice");
  const mode = slot("circle_1").schema.find((s) => s.name === "mode");
  eq(mode.selector.select.options.map((o) => o.label), ["Nu", "Vandaag", "Kosten"]);
  eq(mode.helper_text, "Toont het huidig verbruik");
  ok(mode.required && slot("circle_1").schema[0].required, "source and mode have no clear button");
  const goal = []; walk(slot("bottom").schema, (s) => s.name === "goal_now" && goal.push(s.selector.number.unit_of_measurement));
  eq(goal, ["L/min"]);
  ok(schema.some((s) => s.name === "color_background"), "background colour visible, not folded away");
});

test("editor: device and entity slots ask for their sensors", () => {
  const schema = HWDC.editorSchema({ top: { source: "device" }, middle: { source: "entity" } }, "en", null);
  const names = (k) => { const n = []; walk(schema.find((s) => s.name === k).schema, (s) => s.name && n.push(s.name)); return n; };
  eq(names("top"), ["source", "power", "energy", "mode", "goal_now", "goal_today", "color"]);
  eq(names("middle"), ["source", "entity", "goal_now", "color"]);
});

test("editor: every field has a label in both languages", () => {
  for (const lang of ["en", "nl"]) {
    const all = { ...Object.fromEntries(HWDC.SLOTS.map((k) => [k, { source: "device" }])) };
    walk(HWDC.editorSchema(all, lang, null), (s) => {
      if (s.name) ok(HWDC.editorLabel(s, lang) !== s.name, `${lang}: label for ${s.name}`);
    });
    walk(HWDC.editorSchema({ top: { source: "entity" } }, lang, null), (s) => {
      if (s.name) ok(HWDC.editorLabel(s, lang) !== s.name, `${lang}: label for ${s.name}`);
    });
  }
  eq(HWDC.editorLabel({ name: "goal_now" }, "nl-BE"), "Maximaal doel nu");
  eq(HWDC.editorLabel({ name: "goal_now" }, "de"), "Maximum goal now");
});

test("editor: tidy configuration, new source starts fresh", () => {
  const before = { type: "custom:homewizard-display-card", circle_1: { source: "grid", mode: "now", goal_now: 6000 } };
  const data = HWDC.editorData(before);
  eq(data.circle_1.goal_now, 6000);
  eq(data.circle_2.source, "battery", "defaults shown in the form");
  eq(data.color_background, "#05070b");
  eq([data.use_energy_settings, data.battery_power_sign], [true, "discharge_positive"], "defaults visible in the form");
  eq(HWDC.editorData({ use_energy_settings: false, battery_power_sign: "charge_positive" }).use_energy_settings, false);
  // the user only changes circle 1's source to water
  const changed = { ...data, circle_1: { ...data.circle_1, source: "water" } };
  const cleaned = HWDC.cleanEditorConfig(changed, before);
  eq(cleaned.circle_1, { source: "water", mode: "auto" }, "goal 6000 W does not follow to water");
  eq(cleaned.circle_2, { source: "battery" });
  eq(cleaned.bottom, { source: "water", mode: "auto" });
  ok(!("color_background" in cleaned), "default background left out");
  eq(cleaned.type, "custom:homewizard-display-card");
  // the user sets a goal and a background colour
  const again = HWDC.cleanEditorConfig({ ...HWDC.editorData(cleaned), color_background: "#1C1C1C", circle_2: { source: "battery", goal_now: 80, color: "" } }, cleaned);
  eq(again.circle_2, { source: "battery", goal_now: 80 });
  eq(again.color_background, "#1C1C1C");
  // a mode the new source cannot show is replaced
  eq(HWDC.cleanEditorConfig({ top: { source: "grid", mode: "auto" } }, { top: { source: "grid" } }).top.mode, "now");
});

// ------------------------------------------------------------------ result

const finish = () => {
  if (failures.length) {
    failures.forEach((f) => out(`FAIL ${f}`));
    out(`${passed} passed, ${failures.length} failed`);
    throw new Error("tests failed");
  }
  out(`${passed} passed, 0 failed`);
};
// The fake callWS resolves at once, so the async tests settle when the microtasks run.
if (typeof drainMicrotasks === "function") {
  // JavaScriptCore: quit(1) still exits with 0, an uncaught exception exits with 3.
  drainMicrotasks();
  finish();
} else {
  Promise.all(pending).then(finish).catch((e) => {
    out(String(e && e.message ? e.message : e));
    process.exitCode = 1;
  });
}
