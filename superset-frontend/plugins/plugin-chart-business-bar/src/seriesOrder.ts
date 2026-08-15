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
import {
  ensureIsArray,
  getMetricLabel,
  QueryFormMetric,
} from '@superset-ui/core';
import { matchesRuleKey } from './seriesStyle';

/**
 * Restores the order the metrics were defined in.
 *
 * Superset always sorts series, and cannot be told not to. `sort_series_type`
 * defaults to `'sum'` (`Timeseries/constants.ts`), so out of the box series are
 * ordered by total value; clearing the control does not disable sorting but
 * falls through to `sortAndFilterSeries`'s `default:` branch, which sorts by
 * name. There is no "as defined" among `SORT_SERIES_CHOICES`.
 *
 * The reason is structural rather than deliberate: sorting happens inside
 * `extractSeries` / `sortAndFilterSeries` (`utils/series.ts`), which receives
 * the query result rows and the sort options and nothing else. The metric list
 * lives in form data and never reaches that layer, so the order the user
 * defined simply is not available where the sorting is done.
 *
 * For a business chart that ordering matters: Actual / Plan / Forecast is a
 * semantic sequence that must not reshuffle when the numbers move, which is
 * exactly what sorting by total value does.
 */

/** The metric labels, in the order the Metrics control lists them. */
export function getMetricOrder(
  metrics: QueryFormMetric | QueryFormMetric[] | undefined,
): string[] {
  return ensureIsArray(metrics).map(getMetricLabel).filter(Boolean);
}

/**
 * Which metric a series belongs to, or -1.
 *
 * Matching goes through `matchesRuleKey` so it inherits the verbose-name
 * handling: a series carries the dataset's `verbose_name` when a groupby is
 * applied and the raw metric label when not, and both have to resolve to the
 * same metric.
 */
function metricRank(
  seriesName: string,
  metricLabels: string[],
  verboseMap: Record<string, string>,
): number {
  return metricLabels.findIndex(label =>
    matchesRuleKey(seriesName, { kind: 'metric', metric: label }, verboseMap),
  );
}

const nameOf = (entry: unknown): string => {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') {
    const { name } = entry as { name?: unknown };
    if (typeof name === 'string') return name;
  }
  return '';
};

/**
 * Reorders only the entries that belong to a metric, leaving everything else
 * exactly where it was.
 *
 * The in-place approach matters. The series array also holds forecast bands,
 * time-shift series and annotation layers, and `reorderForecastSeries` has
 * already arranged the bands to render beneath the observations. Sorting the
 * whole array — even stably, with unmatched entries pushed to one end — would
 * undo that. Writing the sorted metric series back into the slots they already
 * occupied cannot disturb anything else.
 *
 * Within one metric the original relative order is preserved, so the groupby
 * values keep whatever order the query produced; only the metric grouping is
 * imposed.
 */
export function orderByMetrics<T>(
  entries: T[],
  metricLabels: string[],
  verboseMap: Record<string, string> = {},
): T[] {
  if (!metricLabels.length || entries.length < 2) {
    return entries;
  }

  const slots: number[] = [];
  const matched: { entry: T; rank: number; position: number }[] = [];

  entries.forEach((entry, position) => {
    const rank = metricRank(nameOf(entry), metricLabels, verboseMap);
    if (rank >= 0) {
      slots.push(position);
      matched.push({ entry, rank, position });
    }
  });

  if (matched.length < 2) {
    return entries;
  }

  // Ties fall back to the original position, keeping the sort stable across
  // engines and preserving the groupby order within a metric.
  matched.sort((a, b) => a.rank - b.rank || a.position - b.position);

  const next = [...entries];
  slots.forEach((slot, index) => {
    next[slot] = matched[index].entry;
  });
  return next;
}

/**
 * Whether metric order should be restored. Defaults to on: the semantic
 * sequence is the point of this chart type, and a value-sorted one is what the
 * user is trying to get away from.
 *
 * Both casings are read because `ChartProps` camelCases `formData` and keeps
 * the original only on `rawFormData`.
 */
export function readOrderByMetrics(chartProps: {
  formData?: Record<string, unknown>;
  rawFormData?: Record<string, unknown>;
}): boolean {
  const value =
    chartProps.formData?.seriesOrderAsDefined ??
    chartProps.rawFormData?.series_order_as_defined;
  return value !== false;
}
