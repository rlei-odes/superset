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

### Status

Scaffolding. The chart currently renders identically to the stock Bar chart; the
role-styling logic is not implemented yet.

### Design

The plugin is deliberately thin. Rather than forking the ~1450-line Timeseries
transform, it reuses `buildQuery`, `transformProps` and the `EchartsTimeseries`
render component from `@superset-ui/plugin-chart-echarts`, pinning `seriesType`
to `Bar` exactly as the stock Bar chart does. Role styling is layered on top.

### Registration

Registered in `src/visualizations/presets/MainPreset.ts` under the key
`business_bar`.
