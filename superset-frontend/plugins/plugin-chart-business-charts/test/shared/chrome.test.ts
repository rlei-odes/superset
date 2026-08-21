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
  applyChartChrome,
  readChromeOptions,
  toCssColor,
} from '../../src/shared/chrome';

const options = () => ({
  xAxis: {
    splitLine: { show: true },
    axisTick: { show: true },
    axisLabel: { show: true },
  },
  yAxis: {
    splitLine: { show: true },
    axisTick: { show: true },
    axisLabel: { show: true },
  },
  series: [],
});

test('hides gridlines on the value axis', () => {
  const result = applyChartChrome(options(), { showGridlines: false });
  expect(result.yAxis.splitLine.show).toBe(false);
});

test('hides gridlines on the correct axis when horizontal', () => {
  // The Timeseries transform swaps the axes for a horizontal bar chart, so the
  // value axis is xAxis. Keying off yAxis would hide the wrong thing.
  const result = applyChartChrome(options(), { showGridlines: false }, true);
  expect(result.xAxis.splitLine.show).toBe(false);
  expect(result.yAxis.splitLine.show).toBe(true);
});

test('leaves the stock behaviour alone when a checkbox is ticked', () => {
  // Subtractive by design: writing `show: true` would override upstream's
  // small-chart auto-hide, so a ticked box must be a no-op.
  const result = applyChartChrome(options(), {
    showGridlines: true,
    showAxisTicks: true,
    showValueAxisLabels: true,
  });
  expect(result).toEqual(options());
});

test('leaves everything alone when nothing is configured', () => {
  expect(applyChartChrome(options(), {})).toEqual(options());
});

test('hides ticks on both axes', () => {
  const result = applyChartChrome(options(), { showAxisTicks: false });
  expect(result.xAxis.axisTick.show).toBe(false);
  expect(result.yAxis.axisTick.show).toBe(false);
});

test('hides value and category axis labels independently', () => {
  const result = applyChartChrome(options(), {
    showValueAxisLabels: false,
  });
  expect(result.yAxis.axisLabel.show).toBe(false);
  expect(result.xAxis.axisLabel.show).toBe(true);
});

test('styles the axis line without forcing it to show', () => {
  // Setting `show` here would draw a value-axis line that ECharts hides by
  // default, so only lineStyle is written.
  const result = applyChartChrome(options(), {
    axisLineColor: '#ff0000',
    axisLineWidth: 3,
  }) as any;
  expect(result.xAxis.axisLine).toEqual({
    lineStyle: { color: '#ff0000', width: 3 },
  });
  expect(result.xAxis.axisLine.show).toBeUndefined();
});

test('accepts the RGB object form the colour control produces', () => {
  expect(toCssColor({ r: 255, g: 0, b: 0 })).toBe('rgba(255, 0, 0, 1)');
  expect(toCssColor({ r: 1, g: 2, b: 3, a: 0.5 })).toBe('rgba(1, 2, 3, 0.5)');
  expect(toCssColor('#abc')).toBe('#abc');
  expect(toCssColor(undefined)).toBeUndefined();
  expect(toCssColor({ nope: 1 })).toBeUndefined();
});

test('preserves other axis config while patching', () => {
  const withTitle = {
    ...options(),
    yAxis: { ...options().yAxis, name: 'Sales' },
  };
  const result = applyChartChrome(withTitle, { showGridlines: false }) as any;
  expect(result.yAxis.name).toBe('Sales');
  expect(result.series).toEqual([]);
});

test('reads the controls from the camelCased form data', () => {
  // convertKeysToCamelCase means `show_gridlines` arrives as `showGridlines`.
  const chrome = readChromeOptions({
    formData: { showGridlines: false, axisLineWidth: '2' },
  });
  expect(chrome.showGridlines).toBe(false);
  expect(chrome.axisLineWidth).toBe(2);
});

test('falls back to the snake_case key on rawFormData', () => {
  const chrome = readChromeOptions({
    formData: {},
    rawFormData: { show_axis_ticks: false },
  });
  expect(chrome.showAxisTicks).toBe(false);
});

test('ignores a half-typed axis width rather than emitting NaN', () => {
  expect(
    readChromeOptions({ formData: { axisLineWidth: '' } }).axisLineWidth,
  ).toBeUndefined();
  expect(
    readChromeOptions({ formData: { axisLineWidth: 'x' } }).axisLineWidth,
  ).toBeUndefined();
  expect(readChromeOptions({}).axisLineWidth).toBeUndefined();
});

test('hides overlapping value labels on every series when asked', () => {
  // Every series has to opt in: ECharts resolves label collisions across all of
  // them at once, so one left out keeps printing over the rest.
  const options = {
    series: [
      { name: 'a', type: 'bar' },
      { name: 'b', type: 'line' },
    ],
    xAxis: {},
    yAxis: {},
  };
  const result = applyChartChrome(options, { hideOverlappingLabels: true });

  expect(result.series).toEqual([
    { name: 'a', type: 'bar', labelLayout: { hideOverlap: true } },
    { name: 'b', type: 'line', labelLayout: { hideOverlap: true } },
  ]);
});

test('leaves the series alone when not asked', () => {
  // Off means stock behaviour: upstream writes no labelLayout at all.
  const series = [{ name: 'a' }];
  const result = applyChartChrome({ series, xAxis: {}, yAxis: {} }, {});
  expect(result.series).toBe(series);
});

test('reads the overlap flag from either casing', () => {
  expect(
    readChromeOptions({ formData: { hideOverlappingLabels: true } })
      .hideOverlappingLabels,
  ).toBe(true);
  expect(
    readChromeOptions({ rawFormData: { hide_overlapping_labels: true } })
      .hideOverlappingLabels,
  ).toBe(true);
});
