# HomeWizard Display Card

*[Nederlandse versie](README.nl.md)*

<img src="https://raw.githubusercontent.com/timoverwoest/homewizard_display_card/main/images/logo.png" alt="Logo: a small screen with one large ring, two small rings and three bars" width="96" align="right">

A Home Assistant dashboard card that recreates the **Usage Overview** screen of the HomeWizard
Energy Display: grid power, today's import and export, home battery, solar and water at a glance.

<img src="https://raw.githubusercontent.com/timoverwoest/homewizard_display_card/main/images/screenshot.png" alt="The card while taking power from the grid: purple ring with 420 W, battery at 58 % delivering, 12.6 kWh solar today, 214 litres of water today" width="49%"> <img src="https://raw.githubusercontent.com/timoverwoest/homewizard_display_card/main/images/screenshot-export.png" alt="The card while returning power to the grid: green ring with -2150 W, battery at 88 % charging, 14.2 kWh solar today, water running at 7.5 L/min" width="49%">

* **Works with your Energy settings.** Grid (also with two tariffs), solar, home battery and water
  are picked up automatically. No helpers needed: like the Energy dashboard, the card takes
  today's values from Home Assistant's statistics, and keeps counting live in between.
* **Looks like the display.** Taking energy is purple and clockwise; delivering (returning to the
  grid, solar, a battery that discharges) is green and counterclockwise.
* **Visual editor** in English and Dutch. Numbers follow the number format of your profile.
* **One small file, no dependencies.** Fits in a sections view and scales to any width.

The data comes from Home Assistant, for example from the official HomeWizard integration. You
don't need a HomeWizard Energy Display, and other meters work too.

## What the card shows

| Part | Shows |
|------|-------|
| Large ring | Grid power now (W, from 10 kW in kW). The arc is the energy **taken** from the grid today against its goal: purple, clockwise. While you return power to the grid, the ring turns green and counterclockwise and the arc is the energy **returned** today. Below the ring: ↓ taken today and ↑ returned today (from 0.05 kWh). |
| Small ring, top | Home battery state of charge. Green and counterclockwise while the battery delivers (more than 20 W). |
| Small ring, bottom | Solar energy today against its goal: always green and counterclockwise. |
| Right column | Taken from the grid today, solar today, and water: litres today, or the flow in L/min while water runs. Each with a bar against its goal. |

## Installation

### Marketplace (Home Assistant 2026.11 and later)

[![Open your Home Assistant instance and show this repository in the Marketplace.](https://my.home-assistant.io/badges/marketplace_repository.svg)](https://my.home-assistant.io/redirect/marketplace_repository/?owner=timoverwoest&repository=homewizard_display_card&category=plugin)

The card has been submitted to the Marketplace catalog. Until it is listed, add it from its link:

1. Select the button above. Or go to **Settings → Marketplace**, select **Add from link** in the
   upper-right corner, enter `timoverwoest/homewizard_display_card` and select **Add**.
2. If you are asked to, connect your GitHub account (custom repositories need it). If the type is
   not detected, choose **Dashboard**.
3. Select **Install**. The Marketplace adds the dashboard resource for you.
4. Reload your browser.

Once the card is in the catalog, you can simply search for **HomeWizard Display Card** under
**Settings → Marketplace**. Updates appear under **Settings → Updates**.

### HACS (Home Assistant 2026.10 and older)

1. Open HACS, select **⋮ → Custom repositories**, enter
   `https://github.com/timoverwoest/homewizard_display_card` with type **Dashboard** and select
   **Add**.
2. Open **HomeWizard Display Card**, select **Download** and reload your browser.

### Manual

1. Download `homewizard_display_card.js` from the
   [latest release](https://github.com/timoverwoest/homewizard_display_card/releases/latest)
   (it is in the source code) and put it in `/config/www/`.
2. Go to **Settings → Dashboards → ⋮ → Resources** and add
   `/local/homewizard_display_card.js?v=0.1.0` as a **JavaScript module**.
3. Reload your browser. Raise `?v=` with every new version.

## Configuration

Add the card from the card picker (search for "HomeWizard"), or in YAML:

```yaml
type: custom:homewizard-display-card
```

That is all if your [Energy settings](https://my.home-assistant.io/redirect/config_energy/) are
set up. Every value can also come from an entity of your own; fields you leave empty are filled in
from the Energy settings.

| Option | Default | Description |
|--------|---------|-------------|
| `grid_power` | Energy settings | Power sensor of the grid connection: positive = taking from the grid, negative = returning. W or kW. |
| `grid_import` | Energy settings | Meter(s) for energy taken from the grid. One entity or a list, for example one per tariff. |
| `grid_export` | Energy settings | Meter(s) for energy returned to the grid. |
| `solar_energy` | Energy settings | Solar production meter(s). |
| `battery_soc` | Energy settings | Home battery state of charge (%). Several batteries in the Energy settings: their average. |
| `battery_power` | Energy settings | Home battery power. Only used to see when the battery delivers. |
| `battery_power_sign` | `discharge_positive` | Set to `charge_positive` if your `battery_power` sensor counts **charging** as positive, like the HomeWizard Plug-In Battery. Batteries from the Energy settings always follow Home Assistant's convention. |
| `water` | Energy settings | Water meter(s). |
| `water_flow` | Energy settings | Water flow sensor (L/min, m³/h and so on). |
| `water_display` | `auto` | `auto`: the flow while water runs, otherwise litres today. `volume` or `flow` always shows that one. |
| `use_energy_settings` | `true` | `false`: only use the entities you set yourself. |
| `goal_grid_import` | `25` | Daily goal in kWh for energy taken from the grid. |
| `goal_grid_export` | `25` | Daily goal in kWh for energy returned to the grid. |
| `goal_solar` | `25` | Daily goal in kWh for solar. |
| `goal_water` | `500` | Daily goal in litres. |
| `goal_water_flow` | `10` | Goal for the flow in L/min. |
| `color_grid` | `#a259ff` | Colour for taking from the grid. |
| `color_delivery` | `#86d03c` | Colour for delivery: returning, solar, a discharging battery. |
| `color_battery` | `#b9d2e0` | Colour of the battery ring when it does not deliver. |
| `color_water` | `#3d8ff5` | Colour for water. |
| `color_text` | `#ffffff` | Colour of the numbers. |
| `color_background` | `#05070b` | Background colour. |

Meters (`grid_import`, `grid_export`, `solar_energy`, `water`) can be total meters, the kind you
use in the Energy settings, or daily meters such as a utility meter that resets at midnight. The
card asks Home Assistant's statistics for today's change in both cases. An entity without
statistics is shown as it is.

### Example: own entities

```yaml
type: custom:homewizard-display-card
grid_power: sensor.grid_power
grid_import:
  - sensor.energy_import_tariff_1
  - sensor.energy_import_tariff_2
battery_soc: sensor.plug_in_battery_state_of_charge
battery_power: sensor.plug_in_battery_power
battery_power_sign: charge_positive
goal_grid_import: 15
goal_water: 300
```

## How "today" works

The card reads today's change of each meter from the recorder statistics, the same data the
Energy dashboard uses. The day starts at midnight in the time zone of Home Assistant. Statistics
are stored every 5 minutes; in between, the card adds what the meter counted since the last
statistic, so the numbers keep moving.

The HomeWizard Energy Display may start its day at a slightly different moment, so its numbers can
differ a little from the card's.

## Notes

* The layout is fixed to the Usage Overview screen in this version.
* If your Energy settings have no power sensor for the grid, the battery or the water flow, set
  `grid_power`, `battery_power` or `water_flow` yourself.
* Made with the HomeWizard integration in mind (P1 meter, water meter, Plug-In Battery), but any
  sensor with a supported unit works.

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

## Credits and disclaimer

Inspired by the HomeWizard Energy Display. HomeWizard and HomeWizard Energy are trademarks of
HomeWizard B.V. This is an independent community project; it is not affiliated with, endorsed by,
or sponsored by HomeWizard. The logo is an original design and not the HomeWizard logo.

Icons in the card: [Material Design Icons](https://pictogrammers.com/library/mdi/) by
Pictogrammers, Apache License 2.0.

## License

MIT, see [LICENSE](LICENSE).
