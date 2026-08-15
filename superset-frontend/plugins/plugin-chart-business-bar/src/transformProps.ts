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
  EchartsTimeseriesChartProps,
  EchartsTimeseriesSeriesType,
  TimeseriesTransformProps,
} from '@superset-ui/plugin-chart-echarts';
import { applyChartChrome, readChromeOptions } from './chrome';
import {
  getMetricOrder,
  orderByMetrics,
  readOrderByMetrics,
} from './seriesOrder';
import { applySeriesStyles, readSeriesStyleRules } from './seriesStyle';

/**
 * Restores the metric order across the series array and the legend.
 *
 * The legend has to be done separately: `legend.data` is built from `rawSeries`
 * further up the transform (`Timeseries/transformProps.ts`, `sortedLegendData`)
 * rather than derived from the finished series array, so reordering the series
 * alone would leave the legend in the old order.
 */
function orderSeries(
  chartProps: EchartsTimeseriesChartProps,
  echartOptions: ReturnType<typeof TimeseriesTransformProps>['echartOptions'],
) {
  if (!readOrderByMetrics(chartProps)) {
    return echartOptions;
  }

  /*
   * Stacked total labels are bound to series *positions*, not to series.
   *
   * `extractShowValueIndexes` (`utils/series.ts`) records which series index
   * should carry the total for each data point, and the label formatter checks
   * `params.seriesIndex === showValueIndexes[dataIndex]` — where `seriesIndex`
   * is ECharts' runtime position but `showValueIndexes` was computed before
   * this reorder. Moving a series therefore detaches the label: it renders on
   * whichever series now sits at the recorded index, mid-stack, or not at all.
   * Seen as missing labels and a total printed at the foot of a bar.
   *
   * That path is only reached with `stack && onlyTotal && showValue`, so the
   * reorder is skipped just for that combination rather than everywhere.
   * Correct labels matter more than stacking sequence, and where this pattern
   * is used properly — one non-null series per period — the sequence is not
   * visible anyway.
   *
   * The fuller fix is to recompute the label assignment after reordering, which
   * means reproducing upstream's formatter decisions. Logged rather than done.
   */
  const { stack, onlyTotal, showValue } = chartProps.formData as {
    stack?: unknown;
    onlyTotal?: boolean;
    showValue?: boolean;
  };
  if (stack && onlyTotal && showValue) {
    return echartOptions;
  }

  const metricLabels = getMetricOrder(chartProps.formData.metrics);
  if (metricLabels.length < 2) {
    return echartOptions;
  }

  const verboseMap = chartProps.datasource?.verboseMap;
  const { series, legend } = echartOptions as {
    series?: unknown;
    legend?: { data?: unknown };
  };

  return {
    ...echartOptions,
    ...(Array.isArray(series)
      ? { series: orderByMetrics(series, metricLabels, verboseMap) }
      : {}),
    ...(legend && Array.isArray(legend.data)
      ? {
          legend: {
            ...legend,
            data: orderByMetrics(legend.data, metricLabels, verboseMap),
          },
        }
      : {}),
  };
}

/**
 * Applies role styling to the finished series array, or returns it untouched
 * when styling cannot apply.
 */
function styleSeries(
  chartProps: EchartsTimeseriesChartProps,
  // Derived from the transform's own return type rather than named directly:
  // the echarts package does not export its transformed-props type.
  echartOptions: ReturnType<typeof TimeseriesTransformProps>['echartOptions'],
) {
  const rules = readSeriesStyleRules(chartProps);
  if (!rules.length) {
    return echartOptions;
  }

  /*
   * `colorByPrimaryAxis` colours each bar individually and drops `itemStyle`
   * from the series entirely (echarts plugin `Timeseries/transformers.ts`,
   * where the spread is `...(colorByPrimaryAxis ? {} : { itemStyle })`).
   * Role styling and that mode are therefore mutually exclusive; the rules are
   * ignored rather than silently half-applied.
   */
  if (chartProps.formData.colorByPrimaryAxis) {
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
  };
}

/**
 * Wraps the shared Timeseries transform rather than forking it.
 *
 * The alternative is patching `itemStyle` inside the echarts plugin's
 * `transformers.ts`, which reads more cleanly but means maintaining a fork of a
 * ~1450-line file. Post-processing the finished series array costs one shallow
 * merge per series and keeps this package a thin layer over upstream.
 */
export default function transformProps(
  chartProps: EchartsTimeseriesChartProps,
) {
  const transformed = TimeseriesTransformProps({
    ...chartProps,
    formData: {
      ...chartProps.formData,
      seriesType: EchartsTimeseriesSeriesType.Bar,
    },
  });

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
      // Compared as a string rather than against `OrientationType`, which the
      // echarts package does not export from its index.
      chartProps.formData.orientation === 'horizontal',
    ),
  };
}
