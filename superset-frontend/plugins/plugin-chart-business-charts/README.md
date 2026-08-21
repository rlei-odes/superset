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

## @superset-ui/plugin-chart-business-charts

Chart types where each series carries a **business role** — Actual, Plan,
Forecast, Prior Year — that maps to a consistent visual treatment, independent of
colour-scheme cycling.

This follows the general convention of giving planned and actual figures distinct
visual semantics, rather than reproducing any published standard's exact spec.

Two chart types ship from this package:

| Chart                    | Key              | Based on               | Shapes it draws                  |
| ------------------------ | ---------------- | ---------------------- | -------------------------------- |
| **Business Bar Chart**   | `business_bar`   | stock Bar chart        | Bars only                        |
| **Business Mixed Chart** | `business_mixed` | stock Mixed Timeseries | Bars and lines, from two queries |

### Roles map to two treatments, one per shape

A role says the same thing in two vocabularies, so a metric drawn as both a bar
and a line reads as one statement:

| Role       | Bar fill | Line stroke | Says               |
| ---------- | -------- | ----------- | ------------------ |
| Actual     | Solid    | Solid       | This happened      |
| Plan       | Outline  | Dashed      | This is intended   |
| Forecast   | Hatched  | Dotted      | This is a guess    |
| Prior year | Solid    | Solid       | Reference, in grey |

Both are per-rule overridable, and independently: changing how a bar is filled
does not restyle the line. The Bar chart shows only the fill dropdown, since a
line treatment there would provably do nothing.

### Design

The plugins are deliberately thin. Rather than forking the ~1450-line Timeseries
transform or the ~1000-line Mixed one, each reuses `buildQuery`,
`transformProps` and the render component from
`@superset-ui/plugin-chart-echarts` — the Bar chart pinning `seriesType` to
`Bar` exactly as the stock Bar chart does, the Mixed chart overriding nothing,
since its two _Series type_ controls are the point. Role styling, series
ordering and chart chrome are layered on top of the finished ECharts option, and
`src/shared/` holds everything both charts use.

## Recommended data shapes

Style rules identify series by **metric**, by **dimension value**, or by regex.
That gives two supported data shapes; pick the one that matches your warehouse.

### Wide — one column per role

Roles are separate columns, so they become separate metrics. The most common
business-reporting shape.

| period | actual | plan | forecast |
| ------ | -----: | ---: | -------: |
| 2025   |   55.4 | 54.5 |          |
| 2026   |   42.9 | 60.3 |     15.8 |

Add one metric per column and key the rules on **metric**.

### Long / tidy — one row per role

A `scenario`-style column names the role. Preferred when the number of roles can
grow, and required for the scenario-timeline recipe below.

| period | role     | revenue |
| ------ | -------- | ------: |
| 2025   | Previous |    55.4 |
| 2026   | Actual   |    42.9 |

Use one metric, put the role column in **Dimensions**, and key the rules on
**dimension**.

> Series naming differs between these shapes. With a single metric and a groupby,
> Superset may name a series `Actual` or `Revenue, Actual` depending on the
> _Truncate metric_ setting. Dimension rules match both forms — see the comment
> in `src/shared/seriesStyle.ts`.

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
  in.** It is not "the year" — it is the _bar's identity_. The query appends
  ` FC` and ` Plan` to the year precisely so that one calendar year can occupy
  several bars, spread out along the axis instead of competing for one slot.
- **Dimensions (`role`) decides how each bar is _painted_.** It splits the data
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

If forecast is stored as the _remainder_ of the year (only the months not yet
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
YTD-through-N for _every_ role at once, so prior years become directly
comparable. No Jinja required.

One wrinkle: a full-year forecast bar built from `actual + remainder` collapses
onto the actual bar at any cutoff before the forecast starts. If the forecast bar
should ignore the cutoff, the filter has to be applied per-branch inside the SQL
(`{{ filter_values(...) }}`) rather than as a dataset-level filter.

### Try it

`examples/` ships both halves of the worked example:

| File                             | What it does                                                                                                                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `examples/seed_bike_data.py`     | Builds a bike-manufacturer dataset with real plan, forecast and prior-year figures, at month grain, in both wide and long form. The stock Superset examples have no such columns. |
| `examples/scenario-timeline.sql` | The `UNION ALL` above, annotated, ready to paste as a virtual dataset's SQL.                                                                                                      |
| `examples/z-chart.sql`           | The Z-chart table below, with the cumulative columns and their gaps computed in SQL. Ready to paste as a virtual dataset's SQL.                                                   |

## Ordering — what you can and cannot control

Three orders are decided in three different places. Only one is fully under your
control today.

| Order           | Decided by                            | How to control it                      |
| --------------- | ------------------------------------- | -------------------------------------- |
| X categories    | `pivot_table` sorts the index         | **Name labels so they sort correctly** |
| Stack order     | pivot column order (alphabetical)     | Name roles so they sort correctly      |
| Legend / series | _Sort series by_, default Total value | _Sort legend_ under Customize → Legend |

**X-Axis Sort By does nothing here.** The control is visible for string axes, but
`sortOperator` bails out whenever a groupby is present. Labels such as `2026`,
`2026 FC`, `2026 Plan`, `2027 Plan` already sort into the intended order
lexicographically.

**Order series as defined** imposes _metric_ order. With a single metric and a
groupby it has nothing to reorder, so it does not affect role order.

## Recipe: the Z chart (Business Mixed Chart)

The layout the mixed chart exists for: monthly figures as bars along the bottom,
their running totals as ascending lines. Three strokes that together trace a Z.

Query A carries the periodic figures, query B the cumulative ones:

| Control     | Query A          | Query B                  |
| ----------- | ---------------- | ------------------------ |
| Metrics     | `actual`, `plan` | `actual_ytd`, `plan_ytd` |
| Series type | Bar              | Line                     |
| Y-axis      | Primary          | Primary                  |

**Keep both queries on the primary axis.** The cumulative figures are an order
of magnitude larger, so the bars come out short — but one axis is what lets the
lines and the bars be read against each other, which is the point. Move query B
to the secondary axis only if the monthly detail matters more than the
comparison.

Then one style rule per role, keyed on **metric**.

### Shape the cumulative columns in SQL, not with the rolling window

This is the part that catches people out, so it is worth stating plainly.

Superset offers _Advanced Analytics → Rolling window → Cumulative sum_, and it
looks like exactly the right tool. It is not, for this chart. The
implementation calls `fillna(0)` before accumulating
(`superset/utils/pandas_postprocessing/cum.py`), so a month with no value
contributes zero **and keeps a value in the output**. Two visible consequences:

- a cumulative **forecast** lies flat on the floor for every month that already
  has actuals, instead of not being drawn at all;
- a cumulative **actual** flatlines into the future instead of stopping at the
  reporting month, printing a number that conveys nothing.

No chart setting repairs this, and it is worth knowing why the obvious one does
not: _Connect nulls_ governs precisely this behaviour, but by the time the
option reaches ECharts there are no nulls left to skip — only zeros. **The gaps
have to survive into the data.**

### The table the chart wants

One row per period, with the running totals already computed and `NULL`
wherever the series should not be drawn:

| month_start | actual | plan | forecast | actual_ytd | plan_ytd | expected_ytd |
| ----------- | -----: | ---: | -------: | ---------: | -------: | -----------: |
| 2026-06     |   7.2M | 7.1M |          |      33.6M |    32.1M |              |
| 2026-07     |   6.5M | 6.5M |          |      40.1M |    38.6M |              |
| 2026-08     |   2.8M | 5.3M |          |  **42.9M** |    44.0M |    **42.9M** |
| 2026-09     |        | 4.8M |     4.6M |            |    48.7M |        47.4M |
| 2026-12     |        | 4.0M |     3.8M |            |    60.3M |        58.7M |

Reading the three cumulative columns as the three lines:

- **`actual_ytd`** — rises to the reporting month, then `NULL`. The solid line
  stops where the actuals stop.
- **`expected_ytd`** — `NULL` until the reporting month, then rises. Actual
  where actual exists, forecast beyond it.
- **`plan_ytd`** — the whole year, unbroken.

Note the **deliberate one-month overlap at 2026-08**: both `actual_ytd` and
`expected_ytd` carry 42.9M there, so the dotted line begins exactly where the
solid one ends instead of jumping a gap.

`examples/z-chart.sql` is this table as a virtual dataset, with the reporting
month derived from the data — `MAX(month_start) WHERE actual IS NOT NULL` —
rather than hardcoded, so the chart follows along as months close.

### One rule or two per role

Both work; they differ in labelling, not in data.

- **Distinct labels** (`Actual` / `Actual YTD`) — one rule each, six rules for
  three roles. The legend reads cleanly with no query identifiers.
- **Shared labels** (both `Actual`) — one rule covers the bar and the line
  together, three rules for three roles. Needs _Show query identifiers_ on, or
  the two series collapse into one legend entry.

**Show query identifiers is safe to tick.** It appends `" (Query A)"` to the
metric part of a series name, which rules strip before matching.

**Ordering is per query.** Each query's series are ordered against its own
metric list, so query B's lines cannot be shuffled into query A's bar slots even
when both queries name the same metric.

## Controls

| Section                | Control                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| Business chart styling | Series style rules; Order series as defined                                                                  |
| Chart chrome           | Gridlines; Axis ticks; Value/Category axis labels; Axis line colour and width; Hide overlapping value labels |

Both chart types get the same section, from one builder. Everything else is
inherited from the stock chart each is based on.

**Defaults.** A new chart starts sparse — gridlines, axis ticks and value-axis
labels off — because the bar labels already carry the numbers. Adding a style
rule seeds it with its role's colour, greyscale by default: muted grey for Prior
Year, foreground ink for the rest. Both come from theme tokens, so they follow
light and dark mode.

That colour is a _starting value_, not a lock: change it in the picker, or clear
it to hand the series back to the colour scheme. Colour is left free by design —
role is carried by the fill treatment, so the palette stays available for
emphasis.

## Feature list

[`FEATURES.md`](FEATURES.md) tables what this add-in contributes per chart type,
separating behaviour that is genuinely new from ECharts capability that stock
Superset hardcodes and this plugin merely exposes — and, for each, how far stock
gets without it.

## Registration

Both charts are registered in `src/visualizations/presets/MainPreset.ts`, under
the keys `business_bar` and `business_mixed`. That plus one workspace dependency
in `superset-frontend/package.json` is the whole core footprint, which is what
keeps extracting this package into its own repo viable.
