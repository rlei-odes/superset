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
import { applySeriesStyles, readSeriesStyleRules } from './seriesStyle';

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

  const rules = readSeriesStyleRules(chartProps);
  if (!rules.length) {
    return transformed;
  }

  /*
   * `colorByPrimaryAxis` colours each bar individually and drops `itemStyle`
   * from the series entirely (echarts plugin `Timeseries/transformers.ts`,
   * where the spread is `...(colorByPrimaryAxis ? {} : { itemStyle })`).
   * Role styling and that mode are therefore mutually exclusive; the rules are
   * ignored rather than silently half-applied.
   */
  if (chartProps.formData.colorByPrimaryAxis) {
    return transformed;
  }

  const { series } = transformed.echartOptions;
  if (!Array.isArray(series)) {
    return transformed;
  }

  return {
    ...transformed,
    echartOptions: {
      ...transformed.echartOptions,
      series: applySeriesStyles(series, rules, chartProps.theme),
    },
  };
}
