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
import { EchartsMixedTimeseriesChartPlugin } from '@superset-ui/plugin-chart-echarts';

/**
 * This chart is a derivative of the stock Mixed chart, so it borrows that
 * plugin's already-wired pieces — control panel, query builder, render
 * component, thumbnails — rather than duplicating them. Same reasoning as
 * `Bar/stockBar.ts`; see the note there for why borrowing goes through an
 * instance rather than a deep import.
 *
 * The Mixed chart's `buildQuery` matters more than the Bar chart's did: it
 * submits *two* query objects, and its metadata declares `queryObjectCount: 2`.
 * Both have to come across intact or the second query never runs.
 *
 * Constructing the plugin does not register it; only `.configure().register()`
 * does. So this instance is inert.
 */
export const stockMixedPlugin = new EchartsMixedTimeseriesChartPlugin();
