// Tests for homewizard_display_card.js. They run after the card file in the same global scope:
//   jsc:  jsc homewizard_display_card.js tests/test.js
//   node: node tests/run-node.js
// Only the pure functions in HWDC are tested; the custom element needs a browser.
// All entity ids are placeholders.

const out = typeof print === "function" ? print : (s) => console.log(s);
let passed = 0;
const failures = [];
const test = (name, fn) => {
  try {
    const r = fn();
    if (r && typeof r.then === "function") {
      throw new Error("async tests go through testAsync");
    }
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
  if (a === null || Math.abs(a - b) > 1e-9) throw new Error(`${msg || "not near"}: got ${a}, expected ${b}`);
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
const hassNl = (states) => ({ states, locale: { language: "nl", number_format: "language" }, config: { time_zone: "Europe/Amsterdam" } });

// ------------------------------------------------------------------ configuration

test("defaults", () => {
  const c = HWDC.normalizeConfig({ type: "custom:homewizard-display-card" });
  eq(c.grid_power, []);
  eq(c.goal_grid_import, 25);
  eq(c.goal_water, 500);
  eq(c.battery_power_sign, "discharge_positive");
  eq(c.water_display, "auto");
  eq(c.use_energy_settings, true);
  eq(c.color_grid, "#a259ff");
});

test("entities become lists", () => {
  const c = HWDC.normalizeConfig({ grid_power: "sensor.grid_power", grid_import: ["sensor.import_t1", "sensor.import_t2", ""] });
  eq(c.grid_power, ["sensor.grid_power"]);
  eq(c.grid_import, ["sensor.import_t1", "sensor.import_t2"]);
});

test("empty values fall back to defaults", () => {
  const c = HWDC.normalizeConfig({ goal_solar: "", color_water: null, grid_export: "" });
  eq(c.goal_solar, 25);
  eq(c.color_water, "#3d8ff5");
  eq(c.grid_export, []);
});

test("goals must be positive numbers", () => {
  throws(() => HWDC.normalizeConfig({ goal_solar: 0 }), /goal_solar/);
  throws(() => HWDC.normalizeConfig({ goal_water: "lots" }), /goal_water/);
  eq(HWDC.normalizeConfig({ goal_water: "250" }).goal_water, 250);
});

test("colours are checked", () => {
  throws(() => HWDC.normalizeConfig({ color_grid: '#fff"/><script>' }), /color_grid/);
  eq(HWDC.normalizeConfig({ color_grid: [10, 20, 300] }).color_grid, "rgb(10,20,255)");
  eq(HWDC.normalizeConfig({ color_text: "rgba(255, 255, 255, 0.8)" }).color_text, "rgba(255, 255, 255, 0.8)");
});

test("options are checked", () => {
  throws(() => HWDC.normalizeConfig({ battery_power_sign: "plus" }), /battery_power_sign/);
  throws(() => HWDC.normalizeConfig({ water_display: "both" }), /water_display/);
  throws(() => HWDC.normalizeConfig({ grid_power: 12 }), /grid_power/);
  throws(() => HWDC.normalizeConfig(null));
  eq(HWDC.normalizeConfig({ use_energy_settings: false }).use_energy_settings, false);
});

// ------------------------------------------------------------------ sources

const PREFS_FLAT = {
  energy_sources: [
    { type: "grid", stat_energy_from: "sensor.import_t1", stat_energy_to: "sensor.export_t1", stat_rate: "sensor.grid_power" },
    { type: "grid", stat_energy_from: "sensor.import_t2", stat_energy_to: "sensor.export_t2", stat_rate: "sensor.grid_power" },
    { type: "solar", stat_energy_from: "sensor.solar_total" },
    { type: "battery", stat_energy_from: "sensor.bat_out", stat_energy_to: "sensor.bat_in", stat_rate: "sensor.bat_power", stat_soc: "sensor.bat_soc" },
    { type: "battery", stat_energy_from: "sensor.bat2_out", stat_energy_to: "sensor.bat2_in", stat_soc: "sensor.bat2_soc", power_config: { stat_rate_inverted: "sensor.bat2_power" } },
    { type: "water", stat_energy_from: "sensor.water_total", stat_rate: "sensor.water_flow" },
    { type: "gas", stat_energy_from: "sensor.gas_total" },
  ],
  device_consumption: [],
};

test("Energy settings, current flat format", () => {
  const s = HWDC.sourcesFromPrefs(PREFS_FLAT);
  eq(s.gridImport, ["sensor.import_t1", "sensor.import_t2"]);
  eq(s.gridExport, ["sensor.export_t1", "sensor.export_t2"]);
  eq(s.gridPower, [{ id: "sensor.grid_power", sign: 1 }], "same power sensor only once");
  eq(s.solar, ["sensor.solar_total"]);
  eq(s.batterySoc, ["sensor.bat_soc", "sensor.bat2_soc"]);
  eq(s.batteryPower, [{ id: "sensor.bat_power", sign: 1 }, { id: "sensor.bat2_power", sign: -1 }]);
  eq(s.water, ["sensor.water_total"]);
  eq(s.waterFlow, [{ id: "sensor.water_flow", sign: 1 }]);
});

test("Energy settings, older flow_from/flow_to format", () => {
  const s = HWDC.sourcesFromPrefs({
    energy_sources: [{
      type: "grid",
      flow_from: [{ stat_energy_from: "sensor.import_t1" }, { stat_energy_from: "sensor.import_t2" }],
      flow_to: [{ stat_energy_to: "sensor.export_t1" }],
      power: [{ power_config: { stat_rate_from: "sensor.grid_in", stat_rate_to: "sensor.grid_out" } }],
    }],
  });
  eq(s.gridImport, ["sensor.import_t1", "sensor.import_t2"]);
  eq(s.gridExport, ["sensor.export_t1"]);
  eq(s.gridPower, [{ id: "sensor.grid_in", sign: 1 }, { id: "sensor.grid_out", sign: -1 }]);
});

test("Energy settings, battery with directions", () => {
  const s = HWDC.sourcesFromPrefs({
    energy_sources: [{
      type: "battery",
      power_config: { stat_rate_to_home: "sensor.b_home", stat_rate_from_grid: "sensor.b_grid" },
    }],
  });
  eq(s.batteryPower, [{ id: "sensor.b_home", sign: 1 }, { id: "sensor.b_grid", sign: -1 }]);
});

test("Energy settings missing or broken", () => {
  const s = HWDC.sourcesFromPrefs(null);
  eq(s.gridImport, []);
  eq(HWDC.sourcesFromPrefs({ energy_sources: [null, 5, { type: "grid" }] }).gridPower, []);
});

test("own entities win, per value", () => {
  const c = HWDC.normalizeConfig({ grid_power: "sensor.my_power", battery_power: "sensor.my_battery", battery_power_sign: "charge_positive" });
  const s = HWDC.resolveSources(c, PREFS_FLAT);
  eq(s.gridPower, [{ id: "sensor.my_power", sign: 1 }]);
  eq(s.batteryPower, [{ id: "sensor.my_battery", sign: -1 }]);
  eq(s.gridImport, ["sensor.import_t1", "sensor.import_t2"], "rest still from the Energy settings");
  eq(HWDC.meterIds(s), ["sensor.import_t1", "sensor.import_t2", "sensor.export_t1", "sensor.export_t2", "sensor.solar_total", "sensor.water_total"]);
});

test("Energy settings switched off", () => {
  const c = HWDC.normalizeConfig({ use_energy_settings: false, solar_energy: "sensor.solar_today" });
  const s = HWDC.resolveSources(c, PREFS_FLAT);
  eq(s.gridImport, []);
  eq(s.solar, ["sensor.solar_today"]);
});

// ------------------------------------------------------------------ units

test("unit conversion", () => {
  near(HWDC.convert(1500, "Wh", "energy"), 1.5);
  near(HWDC.convert(2, "MWh", "energy"), 2000);
  near(HWDC.convert(3.6, "MJ", "energy"), 1);
  near(HWDC.convert(0.158, "m³", "volume"), 158);
  near(HWDC.convert(1, "gal", "volume"), 3.785411784);
  near(HWDC.convert(0.6, "m³/h", "flow"), 10);
  near(HWDC.convert(2.5, "kW", "power"), 2500);
  near(HWDC.convert(800, undefined, "power"), 800);
  near(HWDC.convert(64, "%", "raw"), 64);
  eq(HWDC.convert(1, "furlong", "energy"), null);
  eq(HWDC.convert(1, undefined, "volume"), null);
  eq(HWDC.convert(NaN, "W", "power"), null);
});

test("state values", () => {
  const h = { states: { "sensor.a": st("1.2", "kW"), "sensor.b": st("unavailable", "W") } };
  near(HWDC.stateValue(h, "sensor.a", "power"), 1200);
  eq(HWDC.stateValue(h, "sensor.b", "power"), null);
  eq(HWDC.stateValue(h, "sensor.c", "power"), null);
});

// ------------------------------------------------------------------ today

test("today: statistics plus live increase", () => {
  const h = { states: { "sensor.import_t1": st("12345.6", "kWh") } };
  near(HWDC.todayValue(h, "sensor.import_t1", "energy", { "sensor.import_t1": { change: 20.5, lastState: 12345.4, hasStats: true } }), 20.7);
});

test("today: live value in other unit than the statistics", () => {
  const h = { states: { "sensor.water_total": st("1.010", "m³") } };
  near(HWDC.todayValue(h, "sensor.water_total", "volume", { "sensor.water_total": { change: 150, lastState: 1002, hasStats: true } }), 158);
});

test("today: daily meter that was reset since the last statistic", () => {
  const h = { states: { "sensor.import_today": st("0.1", "kWh") } };
  near(HWDC.todayValue(h, "sensor.import_today", "energy", { "sensor.import_today": { change: null, lastState: 12.3, hasStats: true } }), 0.1);
});

test("today: no statistics → state as is", () => {
  const h = { states: { "sensor.solar_today": st("6000", "Wh") } };
  near(HWDC.todayValue(h, "sensor.solar_today", "energy", { "sensor.solar_today": { change: null, lastState: null, hasStats: false } }), 6);
});

test("today: not fetched yet", () => {
  eq(HWDC.todayValue({ states: {} }, "sensor.x", "energy", {}), null);
});

const fakeCallWS = (calls, data) => async (msg) => {
  calls.push(msg);
  if (msg.type === "recorder/statistics_during_period") return data.recent;
  if (msg.type === "recorder/statistic_during_period") {
    if (data.fail && data.fail === msg.statistic_id) throw new Error("boom");
    return data.change[msg.statistic_id] === undefined ? {} : { change: data.change[msg.statistic_id] };
  }
  throw new Error(`unexpected ${msg.type}`);
};

testAsync("fetchToday asks the recorder correctly", async () => {
  const calls = [];
  const hass = {
    callWS: fakeCallWS(calls, {
      recent: {
        "sensor.import_t1": [{ start: 1, state: 100.1 }, { start: 2, state: 100.4 }],
        "sensor.measure": [{ start: 1, mean: 5 }],
      },
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
  eq(recent.period, "5minute");
  eq(recent.types, ["state"]);
  eq(recent.units, { energy: "kWh", volume: "L" });
  eq(recent.start_time, "2026-11-22T09:48:51.000Z");
  const one = calls.find((c) => c.type === "recorder/statistic_during_period");
  eq(one.calendar, { period: "day" });
  eq(one.types, ["change"]);
  eq(await HWDC.fetchToday(hass, [], now), {});
});

// ------------------------------------------------------------------ time

test("refresh 25 s after each 5-minute boundary", () => {
  const t = Date.UTC(2026, 10, 22, 10, 18, 51);
  eq(HWDC.msToNextRefresh(t), (60 + 9 + 25) * 1000, "10:18:51 → 10:20:25");
  eq(HWDC.msToNextRefresh(Date.UTC(2026, 10, 22, 10, 20, 20)), 5000, "never sooner than 5 s");
  eq(HWDC.msToNextRefresh(Date.UTC(2026, 10, 22, 10, 20, 25)), 300000);
});

test("day in the server time zone", () => {
  const t = Date.UTC(2026, 10, 22, 23, 30, 0);
  eq(HWDC.dayKey(t, "Europe/Amsterdam"), "2026-11-23");
  eq(HWDC.dayKey(t, "America/New_York"), "2026-11-22");
  eq(HWDC.dayKey(t, undefined), "2026-11-22");
  eq(HWDC.dayKey(t, "Not/AZone"), "2026-11-22");
});

// ------------------------------------------------------------------ numbers

test("number format follows the user profile", () => {
  const nl = HWDC.formatter({ locale: { language: "nl", number_format: "language" } });
  eq(nl(20.7, 1), { text: "20,7", int: "20", frac: "7" });
  eq(nl(3666, 0), { text: "3666", int: "3666", frac: "" }, "no thousands separator, like the display");
  eq(nl(-0.04, 1).text, "0,0", "no minus zero");
  eq(nl(-2150, 0).int, "-2150");
  const en = HWDC.formatter({ locale: { language: "nl", number_format: "comma_decimal" } });
  eq(en(20.7, 1).text, "20.7");
  const de = HWDC.formatter({ locale: { language: "en", number_format: "decimal_comma" } });
  eq(de(0.1, 1).text, "0,1");
  eq(HWDC.numberLocale({ locale: { language: "fr", number_format: "system" } }), undefined);
  eq(HWDC.numberLocale({ language: "nl" }), "nl");
  eq(HWDC.formatter({ locale: { language: "xx-invalid-!!" } })(1.5, 1).text, "1.5");
});

// ------------------------------------------------------------------ model and SVG

// The three scenarios from the reference button card. Battery sensor counts charging as +.
const SCENARIO_CONFIG = HWDC.normalizeConfig({
  grid_power: "sensor.grid_power",
  grid_import: "sensor.import_today",
  grid_export: "sensor.export_today",
  battery_soc: "sensor.battery_soc",
  battery_power: "sensor.battery_power",
  battery_power_sign: "charge_positive",
  solar_energy: "sensor.solar_today",
  water: "sensor.water_today",
  water_flow: "sensor.water_flow",
  use_energy_settings: false,
});
const NO_STATS = { change: null, lastState: null, hasStats: false };
const TODAY = { "sensor.import_today": NO_STATS, "sensor.export_today": NO_STATS, "sensor.solar_today": NO_STATS, "sensor.water_today": NO_STATS };
const scenario = (p, imp, exp, soc, water, flow, bat, solar) => hassNl({
  "sensor.grid_power": st(p, "W"),
  "sensor.import_today": st(imp, "kWh"),
  "sensor.export_today": st(exp, "kWh"),
  "sensor.battery_soc": st(soc, "%"),
  "sensor.water_today": st(water, "m³"),
  "sensor.water_flow": st(flow, "L/min"),
  "sensor.battery_power": st(bat, "W"),
  "sensor.solar_today": st(solar, "kWh"),
});
const draw = (hass, config) => {
  const c = config || SCENARIO_CONFIG;
  const m = HWDC.computeModel(hass, HWDC.resolveSources(c, null), TODAY);
  return { m, svg: HWDC.renderSvg(m, c, HWDC.formatter(hass), "nl") };
};
const count = (s, needle) => s.split(needle).length - 1;

test("scenario 1: photo 10:18, taking from the grid, battery charging", () => {
  const { m, svg } = draw(scenario(3666, 20.7, 0, 0, 0.158, 0, 9, 0.1));
  near(m.gridPower, 3666);
  near(m.batteryPower, -9, "charge_positive flips the sign");
  near(m.water, 158);
  ok(svg.includes(">3666</text>"), "grid power");
  ok(svg.includes('stroke="#a259ff" stroke-width="24" stroke-linecap="round"'), "purple arc");
  ok(!svg.includes('class="arc ccw" cx="200"'), "big ring clockwise");
  ok(svg.includes("↓</tspan>20,7"), "import today under the ring");
  ok(!svg.includes("↑"), "no export arrow below 0.05 kWh");
  ok(svg.includes('stroke="#b9d2e0" stroke-opacity="0.3"'), "battery ring in battery colour");
  ok(svg.includes(">158</text>") && svg.includes(">L</text>"), "water litres today");
  ok(svg.includes('aria-label="Net 3666 W, vandaag afgenomen 20,7 kWh'), "Dutch screen reader text");
  eq(count(svg, "<path "), 3, "three icons");
});

test("scenario 2: summer noon, exporting, battery delivering, water running", () => {
  const { m, svg } = draw(scenario(-2150, 3.4, 8.6, 64, 0.212, 7.5, -450, 14.2));
  near(m.batteryPower, 450);
  ok(svg.includes('fill="#86d03c">-2150</text>'), "green negative number");
  ok(svg.includes('class="arc ccw" cx="200"'), "big ring counterclockwise");
  ok(svg.includes("↑</tspan>8,6"), "export today");
  ok(svg.includes('class="arc ccw" cx="468" cy="118"'), "battery ring counterclockwise");
  ok(svg.includes(">L/min</text>") && svg.includes(">7</text>") && svg.includes(">5</text>"), "water flow 7,5");
  ok(svg.includes(">14,2</text>"), "solar ring");
});

test("scenario 3: evening, taking from the grid, battery delivering", () => {
  const { svg } = draw(scenario(1500, 12.3, 4.1, 40, 0.3, 0, -300, 6.0));
  ok(svg.includes(">1500</text>"));
  ok(svg.includes('class="arc ccw" cx="468" cy="118"'), "battery delivers → green, counterclockwise");
  ok(svg.includes(">300</text>"), "water litres today");
});

test("kW from 10 kW, and arcs never exceed the goal", () => {
  const { svg } = draw(scenario(12345, 40, 0, 100, 1, 0, 0, 30));
  ok(svg.includes(">12,3</text>") && svg.includes(">kW</text>"));
  const full = (2 * Math.PI * 140).toFixed(2);
  ok(svg.includes(`stroke-dasharray="${full} ${full}"`), "arc capped at 100 %");
});

test("no data → dashes, no arcs, no errors", () => {
  const c = HWDC.normalizeConfig({});
  const m = HWDC.computeModel({ states: {} }, HWDC.resolveSources(c, null), {});
  eq(Object.values(m).every((v) => v === null), true);
  const svg = HWDC.renderSvg(m, c, HWDC.formatter({}), "en");
  ok(count(svg, ">–</text>") >= 6, "dashes");
  ok(!svg.includes('class="arc'), "no arcs");
  ok(svg.includes('aria-label="Grid no data'), "English screen reader text");
});

test("water display can be fixed to volume or flow", () => {
  const h = scenario(100, 1, 0, 50, 0.2, 7.5, 0, 1);
  const vol = draw(h, HWDC.normalizeConfig({ ...SCENARIO_CONFIG, water_display: "volume" })).svg;
  ok(vol.includes(">200</text>") && !vol.includes("L/min"));
  const flow = draw(scenario(100, 1, 0, 50, 0.2, 0, 0, 1), HWDC.normalizeConfig({ ...SCENARIO_CONFIG, water_display: "flow" })).svg;
  ok(flow.includes("L/min"));
});

test("auto-detected sources sum two tariffs and average two batteries", () => {
  const c = HWDC.normalizeConfig({});
  const src = HWDC.resolveSources(c, PREFS_FLAT);
  const hass = hassNl({
    "sensor.grid_power": st(-2.15, "kW"),
    "sensor.import_t1": st(1000.2, "kWh"),
    "sensor.import_t2": st(2000.1, "kWh"),
    "sensor.bat_soc": st(60, "%"),
    "sensor.bat2_soc": st(80, "%"),
    "sensor.bat_power": st(300, "W"),
    "sensor.bat2_power": st(200, "W"),
  });
  const today = {
    "sensor.import_t1": { change: 1.0, lastState: 1000.1, hasStats: true },
    "sensor.import_t2": { change: 2.0, lastState: 2000.0, hasStats: true },
  };
  const m = HWDC.computeModel(hass, src, today);
  near(m.gridPower, -2150);
  near(Number(m.gridImport.toFixed(9)), 3.2);
  near(m.batterySoc, 70);
  near(m.batteryPower, 100, "300 W discharging, inverted sensor 200 W = charging 200 W");
  eq(m.gridExport, null, "export meters not fetched");
});

// ------------------------------------------------------------------ editor

test("editor form has labels in both languages", () => {
  for (const lang of ["en", "nl"]) {
    const form = HWDC.configForm(lang);
    const names = [];
    const walk = (list) => list.forEach((s) => {
      if (s.name) names.push(s.name);
      if (s.schema) walk(s.schema);
    });
    walk(form.schema);
    for (const n of names) ok(typeof form.computeLabel({ name: n }) === "string", `${lang}: label for ${n}`);
    for (const key of Object.keys(HWDC.DEFAULTS)) ok(names.includes(key), `${lang}: ${key} in the form`);
  }
  eq(HWDC.configForm("nl-BE").computeLabel({ name: "goals" }), "Dagdoelen");
  eq(HWDC.configForm("de").computeLabel({ name: "goals" }), "Daily goals");
});

test("editor refuses what it cannot show", () => {
  const f = HWDC.configForm("en");
  throws(() => f.assertConfig({ color_grid: [1, 2, 3] }));
  throws(() => f.assertConfig({ grid_power: ["sensor.a", "sensor.b"] }));
  f.assertConfig({ grid_import: ["sensor.a", "sensor.b"], color_grid: "#fff" });
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
