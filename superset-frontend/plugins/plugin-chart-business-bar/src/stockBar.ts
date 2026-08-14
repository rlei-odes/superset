/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { EchartsTimeseriesBarChartPlugin } from '@superset-ui/plugin-chart-echarts';

/**
 * This chart is a derivative of the stock Bar chart, so it borrows that plugin's
 * already-wired pieces — control panel, query builder, render component,
 * thumbnails — rather than duplicating them.
 *
 * Borrowing via an instance is deliberate. The obvious alternative, deep imports
 * such as `@superset-ui/plugin-chart-echarts/Timeseries/buildQuery`, resolves
 * under webpack but not under TypeScript: the `@superset-ui/plugin-chart-*`
 * wildcard in the root tsconfig captures the entire subpath, mapping it to a
 * directory that does not exist. Fixing that would mean editing core tsconfig
 * paths; borrowing from the exported plugin class needs no core change at all.
 *
 * `ChartPlugin` exposes `controlPanel`, `metadata`, `loadBuildQuery`,
 * `loadTransformProps` and `loadChart` as public fields, and stores them as
 * already-sanitized loaders, so they can be handed straight back to a
 * `ChartPlugin` constructor.
 *
 * Constructing the plugin does not register it; only `.configure().register()`
 * does. So this instance is inert.
 */
export const stockBarPlugin = new EchartsTimeseriesBarChartPlugin();
