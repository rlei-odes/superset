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
  StylableSeries,
  applySeriesStyles,
  matchesRuleKey,
  parseSeriesStyleRules,
  readSeriesStyleRules,
  resolveStyle,
  splitSeriesName,
} from '../src/seriesStyle';
import { RoleThemeTokens, SeriesRole, SeriesStyleRule } from '../src/types';

// Only the two tokens the plugin reads; real themes supply far more.
const theme: RoleThemeTokens = {
  colorTextTertiary: '#8c8c8c',
  colorBgContainer: '#ffffff',
};

const metricRule = (metric: string, role: SeriesRole): SeriesStyleRule => ({
  key: { kind: 'metric', metric },
  role,
});

test('matches a metric with no groupby', () => {
  expect(
    matchesRuleKey('SUM(sales)', { kind: 'metric', metric: 'SUM(sales)' }),
  ).toBe(true);
});

test('matches a metric when a groupby is applied', () => {
  // Superset flattens pivoted columns as "<metric>, <groupby>".
  expect(
    matchesRuleKey('SUM(sales), EMEA', {
      kind: 'metric',
      metric: 'SUM(sales)',
    }),
  ).toBe(true);
});

test('does not match a different metric sharing a prefix', () => {
  expect(
    matchesRuleKey('SUM(sales_plan), EMEA', {
      kind: 'metric',
      metric: 'SUM(sales)',
    }),
  ).toBe(false);
});

test('matches a metric label containing a comma', () => {
  // Python escapes inner commas as "\," before joining on ", ".
  expect(
    matchesRuleKey('AVG(a\\, b), EMEA', {
      kind: 'metric',
      metric: 'AVG(a, b)',
    }),
  ).toBe(true);
});

test('splits series names without breaking on escaped commas', () => {
  expect(splitSeriesName('AVG(a\\, b), EMEA, 2024')).toEqual([
    'AVG(a\\, b)',
    'EMEA',
    '2024',
  ]);
});

test('matches a dimension value but not the metric segment', () => {
  expect(
    matchesRuleKey('SUM(sales), EMEA', { kind: 'dimension', value: 'EMEA' }),
  ).toBe(true);
  // "SUM(sales)" is segment 0, so a dimension rule must not match it.
  expect(
    matchesRuleKey('SUM(sales), EMEA', {
      kind: 'dimension',
      value: 'SUM(sales)',
    }),
  ).toBe(false);
});

test('an invalid regex matches nothing instead of throwing', () => {
  expect(matchesRuleKey('SUM(sales)', { kind: 'pattern', pattern: '[' })).toBe(
    false,
  );
});

test('role defaults supply the fill style', () => {
  expect(resolveStyle(metricRule('m', SeriesRole.Plan), theme).fillStyle).toBe(
    'outline',
  );
  expect(
    resolveStyle(metricRule('m', SeriesRole.Forecast), theme).fillStyle,
  ).toBe('hatched');
  // Only prior year pins a colour; the rest inherit the colour scheme.
  expect(
    resolveStyle(metricRule('m', SeriesRole.Actual), theme).color,
  ).toBeUndefined();
  // Prior year takes its grey from the theme, so it follows dark mode.
  expect(resolveStyle(metricRule('m', SeriesRole.PriorYear), theme).color).toBe(
    theme.colorTextTertiary,
  );
});

test('an explicit rule value overrides the role default', () => {
  const rule: SeriesStyleRule = {
    key: { kind: 'metric', metric: 'm' },
    role: SeriesRole.Plan,
    fillStyle: 'solid',
    color: '#123456',
  };
  expect(resolveStyle(rule, theme)).toEqual({
    fillStyle: 'solid',
    color: '#123456',
  });
});

test('outline keeps the scheme colour as the border, not the fill', () => {
  const series: StylableSeries[] = [
    { name: 'SUM(plan)', itemStyle: { color: '#ff0000' } },
  ];
  const [styled] = applySeriesStyles(
    series,
    [metricRule('SUM(plan)', SeriesRole.Plan)],
    theme,
  );

  expect(styled.itemStyle).toMatchObject({
    color: 'transparent',
    borderColor: '#ff0000',
    borderWidth: 2,
  });
});

test('hatched keeps the fill and adds a decal', () => {
  const series: StylableSeries[] = [
    { name: 'SUM(fc)', itemStyle: { color: '#00ff00' } },
  ];
  const [styled] = applySeriesStyles(
    series,
    [metricRule('SUM(fc)', SeriesRole.Forecast)],
    theme,
  );

  expect(styled.itemStyle?.color).toBe('#00ff00');
  expect(styled.itemStyle?.decal).toMatchObject({
    symbol: 'rect',
    color: theme.colorBgContainer,
  });
});

test('sets an emphasis style so hover does not flash an outline solid', () => {
  const series: StylableSeries[] = [
    { name: 'SUM(plan)', itemStyle: { color: '#ff0000' } },
  ];
  const [styled] = applySeriesStyles(
    series,
    [metricRule('SUM(plan)', SeriesRole.Plan)],
    theme,
  );

  expect(styled.emphasis?.itemStyle).toMatchObject({
    color: 'transparent',
    borderWidth: 3,
  });
});

test('leaves unmatched series untouched', () => {
  const other = { name: 'SUM(other)', itemStyle: { color: '#0000ff' } };
  const [result] = applySeriesStyles(
    [other],
    [metricRule('SUM(plan)', SeriesRole.Plan)],
    theme,
  );

  expect(result).toBe(other);
});

test('returns the series array unchanged when there are no rules', () => {
  const series = [{ name: 'SUM(sales)' }];
  expect(applySeriesStyles(series, [], theme)).toBe(series);
});

test('first matching rule wins', () => {
  const series: StylableSeries[] = [
    { name: 'SUM(sales)', itemStyle: { color: '#fff' } },
  ];
  const [styled] = applySeriesStyles(
    series,
    [
      metricRule('SUM(sales)', SeriesRole.Actual),
      metricRule('SUM(sales)', SeriesRole.Plan),
    ],
    theme,
  );

  // Actual is solid, so a border must not have been applied.
  expect(styled.itemStyle?.color).toBe('#fff');
  expect(styled.itemStyle?.borderColor).toBeUndefined();
});

test('parses rules from a JSON string or an array', () => {
  expect(parseSeriesStyleRules('[{"role":"actual"}]')).toHaveLength(1);
  expect(parseSeriesStyleRules([{ role: 'actual' }])).toHaveLength(1);
});

test('reads rules from the camelCased formData key', () => {
  // ChartProps runs formData through convertKeysToCamelCase, so the control's
  // `series_style_rules` arrives as `seriesStyleRules`. Reading the snake_case
  // key off formData finds nothing and the chart silently goes unstyled.
  const rules = readSeriesStyleRules({
    formData: { seriesStyleRules: '[{"role":"plan"}]' },
  });
  expect(rules).toHaveLength(1);
});

test('falls back to the snake_case key on rawFormData', () => {
  const rules = readSeriesStyleRules({
    formData: {},
    rawFormData: { series_style_rules: '[{"role":"plan"}]' },
  });
  expect(rules).toHaveLength(1);
});

test('yields no rules when form data carries none', () => {
  expect(readSeriesStyleRules({ formData: {}, rawFormData: {} })).toEqual([]);
  expect(readSeriesStyleRules({})).toEqual([]);
});

test('unparseable rules yield none rather than throwing', () => {
  // A user mid-edit in the JSON control must not blank the chart.
  expect(parseSeriesStyleRules('[{"role":')).toEqual([]);
  expect(parseSeriesStyleRules('')).toEqual([]);
  expect(parseSeriesStyleRules(undefined)).toEqual([]);
  expect(parseSeriesStyleRules('{"not":"an array"}')).toEqual([]);
});
