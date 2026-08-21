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

# What this add-in does

One table per chart type. Each feature is classed as:

- **Added** — behaviour stock Superset cannot produce at all, by any
  combination of controls, JSON escape hatches or dashboard settings.
- **Surfaced** — a capability ECharts always had and stock Superset hardcodes,
  which this plugin exposes as a control. Reachable without the plugin, but only
  by hand-writing ECharts JSON.

The "without the plugin" column is the evidence: it states exactly how far stock
gets, so the classification can be checked rather than taken on trust.

## Bar chart

| Feature                                                                                                             | Added or surfaced | Without the plugin                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Role-based fill treatment** — a series is solid, outline or hatched according to its business role                | **Added**         | Not possible. Needs per-series `itemStyle`, and the stock JSON editor merges arrays by _replacement_ — supplying `series` discards the computed series, data included                    |
| **Series style rules** — assign a role by metric, by dimension value, or by regex, surviving regrouping             | **Added**         | No equivalent concept                                                                                                                                                                    |
| **Role colours at chart level** — seeded from theme tokens, overridable and clearable per rule                      | **Added**         | Exact colours are possible, but only as dashboard JSON metadata (`label_colors`), so they belong to the dashboard rather than the chart, and cover colour only — never fill              |
| **Order series as defined** — semantic order (Actual, Plan, Forecast) that does not reshuffle when the numbers move | **Added**         | Not possible. _Sort series by_ offers only Category name / Total value / Min / Max / Avg; there is no "as defined", and clearing the control sorts by name rather than disabling sorting |
| **Gridlines** on/off                                                                                                | Surfaced          | `echart_options`: `yAxis.splitLine.show`                                                                                                                                                 |
| **Axis ticks** on/off                                                                                               | Surfaced          | `echart_options`: `axisTick.show` on each axis                                                                                                                                           |
| **Value axis labels** on/off                                                                                        | Surfaced          | `echart_options`: `yAxis.axisLabel.show`                                                                                                                                                 |
| **Category axis labels** on/off                                                                                     | Surfaced          | `echart_options`: `xAxis.axisLabel.show`                                                                                                                                                 |
| **Axis line colour**                                                                                                | Surfaced          | `echart_options`: `axisLine.lineStyle.color`                                                                                                                                             |
| **Axis line width**                                                                                                 | Surfaced          | `echart_options`: `axisLine.lineStyle.width`                                                                                                                                             |
| **Sparse defaults** — a new chart arrives with gridlines, ticks and value-axis labels off, and a 4px grey baseline  | Surfaced          | Every one of the above, hand-written, on every new chart                                                                                                                                 |

### Two details the table flattens

**The surfaced controls are orientation-aware; the JSON is not.** The transform
swaps `xAxis` and `yAxis` for a horizontal bar chart, so this plugin's controls
target the _value_ and _category_ axis rather than x and y. Hand-written JSON
keyed on `yAxis` silently styles the wrong axis the moment the bars are flipped.

**They are also subtractive.** A ticked checkbox writes nothing, so the stock
behaviour — including upstream's own hiding of gridlines and ticks on a small
chart — is preserved. JSON that forces `show: true` overrides that.

## Mixed chart

Standalone rather than a delta on the Bar table: this chart type inherits every
row above and adds its own, so the full picture is here.

### Inherited from the Bar chart

Identical behaviour, same code — the two chart types share one section builder
and one styling pass.

| Feature                                                           | Added or surfaced |
| ----------------------------------------------------------------- | ----------------- |
| Role-based **fill** treatment (solid / outline / hatched) on bars | **Added**         |
| Series style rules — by metric, by dimension value, or by regex   | **Added**         |
| Role colours at chart level, overridable and clearable per rule   | **Added**         |
| Order series as defined                                           | **Added**         |
| Gridlines / Axis ticks / Value and Category axis labels on-off    | Surfaced          |
| Axis line colour and width                                        | Surfaced          |
| Sparse defaults                                                   | Surfaced          |

### Added by the Mixed chart

| Feature                                                                                                     | Added or surfaced | Without the plugin                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Role-based line treatment** — a line is stroked solid, dashed or dotted by the same role that fills a bar | **Added**         | Not possible per series. `echart_options` can set `lineStyle` only by supplying `series`, which the JSON editor merges by _replacement_ — so the computed series, data included, is discarded              |
| **One role, both shapes** — a metric drawn as a periodic bar and as a cumulative line takes a single rule   | **Added**         | No equivalent concept. The two series are unrelated as far as stock is concerned, and nothing ties a treatment to a business meaning                                                                       |
| **Treatments are independent axes** — overriding a bar's fill leaves the line's stroke on its role default  | **Added**         | No equivalent concept                                                                                                                                                                                      |
| **Shape-aware styling** — a fill treatment is never applied to a stroked series                             | **Added**         | Not applicable, since no stock mechanism assigns treatments at all. Matters because an `outline` fill on a line sets `color: 'transparent'` and erases it                                                  |
| **Per-query series ordering** — each query ordered against its own metric list, partitioned on `queryIndex` | **Added**         | The Bar chart's gap, doubled: _Sort series by_ exists per query but still offers no "as defined", and nothing prevents one query's series being reordered into the other's slots                           |
| **Rules survive _Show query identifiers_** — the `" (Query A)"` suffix is stripped before matching          | **Added**         | No equivalent concept. Ticking that box would otherwise turn every rule into a silent no-op                                                                                                                |
| **Legend follows the reordered series**                                                                     | **Added**         | Not reachable. `legendData` is built inside the transform from the pre-reorder series array                                                                                                                |
| **Chrome on both value axes** — the secondary axis answers the same controls                                | Surfaced          | `echart_options`: the same keys, written twice, once per entry of the `yAxis` array                                                                                                                        |
| **Hide overlapping value labels**                                                                           | Surfaced          | `echart_options`: `labelLayout.hideOverlap`, but only by supplying `series`, which replaces the computed array. Upstream sets `hideOverlap` on _axis_ labels in both transforms and never on series labels |

### What the fill/stroke pairing buys

A Z chart shows a role twice — once as a periodic bar, once as its running
total. Splitting the treatment into a fill axis and a stroke axis is what lets
one rule dress both without either shape borrowing the other's vocabulary: an
`outline` fill applied to a line would set `color: 'transparent'` and erase it.

### The limits of "Hide overlapping value labels"

The control is a mitigation, not a fix, and the reasons are in ECharts rather
than here. Both were read out of `echarts/lib/label/`, not inferred.

**It only ever compares labels with labels.** `hideOverlap`
(`labelLayoutHelper.js`) tests each candidate against the labels already kept
and nothing else — the series geometry never enters the calculation. So a label
sitting squarely on top of a bar, or across a line, is not a collision as far as
ECharts is concerned, and nothing hides it. Improving that would have to happen
upstream.

**Which label wins is not steerable from here, and the default is backwards for
this chart.** The sort is by `priority` descending, and `priority` defaults
(`LabelManager.js`) to the **area of the host graphic**:

```js
priority: hostRect ? hostRect.width * hostRect.height : 0,
```

A bar's host rect is the bar — large. A line point's host rect is its symbol —
small, or zero when the symbol is hidden. So on a collision the **bar label
survives and the line label is dropped**, which is the wrong way round for a Z
chart, where the cumulative line's final value is usually the number that
matters most.

`priority` is internal: `LabelLayoutOption` exposes `hideOverlap`,
`moveOverlap`, `draggable`, offsets and text metrics, but not `priority`, so it
cannot be raised for the line series from a plugin. The exposed lever that might
help instead is `moveOverlap: 'shiftY'`, which ECharts applies _before_
`hideOverlap` — displacing a label rather than dropping it. Untried.

## Evidence

`.local/create_stock_comparison.py` builds the control case: chart 122 cloned as
a plain `echarts_timeseries_bar`, pushed as close as stock allows, with both
charts side by side on one dashboard so that dashboard-level `label_colors`
applies to each.

**What stock reaches.** The chrome, in full: no gridlines, no ticks, no
value-axis labels, and the same 4px grey baseline. Every key used is accepted by
Superset's own schema for that editor (`axisLine`, `axisTick`, `axisLabel`,
`splitLine`, with `lineStyle` taking colour and width), so it is applied rather
than silently dropped. Series colours match exactly, via `label_colors`.

**What it cannot reach.** Any distinction between Actual, Forecast and Plan
beyond colour. All three render as solid bars in the same ink, because the fill
treatment — the whole point of the chart type — has no stock equivalent. Give
the roles a shared colour, as the business look does, and stock makes them
indistinguishable.

The classifications above are read from the code. The side-by-side is there to
be looked at, not taken on trust: what has been verified here is that the JSON
is schema-valid and both charts are wired to the dashboard.
