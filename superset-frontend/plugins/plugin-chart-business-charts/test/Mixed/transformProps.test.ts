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

/**
 * The Z-chart shape this plugin exists for: query A plots the periodic figures
 * as bars, query B their running totals as lines, and Actual / Plan appear in
 * both. Deliberately out of metric order, because that is what the stock sum
 * sort produces and what the plugin is expected to undo.
 */
const stockOptions = () => ({
  width: 100,
  height: 100,
  echartOptions: {
    series: [
      {
        name: 'Plan',
        type: 'bar',
        queryIndex: 0,
        itemStyle: { color: '#111' },
      },
      {
        name: 'Actual',
        type: 'bar',
        queryIndex: 0,
        itemStyle: { color: '#222' },
      },
      {
        name: 'Cumulative plan',
        type: 'line',
        queryIndex: 1,
        itemStyle: { color: '#111' },
      },
      {
        name: 'Cumulative actual',
        type: 'line',
        queryIndex: 1,
        itemStyle: { color: '#222' },
      },
    ],
    legend: {
      data: ['Plan', 'Actual', 'Cumulative plan', 'Cumulative actual'],
    },
    xAxis: {},
    // Two value axes, primary and secondary — the shape the Mixed transform
    // emits and the Bar transform does not.
    yAxis: [{}, {}],
  },
});

// The upstream transform is heavy and needs a full ChartProps; mocking it keeps
// these tests about this plugin's own post-processing.
jest.mock('@superset-ui/plugin-chart-echarts', () => ({
  __esModule: true,
  MixedTimeseriesTransformProps: jest.fn(() => stockOptions()),
}));

// eslint-disable-next-line import/first
import transformProps from '../../src/Mixed/transformProps';

const chartProps = (formData: Record<string, unknown> = {}) =>
  ({
    formData: {
      metrics: ['Actual', 'Plan'],
      metricsB: ['Cumulative actual', 'Cumulative plan'],
      ...formData,
    },
    rawFormData: {},
    datasource: {},
    theme: {
      colorTextTertiary: '#888',
      colorBgContainer: '#fff',
      colorText: '#383838',
    },
    queriesData: [{ data: [] }, { data: [] }],
  }) as any;

const run = (formData: Record<string, unknown> = {}) =>
  transformProps(chartProps(formData)) as any;

const namesOf = (result: any) =>
  result.echartOptions.series.map((s: any) => s.name);

const seriesNamed = (result: any, name: string) =>
  result.echartOptions.series.find((s: any) => s.name === name);

const planRule = {
  key: { kind: 'metric', metric: 'Plan' },
  role: 'plan',
};

test('orders each query against its own metric list', () => {
  const result = run();
  expect(namesOf(result)).toEqual([
    'Actual',
    'Plan',
    'Cumulative actual',
    'Cumulative plan',
  ]);
});

test('drags the legend along behind the reordered series', () => {
  // legendData is built from the series array, but inside the transform, so it
  // still holds a snapshot of the pre-reorder order.
  expect(run().echartOptions.legend.data).toEqual([
    'Actual',
    'Plan',
    'Cumulative actual',
    'Cumulative plan',
  ]);
});

test('leaves the order alone when the option is off', () => {
  // camelCase, because ChartProps runs form data through convertKeysToCamelCase
  // — the snake_case name only survives on rawFormData.
  expect(namesOf(run({ seriesOrderAsDefined: false }))).toEqual([
    'Plan',
    'Actual',
    'Cumulative plan',
    'Cumulative actual',
  ]);
});

test('suppresses only the query whose stacked totals would be detached', () => {
  // Query A stacks and prints totals, so its labels are index-bound and must
  // not move. Query B is untouched by that and keeps its ordering.
  expect(
    namesOf(run({ stack: 'Stack', onlyTotal: true, showValue: true })),
  ).toEqual(['Plan', 'Actual', 'Cumulative actual', 'Cumulative plan']);

  expect(
    namesOf(run({ stackB: 'Stack', onlyTotalB: true, showValueB: true })),
  ).toEqual(['Actual', 'Plan', 'Cumulative plan', 'Cumulative actual']);
});

test('a bar takes the fill treatment and a line the stroke treatment', () => {
  const result = run({ seriesStyleRules: [planRule] });

  expect(seriesNamed(result, 'Plan').itemStyle).toMatchObject({
    color: 'transparent',
    borderColor: '#111',
  });
  expect(seriesNamed(result, 'Cumulative actual').lineStyle).toBeUndefined();
});

test('one rule reaches both queries when they share a metric', () => {
  const result = run({
    seriesStyleRules: [
      planRule,
      { key: { kind: 'pattern', pattern: '^Cumulative plan$' }, role: 'plan' },
    ],
  });

  expect(seriesNamed(result, 'Cumulative plan').lineStyle).toMatchObject({
    type: 'dashed',
  });
});

test('applies chrome to both value axes, not just the primary', () => {
  // The Mixed transform declares yAxis as an array; hiding the value labels has
  // to reach the secondary one or the sparse look is only half applied.
  const result = run({ showValueAxisLabels: false, showGridlines: false });

  expect(result.echartOptions.yAxis).toEqual([
    { axisLabel: { show: false }, splitLine: { show: false } },
    { axisLabel: { show: false }, splitLine: { show: false } },
  ]);
});

test('does not pin a series type on the way in', () => {
  // The Bar chart forces `seriesType: Bar`; here the two Series type controls
  // are the point, so the form data must pass through untouched.
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const {
    MixedTimeseriesTransformProps,
  } = require('@superset-ui/plugin-chart-echarts');
  MixedTimeseriesTransformProps.mockClear();

  const props = chartProps({ seriesType: 'bar', seriesTypeB: 'line' });
  transformProps(props);

  expect(MixedTimeseriesTransformProps).toHaveBeenCalledWith(props);
});
