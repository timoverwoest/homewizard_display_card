# Changelog

## Unreleased

* **Charts like the HomeWizard app.** A second view with charts of water, gas, the main
  connection, solar, electricity use, self-sufficiency, standby use, the home battery and sensors
  of your own, per day, week, month or year, with ‹ › to go back in time and the value under the
  pointer.
* **Switch button on the card** to toggle between the display and the charts. Options `view`,
  `show_view_switch`, `charts`, `chart_entities` and `period`.
* **Same size as the display.** Each chart fills the frame of the display; scroll from chart to
  chart.
* **README** links to HomeWizard and the HomeWizard Energy Display.

## v0.3.0 - 2026-11-22

* **Background suggestions.** The editor suggests light `#f4f5f7` by day and dark grey `#1c1c1c`
  at night, next to the black of the display (still the default). Your own hex colour still works.
* **Readable on light backgrounds.** On a light background the card uses darker accent colours
  for the grid, delivery, battery, water and gas, unless you set those colours yourself.

## v0.2.0 - 2026-11-22

* **Day and night background.** New option `color_background_dark`: the background while Home
  Assistant shows a dark theme. `color_background` is the background by day. Empty keeps one
  background for both.
* **Automatic text colour.** Without `color_text`, the numbers are white on a dark background and
  near-black on a light one, so a light background stays readable.

## v0.1.1 - 2026-11-22

* **Editor shows the defaults.** The switch "Use the Energy settings for empty fields" is on and
  the sign of the battery power is filled in, as the card already used them.
* **No clear button** on what a circle or row shows and on its mode: each position always shows
  something (or "none").

## v0.1.0 - 2026-11-22

* **First version.** The Usage Overview screen of the HomeWizard Energy Display as a dashboard
  card: three circles and three rows.
* **Set up like the display.** Each circle and row shows a source (main connection, solar panels,
  home battery, water, gas, electricity use, self-sufficiency, a socket or kWh meter, or any
  sensor) in the mode now, today, auto or costs, with maximum goals. The default layout is the
  display's own Usage Overview.
* **Energy settings.** Grid (also several tariffs), solar, home batteries, water, gas and their
  cost sensors are found automatically; any value can come from an entity of your own instead.
* **Today from the statistics.** Today's values come from Home Assistant's statistics, like the
  Energy dashboard, and keep counting live between the 5-minute statistics. Daily meters work too.
* **Looks like the display.** Taking energy is purple, delivering is green; rings fill clockwise
  or counterclockwise and bars from the left or from the right. Small grey decimals in the rows.
* **Visual editor** in English and Dutch, set up like the HomeWizard app, with the background
  colour as its own field.
