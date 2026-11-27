# HomeWizard Display Card

*[Nederlandse versie](README.nl.md)*

<img src="https://raw.githubusercontent.com/timoverwoest/homewizard_display_card/main/images/logo.png" alt="Logo: a small screen with one large ring, two small rings and three bars" width="96" align="right">

A Home Assistant dashboard card that recreates the **Usage Overview** screen of the
[HomeWizard Energy Display](https://www.homewizard.com/energy-display/): three circles and three
rows that show electricity, solar, home battery, water and gas, now, today or in costs. One
button on the card switches to **charts** like those of the HomeWizard Energy app.

<img src="https://raw.githubusercontent.com/timoverwoest/homewizard_display_card/main/images/screenshot.png" alt="Default layout while taking power from the grid: purple ring with 1240 W, battery at 58 % delivering, 12.6 kWh solar today, 214 liters of water today" width="49%"> <img src="https://raw.githubusercontent.com/timoverwoest/homewizard_display_card/main/images/screenshot-export.png" alt="Default layout while returning power to the grid: green ring with -2150 W, battery at 88 % charging, 14.2 kWh solar today, water running at 7.5 L/min" width="49%">

<img src="https://raw.githubusercontent.com/timoverwoest/homewizard_display_card/main/images/screenshot-gas-water.png" alt="Gas, water and electricity: grid power 860 W, 187 liters of water and 2.36 m³ gas today, and today's costs for electricity, water and gas" width="49%">

* **Set up like the display.** Each circle and row shows a source (main connection, solar
  panels, home battery, water, gas, electricity use, self-sufficiency, a socket or kWh meter, or
  any sensor) in a mode: **Now**, **Today**, **Auto** or **Costs**, with a maximum goal.
* **Works with your Energy settings.** Grid (also with two tariffs), solar, home batteries, water,
  gas and their prices are picked up automatically. Today's values come from Home Assistant's
  statistics, like the Energy dashboard, and keep counting live in between. Usually no helpers
  needed.
* **Looks like the display.** Taking energy is purple: rings fill clockwise, bars from left to
  right. Delivering (returning to the grid, solar, a battery that discharges) is green: rings fill
  counterclockwise, bars from right to left.
* **Visual editor** in English and Dutch, set up like the HomeWizard app. Numbers follow the number
  format of your profile. Background color of your choice, by day and by night.
* **Charts like the HomeWizard app.** The button in the corner of the card switches to charts of
  water, gas, the main connection, solar, electricity use, self-sufficiency, standby use, the
  home battery and sensors of your own, per day, week, month or year. Each chart has the size of
  the display; swipe from chart to chart, or tap its icon.
* **One small file, no dependencies.** Fits in a sections view and scales to any width.

The data comes from Home Assistant, for example from the official HomeWizard integration. You
don't need a HomeWizard Energy Display, and other meters work too.

## Installation

### Marketplace (Home Assistant 2026.11 and later)

[![Open your Home Assistant instance and show this repository in the Marketplace.](https://my.home-assistant.io/badges/marketplace_repository.svg)](https://my.home-assistant.io/redirect/marketplace_repository/?owner=timoverwoest&repository=homewizard_display_card&category=plugin)

The card is in the Marketplace catalog.

1. Select the button above, or go to **Settings → Marketplace** and search for
   **HomeWizard Display Card**.
2. Select **Install**. The Marketplace adds the dashboard resource for you.
3. Reload your browser.

Updates appear under **Settings → Updates**.

### HACS (Home Assistant 2026.10 and older)

1. Open HACS and search for **HomeWizard Display Card**.
2. Select **Download** and reload your browser.

### Manual

1. Download `homewizard_display_card.js` from the
   [latest release](https://github.com/timoverwoest/homewizard_display_card/releases/latest)
   (it is in the source code) and put it in `/config/www/`.
2. Go to **Settings → Dashboards → ⋮ → Resources** and add
   `/local/homewizard_display_card.js?v=0.7.1` as a **JavaScript module**.
3. Reload your browser. Raise `?v=` with every new version.

## Configuration

Add the card from the card picker (search for "HomeWizard"). The editor is set up like the display
settings in the HomeWizard app: one section per circle and row (**Circle 1–3**, **Top**,
**Middle**, **Bottom**) with what it shows, the mode and the maximum goals, then the background
color, the sensors and the other colors.

In YAML, the shortest version is:

```yaml
type: custom:homewizard-display-card
```

That gives the display's default Usage Overview, filled from your
[Energy settings](https://my.home-assistant.io/redirect/config_energy/):

| Position | Key | Default |
|----------|-----|---------|
| Circle 1 (large) | `circle_1` | Main connection, now, goal 7000 W |
| Circle 2 | `circle_2` | Home battery, goal 100 % |
| Circle 3 | `circle_3` | Solar panels, today, goal 25 kWh |
| Top | `top` | Main connection, today, goal 25 kWh |
| Middle | `middle` | Solar panels, today, goal 25 kWh |
| Bottom | `bottom` | Water, auto, goals 10 L/min and 500 L |

### What a circle or row can show

Each position takes `source`, `mode` and the goals that belong to that mode.

| `source` | Now (`goal_now`) | Today (`goal_today`) | Auto | Costs (`goal_cost`) |
|----------|------------------|----------------------|------|---------------------|
| `grid`: main connection | Power in W; green when returning (7000 W) | Taken from the grid, kWh (25 kWh) | – | Today's costs minus compensation (10) |
| `solar`: solar panels | Production in W (5000 W) | Production in kWh (25 kWh) | ✓ | – |
| `battery`: home battery | State of charge in % (100 %) | – | – | – |
| `water` | Flow in L/min (10 L/min) | Liters (500 L) | ✓ | Today's costs (2) |
| `gas` | Flow in m³/h (2 m³/h) | m³, or kWh for a gas meter in kWh (5) | ✓ | Today's costs (10) |
| `consumption`: electricity use of the house | W (7000 W) | kWh (25 kWh) | – | – |
| `self_sufficiency`: share not taken from the grid | % (100 %) | % (100 %) | – | – |
| `device`: Energy Socket, kWh Meter and the like | W from `power`; negative = producing (3000 W) | kWh from `energy` (10 kWh) | ✓ | – |
| `entity`: any sensor, for example a temperature | Value and unit of `entity` (100) | – | – | – |
| `none` | Nothing | | | |

* **Auto** shows *now* while something flows or produces, and *today* when that is 0.
* **Costs** use the prices in your Energy settings; Home Assistant makes the cost sensors itself.
  The currency follows your Home Assistant settings. A negative value (you earned more than you
  paid) is shown in green.
* **Electricity use** and **self-sufficiency** are worked out from the grid, solar panels and
  home batteries in your Energy settings, the same way the Energy dashboard does it.
* Under the large ring, when it shows the main connection, you see ↓ taken and ↑ returned today,
  like on the display. While you return power, a large ring in *today* mode shows what you
  returned today.
* A goal is the value at which the ring or bar is full. `color` gives one circle or row a color
  of its own.

### Charts

<img src="https://raw.githubusercontent.com/timoverwoest/homewizard_display_card/main/images/screenshot-charts.png" alt="Charts view: period bar with Today and Day, Week, Month, Year, and two of the charts: the main connection with 16.5 kWh taken and 0.1 kWh returned today, and self-sufficiency with the own solar energy in green" width="60%">

Select the button in the top-right corner of the card to switch between the display and the
charts, like the chart toggles of the Energy dashboard. Above the charts you choose **Day**,
**Week**, **Month** or **Year**, and step back in time with ‹ and ›.

* **From chart to chart:** swipe left or right, or select one of the icons below the charts. The
  highlighted icon shows which chart you are looking at. With a keyboard: the arrow keys.
  Swiping up and down still scrolls the page.
* **A value at one moment:** point at the chart with the mouse, or tap it on a touch screen. The
  value stays for a few seconds, or until you swipe.
* **Size:** on a wide card the charts view keeps the size of the display. On a narrow card, like
  on a phone, each chart has the size of the display and the buttons sit above and below it, so
  the card gets a bit taller there.
* **Swipe navigation between dashboard views** (the swipe-navigation plugin) leaves a swipe on the
  charts alone.

* **Day** shows the average power per 5 minutes as an area, like the app. Week, month and year
  show kWh (or liters, m³) per hour, day or month as bars.
* The charts use the colors of the display: purple for taking from the grid and electricity use,
  green for returning, solar and your own energy (self-sufficient), blue for water, orange for
  gas. A color you set on a circle or row is used too; when a circle and a row show the same
  source with different colors, the circle wins. Want other colors in the charts only? Set them
  under **Chart colors (optional)** (`chart_color_*` below); an empty field keeps the color of
  the display.
* The charts are drawn at the real size of the card, so axes and values keep the same readable
  size on a phone as on a wide screen. On a narrow card the axes show fewer labels.
* **Standby use** is the power your house keeps using all the time: the lowest 5 % of the
  averages of the period.
* Everything comes from Home Assistant's statistics, with the same sources as the display. Home
  Assistant keeps 5-minute statistics for `purge_keep_days` (ten days by default) and removes
  the oldest ones every night at 04:12. A day whose 5-minute statistics are gone, even partly,
  is shown per hour, so its totals match the Energy dashboard.

| Option | Default | Description |
|--------|---------|-------------|
| `view` | `display` | What the card shows first: `display` or `charts`. |
| `show_view_switch` | `true` | The button on the card to switch between the two. |
| `charts` | all with data | Which charts, in this order: `water`, `gas`, `grid`, `solar`, `consumption`, `self_sufficiency`, `standby`, `battery`. |
| `chart_entities` | none | Sensors of your own as extra charts, for example a temperature or humidity. |
| `period` | `day` | The period the charts start with: `day`, `week`, `month` or `year`. |
| `chart_color_grid` | display | Taking from the grid. |
| `chart_color_delivery` | display | Returning to the grid. |
| `chart_color_solar` | display | Solar panels. |
| `chart_color_consumption` | display | Electricity use and standby use. |
| `chart_color_self_sufficiency` | solar | Your own energy in Self-sufficient; empty = the solar color. |
| `chart_color_battery` | display | Home battery. |
| `chart_color_water` | display | Water. |
| `chart_color_gas` | display | Gas. |

### Sensors

Every value can come from an entity of your own; fields you leave empty are filled in from the
Energy settings.

**Which sensors does the card use?** In the editor, every empty field under **Sensors** shows the
sensor the card takes from the Energy settings (*Empty = sensor.… from the Energy settings*). To
see them in the YAML as well, press **Copy into the card** below Sensors: the card then writes
those sensors into its configuration, where you can change them in the editor or in the YAML.
After copying they no longer follow the Energy settings; clear a field to follow them again. Two
cases stay with the Energy settings, because the card has no option for them: a grid power sensor
entered as *inverted* or as *two sensors*, and a battery entered as two sensors (one per
direction).

| Option | Description |
|--------|-------------|
| `grid_power` | Power of the grid connection: positive = taking from the grid, negative = returning. W or kW. |
| `grid_import`, `grid_export` | Meter(s) for energy taken from or returned to the grid. One entity or a list, for example one per tariff. |
| `solar_power`, `solar_energy` | Power and production meter(s) of the solar panels. |
| `battery_soc` | State of charge (%). A list of several batteries gives their average. |
| `battery_power` | Battery power. A list is added up. Used to show when the battery delivers. |
| `battery_power_sign` | `discharge_positive` (default, Home Assistant's convention) or `charge_positive` if your `battery_power` sensor counts **charging** as positive, like the HomeWizard Plug-In Battery. Batteries from the Energy settings always follow Home Assistant's convention; copying a battery entered as *inverted* sets `charge_positive`. |
| `water`, `water_flow` | Water meter(s) and the flow sensor (L/min, m³/h and so on). |
| `gas`, `gas_flow` | Gas meter(s) and a flow sensor (m³/h). |
| `use_energy_settings` | `false`: only use the entities you set yourself. Default `true`. |

Meters can be total meters, the kind you use in the Energy settings, or daily meters such as a
utility meter that resets at midnight. The card asks Home Assistant's statistics for today's change
in both cases. An entity without statistics is shown as it is.

### Colors

| Option | Default | Used for |
|--------|---------|----------|
| `color_background` | `#05070b` (the black of the display) | Background by day (light theme); any hex color such as `#000000` or `#f4f4f4` |
| `color_background_dark` | same as by day | Background by night (dark theme) |
| `color_grid` | `#a259ff` | Main connection and electricity use |
| `color_delivery` | `#86d03c` | Delivery: returning, solar, a discharging battery, self-sufficiency |
| `color_battery` | `#b9d2e0` | Home battery while it does not deliver, and own sensors |
| `color_water` | `#3d8ff5` | Water |
| `color_gas` | `#f5a524` | Gas |
| `color_text` | automatic | Numbers: white on a dark background, near-black on a light one |

**Day and night.** The card follows the light or dark mode of Home Assistant, like the rest of
your dashboard: under your profile, **Theme** set to *Auto* follows your device, or choose *Light*
or *Dark*. In dark mode the card uses `color_background_dark`; leave it empty to keep one
background.

By default the card is black like the display, by day and at night. The editor suggests two
colors that blend in with the theme instead: **light `#f4f5f7`** by day and **dark gray
`#1c1c1c`** (the card color of the dark theme) at night. You can also type your own hex color.

```yaml
type: custom:homewizard-display-card
color_background: "#f4f5f7"
color_background_dark: "#1c1c1c"
```

On a light background the card uses darker variants of the accent colors, so rings, bars and
units stay readable: `#7c3aed` for the grid, `#4d8f1a` for delivery, `#6d8fa3` for the battery,
`#1f6fd6` for water and `#c27a00` for gas. Colors you set yourself are kept.

### Example

Gas in circle 3, water with its flow sensor at the bottom, and a slightly lighter background:

```yaml
type: custom:homewizard-display-card
circle_1:
  source: grid
  mode: now
  goal_now: 7000
circle_3:
  source: gas
  mode: today
  goal_today: 4
bottom:
  source: water
  mode: auto
  goal_now: 10
  goal_today: 500
water_flow: sensor.watermeter_active_water_usage
gas: sensor.p1_meter_total_gas
color_background: "#101418"
```

## Do I need helper sensors?

Usually not. The card works out these by itself: today's totals (from the statistics), costs
(from the Energy settings), electricity use and self-sufficiency, several tariffs (added up) and
several batteries (average charge, total power). You only need a helper in these cases. Helpers
are made under **Settings → Devices & services → Helpers → Create helper**.

| When | Why | How |
|------|-----|-----|
| You want water or gas **now** or **auto**, but the meter has no flow sensor (for example the P1 gas meter, or a water meter without one) | Now needs a flow | **Derivative sensor** on the water or gas meter. Time unit **minutes** for water (gives m³/min, the card converts it to L/min), **hours** for gas (gives m³/h). A time window of 5 minutes smooths the steps of the meter. Put it in `water_flow` or `gas_flow`. |
| You want solar **now**, but the inverter only has an energy meter | Now needs power | **Derivative sensor** on the solar meter with time unit **hours** (kWh/h is kW). Put it in `solar_power`. |
| Your grid power sensor counts returning as positive, or import and export are two sensors | The card wants one sensor, positive = taking | Best: enter it in the Energy settings under the grid's power (as *inverted* or as *two sensors*); Home Assistant then makes the right sensor and the card finds it. Otherwise a **Template sensor** with `{{ -(states('sensor.grid_power') | float(0)) }}` or import minus export. |
| You want **costs**, but have no prices in the Energy settings | Costs come from Home Assistant's cost sensors | No helper: add the price (fixed, or an entity with the current price) to the meter in the Energy settings. |
| A meter has no statistics (no state class) | Today comes from the statistics | **Utility meter** on that meter with meter reset cycle *daily*; it does have statistics. |
| You want gas, but it is not in the Energy settings | – | No helper: set `gas` to your gas meter. For gas costs, add gas with its price to the Energy settings. |

Your battery counts charging as positive? No helper: set `battery_power_sign: charge_positive`.

## How "today" works

The card reads today's change of each meter from the recorder statistics, the same data the
Energy dashboard uses. The day starts at midnight in the time zone of Home Assistant. Statistics
are stored every 5 minutes; in between, the card adds what the meter counted since the last
statistic, so the numbers keep moving.

The HomeWizard Energy Display resets its day totals at 2:00 at night, so between midnight and
two o'clock, and for the totals of the day, its numbers can differ from the card's.

## Notes

* The layout is fixed to the Usage Overview screen: three circles and three rows.
* Made with the HomeWizard integration in mind (P1 meter, water meter, Energy Socket, kWh Meter,
  Plug-In Battery), but any sensor with a supported unit works.

## Development

The card is a single JavaScript file without a build step. Tests for the logic:

```bash
node tests/run-node.js
```

On a Mac without Node, JavaScriptCore works too:

```bash
/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc homewizard_display_card.js tests/test.js
```

For a visual check, serve the repository root (for example `python3 -m http.server 8765`) and open
`http://localhost:8765/tests/demo.html`. That page uses a fake Home Assistant with demo values.

The code follows the
[coding guidelines of the Home Assistant frontend](https://contributors.home-assistant.io/frontend/development/guidelines/)
and the pages on [custom cards](https://contributors.home-assistant.io/frontend/custom-ui/card/),
with the same Prettier and ESLint rules (`.prettierrc.json`, `eslint.config.mjs`). The GitHub
action checks them on every push; with Node you can run the check yourself:

```bash
npm install --no-save --no-package-lock prettier@3.10.1 eslint@10.15.0 @eslint/js@10.0.1
npx prettier --check homewizard_display_card.js eslint.config.mjs "tests/*.js"
npx eslint homewizard_display_card.js tests
```

To see which version your browser loaded, run
`customElements.get("homewizard-display-card").version` in the browser console.

## Credits and disclaimer

Inspired by the [HomeWizard Energy Display](https://www.homewizard.com/energy-display/) and the
charts of the [HomeWizard Energy app](https://hwenergy.app).
[HomeWizard](https://www.homewizard.com/) and HomeWizard Energy are trademarks of HomeWizard B.V.
This is an independent community project; it is not affiliated with, endorsed by, or sponsored by
HomeWizard. The logo is an original design and not the HomeWizard logo.

Icons in the card: [Material Design Icons](https://pictogrammers.com/library/mdi/) by
Pictogrammers, Apache License 2.0.

## License

MIT, see [LICENSE](LICENSE).
