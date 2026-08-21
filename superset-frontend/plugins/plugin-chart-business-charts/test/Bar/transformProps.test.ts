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

// The upstream transform is heavy and needs a full ChartProps; mocking it keeps
// these tests about this plugin's own post-processing.
jest.mock('@superset-ui/plugin-chart-echarts', () => ({
  __esModule: true,
  EchartsTimeseriesSeriesType: { Bar: 'bar' },
  TimeseriesTransformProps: jest.fn(() => ({
    width: 100,
    height: 100,
    echartOptions: {
      // Deliberately not in metric order: this is what the stock sum sort
      // produces, and what the plugin is expected to undo.
      series: [{ name: 'Plan' }, { name: 'Actual' }],
      legend: { data: ['Plan', 'Actual'] },
      xAxis: {},
      yAxis: {},
    },
  })),
}));

// eslint-disable-next-line import/first
import transformProps from '../../src/Bar/transformProps';

const chartProps = (formData: Record<string, unknown> = {}) =>
  ({
    formData: {
      metrics: ['Actual', 'Plan'],
      ...formData,
    },
    rawFormData: {},
    datasource: {},
    theme: {
      colorTextTertiary: '#888',
      colorBgContainer: '#fff',
      colorText: '#383838',
    },
    queriesData: [{ data: [] }],
  }) as any;

const namesOf = (result: any) =>
  result.echartOptions.series.map((s: any) => s.name);

test('restores metric order on the series and the legend', () => {
  const result = transformProps(chartProps()) as any;
  expect(namesOf(result)).toEqual(['Actual', 'Plan']);
  // The legend is built separately upstream, so it has to be reordered too.
  expect(result.echartOptions.legend.data).toEqual(['Actual', 'Plan']);
});

test('leaves the order alone when the option is off', () => {
  // camelCase, because ChartProps runs form data through convertKeysToCamelCase
  // — the snake_case name only survives on rawFormData.
  const result = transformProps(chartProps({ seriesOrderAsDefined: false }));
  expect(namesOf(result)).toEqual(['Plan', 'Actual']);
});

test('skips reordering when stacked total labels would be detached', () => {
  // Stacked total labels are bound to series positions, so reordering moves a
  // label onto the wrong series or drops it. Correct labels win over ordering.
  const result = transformProps(
    chartProps({ stack: 'Stack', onlyTotal: true, showValue: true }),
  );
  expect(namesOf(result)).toEqual(['Plan', 'Actual']);
});

test('still reorders a stacked chart that prints no totals', () => {
  // Without showValue there are no labels to detach, and without onlyTotal the
  // formatter never consults the index map.
  expect(
    namesOf(transformProps(chartProps({ stack: 'Stack', showValue: false }))),
  ).toEqual(['Actual', 'Plan']);
  expect(
    namesOf(
      transformProps(
        chartProps({ stack: 'Stack', onlyTotal: false, showValue: true }),
      ),
    ),
  ).toEqual(['Actual', 'Plan']);
});

test('reorders an unstacked chart that prints values', () => {
  // The index map is only built for stacked charts, so this is always safe.
  expect(
    namesOf(transformProps(chartProps({ showValue: true, onlyTotal: true }))),
  ).toEqual(['Actual', 'Plan']);
});
