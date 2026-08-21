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
import { QueryFormMetric } from '@superset-ui/core';
import { MixedTimeseriesTransformProps } from '@superset-ui/plugin-chart-echarts';
import { applyChartChrome, readChromeOptions } from '../shared/chrome';
import {
  getMetricOrder,
  orderByQueryMetrics,
  readOrderByMetrics,
} from '../shared/seriesOrder';
import { applySeriesStyles, readSeriesStyleRules } from '../shared/seriesStyle';

/**
 * Both derived from the transform rather than named directly: the echarts
 * package's index re-exports `../types`, not `MixedTimeseries/types`, so
 * `EchartsMixedTimeseriesProps` has no public name to import — hence the local
 * alias. Deriving beats the deep import
 * `@superset-ui/plugin-chart-echarts/MixedTimeseries/types`,
 * which resolves under webpack but not under TypeScript — the
 * `@superset-ui/plugin-chart-*` wildcard in the root tsconfig swallows the
 * whole subpath. Same reasoning as `stockMixed.ts`.
 */
export type BusinessMixedChartProps = Parameters<
  typeof MixedTimeseriesTransformProps
>[0];
type MixedEchartOptions = ReturnType<
  typeof MixedTimeseriesTransformProps
>['echartOptions'];

/** A finished series, as much of it as this file needs to see. */
interface NamedSeries {
  name?: unknown;
  queryIndex?: number;
}

/**
 * Rewrites `entries` so that the members it shares with `order` appear in
 * `order`'s sequence, leaving everything else in place.
 *
 * Used to drag the legend along behind a reordered series array. The Mixed
 * transform does build `legendData` *from* the series — unlike the Timeseries
 * transform, which builds it from `rawSeries` — but it does so before this
 * plugin gets the option object, so the legend still holds a snapshot of the
 * old order.
 *
 * Slot-preserving rather than a sort, for the same reason
 * `orderByMetrics` is: `legendData` also carries annotation-layer labels,
 * appended after the series names. They belong to neither query and have no
 * place in a metric ordering, so they keep the positions they had.
 */
function reorderLike(entries: string[], order: string[]): string[] {
  const rank = new Map(order.map((name, index) => [name, index]));

  const slots: number[] = [];
  entries.forEach((entry, position) => {
    if (rank.has(entry)) slots.push(position);
  });
  if (slots.length < 2) return entries;

  const ordered = slots
    .map(slot => entries[slot])
    .sort((a, b) => (rank.get(a) as number) - (rank.get(b) as number));

  const next = [...entries];
  slots.forEach((slot, index) => {
    next[slot] = ordered[index];
  });
  return next;
}

/**
 * Restores each query's metric order across the series array and the legend.
 *
 * Two metric lists, ordered independently — see `orderByQueryMetrics` for why
 * they cannot be concatenated into one.
 */
function orderSeries(
  chartProps: BusinessMixedChartProps,
  echartOptions: MixedEchartOptions,
): MixedEchartOptions {
  if (!readOrderByMetrics(chartProps)) {
    return echartOptions;
  }

  const {
    metrics,
    metricsB,
    stack,
    stackB,
    onlyTotal,
    onlyTotalB,
    showValue,
    showValueB,
  } = chartProps.formData as Record<string, unknown>;

  /*
   * Stacked total labels are bound to series *positions*, not to series:
   * `extractShowValueIndexes` records which index carries each point's total
   * and the label formatter compares it against ECharts' runtime
   * `params.seriesIndex`, so moving a series detaches its label. Diagnosed on
   * the Bar chart; see the long note in `Bar/transformProps.ts`.
   *
   * The Mixed transform computes `showValueIndexesA` and `showValueIndexesB`
   * separately, so the hazard is per query and so is the guard — a stacked
   * total-labelled query B does not cost query A its ordering. Suppressing a
   * query's ordering is expressed as giving it no metric list, which is what
   * `orderByQueryMetrics` already treats as "leave this partition alone".
   */
  const suppressed = (
    stackFlag: unknown,
    onlyTotalFlag: unknown,
    showValueFlag: unknown,
  ) => Boolean(stackFlag && onlyTotalFlag && showValueFlag);

  const metricLabelsByQuery = [
    suppressed(stack, onlyTotal, showValue)
      ? []
      : getMetricOrder(metrics as QueryFormMetric[]),
    suppressed(stackB, onlyTotalB, showValueB)
      ? []
      : getMetricOrder(metricsB as QueryFormMetric[]),
  ];

  const verboseMap = chartProps.datasource?.verboseMap;
  const { series, legend } = echartOptions as {
    series?: unknown;
    legend?: { data?: unknown };
  };
  if (!Array.isArray(series)) {
    return echartOptions;
  }

  const ordered = orderByQueryMetrics(
    series as NamedSeries[],
    metricLabelsByQuery,
    verboseMap,
  );
  if (ordered === series) {
    return echartOptions;
  }

  const orderedNames = ordered
    .map(entry => entry?.name)
    .filter((name): name is string => typeof name === 'string');

  return {
    ...echartOptions,
    series: ordered,
    ...(legend && Array.isArray(legend.data)
      ? {
          legend: {
            ...legend,
            data: reorderLike(legend.data as string[], orderedNames),
          },
        }
      : {}),
  } as MixedEchartOptions;
}

/**
 * Applies role styling to the finished series array.
 *
 * No `colorByPrimaryAxis` guard, unlike the Bar chart: that control belongs to
 * the stock Bar panel, and the Mixed transform never passes the flag to
 * `transformSeries`, so `itemStyle` is always present to style.
 */
function styleSeries(
  chartProps: BusinessMixedChartProps,
  echartOptions: MixedEchartOptions,
): MixedEchartOptions {
  const rules = readSeriesStyleRules(chartProps);
  if (!rules.length) {
    return echartOptions;
  }

  const { series } = echartOptions;
  if (!Array.isArray(series)) {
    return echartOptions;
  }

  return {
    ...echartOptions,
    series: applySeriesStyles(
      series,
      rules,
      chartProps.theme,
      chartProps.datasource?.verboseMap,
    ),
  } as MixedEchartOptions;
}

/**
 * Wraps the shared Mixed Timeseries transform rather than forking it, the same
 * way `Bar/transformProps.ts` wraps the Timeseries one.
 *
 * Nothing is overridden on the way in. The Bar chart pins
 * `seriesType: Bar` because it *is* a bar chart; here the two `Series type`
 * controls are the whole point — bars for the periodic figures, lines for the
 * cumulative ones — so the chart type has no business choosing for the user.
 */
export default function transformProps(chartProps: BusinessMixedChartProps) {
  const transformed = MixedTimeseriesTransformProps(chartProps);

  return {
    ...transformed,
    echartOptions: applyChartChrome(
      // Order first, then style: styling matches on series names and does not
      // care about position, so the cheaper reorder happens on the smaller
      // untouched array.
      styleSeries(
        chartProps,
        orderSeries(chartProps, transformed.echartOptions),
      ),
      readChromeOptions(chartProps),
      // The Mixed chart has no orientation control, so the category axis is
      // always the x axis.
      false,
    ),
  };
}
