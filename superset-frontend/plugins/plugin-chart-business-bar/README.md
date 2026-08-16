<!--
Licensed to the Apache Software Foundation (ASF) under one
or more contributor license agreements.  See the NOTICE file
distributed with this work for additional information
regarding copyright ownership.  The ASF licenses this file
to you under the Apache License, Version 2.0 (the
"License"); you may not use this file except in compliance
with the License.  You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing,
software distributed under the License is distributed on an
"AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, either express or implied.  See the License for the
specific language governing permissions and limitations
under the License.
-->

## @superset-ui/plugin-chart-business-bar

A bar chart where each series carries a **business role** — Actual, Plan,
Forecast, Prior Year — that maps to a consistent visual treatment (solid fill,
outline, hatched) independent of colour-scheme cycling.

This follows the general convention of giving planned and actual figures distinct
visual semantics, rather than reproducing any published standard's exact spec.

### Design

The plugin is deliberately thin. Rather than forking the ~1450-line Timeseries
transform, it reuses `buildQuery`, `transformProps` and the `EchartsTimeseries`
render component from `@superset-ui/plugin-chart-echarts`, pinning `seriesType`
to `Bar` exactly as the stock Bar chart does. Role styling, series ordering and
chart chrome are layered on top of the finished ECharts option.

## Recommended data shapes

Style rules identify series by **metric**, by **dimension value**, or by regex.
That gives two supported data shapes; pick the one that matches your warehouse.

### Wide — one column per role

Roles are separate columns, so they become separate metrics. The most common
business-reporting shape.

| period | actual | plan | forecast |
| ------ | -----: | ---: | -------: |
| 2025   | 55.4   | 54.5 |          |
| 2026   | 42.9   | 60.3 | 15.8     |

Add one metric per column and key the rules on **metric**.

### Long / tidy — one row per role

A `scenario`-style column names the role. Preferred when the number of roles can
grow, and required for the scenario-timeline recipe below.

| period | role     | revenue |
| ------ | -------- | ------: |
| 2025   | Previous | 55.4    |
| 2026   | Actual   | 42.9    |

Use one metric, put the role column in **Dimensions**, and key the rules on
**dimension**.

> Series naming differs between these shapes. With a single metric and a groupby,
> Superset may name a series `Actual` or `Revenue, Actual` depending on the
> *Truncate metric* setting. Dimension rules match both forms — see the comment
> in `src/seriesStyle.ts`.

## Recipe: the scenario timeline

The layout this chart type exists for — prior years, the current year to date, a
full-year forecast, and plan for the current and following year, as one bar each:

```
2023   2024   2025   2026   2026 FC   2026 Plan   2027 Plan
grey   grey   grey   dark   hatched   outline     outline
```

### How it works, in plain terms

Two controls do the work, and they are doing different jobs:

- **X-Axis (`period`) decides how many bars there are and what order they sit
  in.** It is not "the year" — it is the *bar's identity*. The query appends
  ` FC` and ` Plan` to the year precisely so that one calendar year can occupy
  several bars, spread out along the axis instead of competing for one slot.
- **Dimensions (`role`) decides how each bar is *painted*.** It splits the data
  into series — Actual, Plan, Forecast, Previous — and the style rules key on
  those names. Role is what carries the styling; it has no say in position.

So the label separates, and the role decorates. A period like `2026 Plan` gets
its own bar because of its label, and gets an outline because its role is Plan.

Everything else follows from that split. Each bar has a value in exactly one
role, which is why **Stack** never actually adds anything up, and why every bar
comes out full width and centred.

### Shape the data so every period has exactly one role

Emit long/tidy rows where the **period label already encodes the scenario**:

| period      | role     |
| ----------- | -------- |
| 2023–2025   | Previous |
| 2026        | Actual   |
| `2026 FC`   | Forecast |
| `2026 Plan` | Plan     |
| `2027 Plan` | Plan     |

If forecast is stored as the *remainder* of the year (only the months not yet
closed), the full-height forecast bar is `actual + forecast remainder`, so those
source rows must be emitted **twice** — once as `2026`, once as `2026 FC`. That
needs a `UNION ALL`, not a `CASE`. Alternatively, store forecast as a full-year
figure; the chart only cares about the result.

### Turn Stack on — it is layout, not arithmetic

With exactly one non-null role per period, **nothing is ever summed**. Stacking
only makes ECharts assign every series the same bar slot, giving one full-width,
centred bar per period.

Leaving Stack off produces grouped bars: N roles means N slots per period, so a
lone bar renders at 1/N width and off-centre. That is inherent to grouped bars.

Do **not** use a real stack to express "actual plus forecast on top of it". A
stack claims part-of-a-whole, so an actual that exceeds its forecast has no
honest rendering — the increment is negative and draws downward. Give forecast
its own bar and compare the two full-height bars instead.

### Year-to-date comparisons come free

With monthly rows and an additive metric, a filter of `month <= N` yields
YTD-through-N for *every* role at once, so prior years become directly
comparable. No Jinja required.

One wrinkle: a full-year forecast bar built from `actual + remainder` collapses
onto the actual bar at any cutoff before the forecast starts. If the forecast bar
should ignore the cutoff, the filter has to be applied per-branch inside the SQL
(`{{ filter_values(...) }}`) rather than as a dataset-level filter.

### Try it

`examples/` ships both halves of the worked example:

| File                            | What it does                                        |
| ------------------------------- | --------------------------------------------------- |
| `examples/seed_bike_data.py`    | Builds a bike-manufacturer dataset with real plan, forecast and prior-year figures, at month grain, in both wide and long form. The stock Superset examples have no such columns. |
| `examples/scenario-timeline.sql` | The `UNION ALL` above, annotated, ready to paste as a virtual dataset's SQL. |

## Ordering — what you can and cannot control

Three orders are decided in three different places. Only one is fully under your
control today.

| Order              | Decided by                       | How to control it                     |
| ------------------ | -------------------------------- | ------------------------------------- |
| X categories       | `pivot_table` sorts the index    | **Name labels so they sort correctly** |
| Stack order        | pivot column order (alphabetical) | Name roles so they sort correctly     |
| Legend / series    | *Sort series by*, default Total value | *Sort legend* under Customize → Legend |

**X-Axis Sort By does nothing here.** The control is visible for string axes, but
`sortOperator` bails out whenever a groupby is present. Labels such as `2026`,
`2026 FC`, `2026 Plan`, `2027 Plan` already sort into the intended order
lexicographically.

**Order series as defined** imposes *metric* order. With a single metric and a
groupby it has nothing to reorder, so it does not affect role order.

## Controls

| Section              | Control                                          |
| -------------------- | ------------------------------------------------ |
| Business chart styling | Series style rules; Order series as defined     |
| Chart chrome         | Gridlines; Axis ticks; Value/Category axis labels; Axis line colour and width |

Everything else is inherited from the stock Bar chart.

**Defaults.** A new chart starts sparse — gridlines, axis ticks and value-axis
labels off — because the bar labels already carry the numbers. Adding a style
rule seeds it with its role's colour, greyscale by default: muted grey for Prior
Year, foreground ink for the rest. Both come from theme tokens, so they follow
light and dark mode.

That colour is a *starting value*, not a lock: change it in the picker, or clear
it to hand the series back to the colour scheme. Colour is left free by design —
role is carried by the fill treatment, so the palette stays available for
emphasis.

## Registration

Registered in `src/visualizations/presets/MainPreset.ts` under the key
`business_bar`.
