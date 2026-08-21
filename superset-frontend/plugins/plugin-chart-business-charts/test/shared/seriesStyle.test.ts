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
} from '../../src/shared/seriesStyle';
import {
  getRoleDefaults,
  RoleThemeTokens,
  SeriesRole,
  SeriesStyleRule,
} from '../../src/shared/types';

// Only the tokens the plugin reads; real themes supply far more.
const theme: RoleThemeTokens = {
  colorTextTertiary: '#8c8c8c',
  colorBgContainer: '#ffffff',
  colorText: '#383838',
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
  // Colour is never a render-time fallback, for any role. The control seeds a
  // role's colour into the rule instead, so that clearing it in the picker
  // genuinely removes it rather than falling straight back to the role default.
  expect(
    resolveStyle(metricRule('m', SeriesRole.Actual), theme).color,
  ).toBeUndefined();
  expect(
    resolveStyle(metricRule('m', SeriesRole.PriorYear), theme).color,
  ).toBeUndefined();
});

test('role seed colours follow the theme, so they track dark mode', () => {
  // These are what the control writes into a new rule -- see getRoleDefaults.
  const defaults = getRoleDefaults(theme);
  expect(defaults[SeriesRole.PriorYear].color).toBe(theme.colorTextTertiary);
  expect(defaults[SeriesRole.Actual].color).toBe(theme.colorText);
  expect(defaults[SeriesRole.Forecast].color).toBe(theme.colorText);
  expect(defaults[SeriesRole.Plan].color).toBe(theme.colorText);
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
    // Untouched by the fill override: the two treatments are independent axes,
    // so overriding how a bar is filled must not restyle the line as well.
    lineType: 'dashed',
    color: '#123456',
  });
});

test('the fill and line overrides are independent of each other', () => {
  const rule: SeriesStyleRule = {
    key: { kind: 'metric', metric: 'm' },
    role: SeriesRole.Actual,
    lineType: 'dotted',
  };
  expect(resolveStyle(rule, theme)).toEqual({
    fillStyle: 'solid',
    lineType: 'dotted',
    color: undefined,
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

test('matches a metric under its dataset verbose name', () => {
  // With a groupby the series name carries the verbose name, because the
  // inverted-verbose-map lookup upstream only hits on an exact whole-name
  // match. The rule stores the metric's own label either way.
  const verboseMap = { sum__sales: 'Total sales' };
  expect(
    matchesRuleKey(
      'Total sales, EMEA',
      { kind: 'metric', metric: 'sum__sales' },
      verboseMap,
    ),
  ).toBe(true);
});

test('matches a metric by its raw label even when a verbose name exists', () => {
  // Ungrouped, the same metric comes back un-verbosed, so both spellings have
  // to match or rules would work until a groupby was added.
  expect(
    matchesRuleKey(
      'sum__sales',
      { kind: 'metric', metric: 'sum__sales' },
      { sum__sales: 'Total sales' },
    ),
  ).toBe(true);
});

test('a verbose name does not make an unrelated series match', () => {
  expect(
    matchesRuleKey(
      'Total costs, EMEA',
      { kind: 'metric', metric: 'sum__sales' },
      { sum__sales: 'Total sales' },
    ),
  ).toBe(false);
});

test('applies styling to a verbose-named series', () => {
  const series: StylableSeries[] = [
    { name: 'Total sales, EMEA', itemStyle: { color: '#1f77b4' } },
  ];
  const styled = applySeriesStyles(
    series,
    [metricRule('sum__sales', SeriesRole.Plan)],
    theme,
    { sum__sales: 'Total sales' },
  );
  expect(styled[0].itemStyle).toMatchObject({
    color: 'transparent',
    borderColor: '#1f77b4',
  });
});

test('matches a dimension value when a single metric leaves it alone in the name', () => {
  // One metric plus a groupby: Superset drops the metric from the series name,
  // so the whole name is the dimension value. Skipping segment 0 here left
  // nothing to match and dimension rules quietly did nothing.
  expect(matchesRuleKey('Plan', { kind: 'dimension', value: 'Plan' })).toBe(
    true,
  );
});

test('still ignores the metric segment when there is more than one', () => {
  // Two metrics: segment 0 is the metric again, and a dimension rule must not
  // match it.
  expect(
    matchesRuleKey('Plan, EMEA', { kind: 'dimension', value: 'Plan' }),
  ).toBe(false);
  expect(
    matchesRuleKey('Revenue, Plan', { kind: 'dimension', value: 'Plan' }),
  ).toBe(true);
});

test('a line series takes the role line type, not the fill treatment', () => {
  // The Plan role is `outline` for a bar and `dashed` for a line. Applying the
  // fill treatment here would set `color: 'transparent'` and erase the line.
  const series: StylableSeries[] = [
    { name: 'SUM(plan)', type: 'line', itemStyle: { color: '#ff0000' } },
  ];
  const [styled] = applySeriesStyles(
    series,
    [metricRule('SUM(plan)', SeriesRole.Plan)],
    theme,
  );

  expect(styled.lineStyle).toMatchObject({ type: 'dashed', color: '#ff0000' });
  expect(styled.itemStyle).toEqual({ color: '#ff0000' });
});

test('a forecast line is dotted and a prior-year line is solid', () => {
  const series: StylableSeries[] = [
    { name: 'fc', type: 'line' },
    { name: 'py', type: 'line' },
  ];
  const [forecast, priorYear] = applySeriesStyles(
    series,
    [
      metricRule('fc', SeriesRole.Forecast),
      metricRule('py', SeriesRole.PriorYear),
    ],
    theme,
  );

  expect(forecast.lineStyle).toMatchObject({ type: 'dotted' });
  expect(priorYear.lineStyle).toMatchObject({ type: 'solid' });
});

test('one rule dresses the same metric as both a bar and a line', () => {
  // The Z-chart shape: query A plots the monthly figure as a bar, query B its
  // running total as a line, and both are the same metric. A single rule has
  // to reach both, in the vocabulary each shape understands.
  const series: StylableSeries[] = [
    { name: 'SUM(plan)', type: 'bar', itemStyle: { color: '#123456' } },
    { name: 'SUM(plan)', type: 'line', itemStyle: { color: '#123456' } },
  ];
  const [bar, line] = applySeriesStyles(
    series,
    [metricRule('SUM(plan)', SeriesRole.Plan)],
    theme,
  );

  expect(bar.itemStyle).toMatchObject({
    color: 'transparent',
    borderColor: '#123456',
  });
  expect(line.lineStyle).toMatchObject({ type: 'dashed' });
});

test('a rule colour reaches a line and its symbols', () => {
  const series: StylableSeries[] = [
    { name: 'plan', type: 'line', itemStyle: { color: '#ff0000', opacity: 0 } },
  ];
  const [styled] = applySeriesStyles(
    series,
    [
      {
        key: { kind: 'metric', metric: 'plan' },
        role: SeriesRole.Plan,
        color: '#00ff00',
      },
    ],
    theme,
  );

  expect(styled.lineStyle).toMatchObject({ color: '#00ff00' });
  // The symbols follow the line, and the invisible-symbol hack that keeps a
  // line clickable for cross-filtering survives.
  expect(styled.itemStyle).toEqual({ color: '#00ff00', opacity: 0 });
});

test("a line's emphasis state is left alone", () => {
  // `transformSeries` puts `emphasis.itemStyle.opacity = 1` on a line whose
  // symbols are hidden for hit-testing. Restating the resolved style over it
  // would write the hidden `opacity: 0` back and kill the hover affordance.
  const series: StylableSeries[] = [
    {
      name: 'plan',
      type: 'line',
      itemStyle: { color: '#ff0000', opacity: 0 },
      emphasis: { itemStyle: { opacity: 1 } },
    },
  ];
  const [styled] = applySeriesStyles(
    series,
    [metricRule('plan', SeriesRole.Plan)],
    theme,
  );

  expect(styled.emphasis).toEqual({ itemStyle: { opacity: 1 } });
});

test('a series with no type still takes the fill treatment', () => {
  // Keeps the Bar chart behaving as it did before lines existed, and is what a
  // bare fixture looks like.
  const series: StylableSeries[] = [{ name: 'plan' }];
  const [styled] = applySeriesStyles(
    series,
    [metricRule('plan', SeriesRole.Plan)],
    theme,
  );

  expect(styled.itemStyle).toMatchObject({ color: 'transparent' });
});

test('a metric rule still matches when query identifiers are shown', () => {
  // The Mixed chart appends " (Query A)" to the metric part of a series name.
  // Without stripping it, ticking that checkbox turns every rule into a
  // silent no-op.
  const key = { kind: 'metric', metric: 'SUM(sales)' } as const;
  expect(matchesRuleKey('SUM(sales) (Query A)', key)).toBe(true);
  expect(matchesRuleKey('SUM(sales) (Query B), EMEA', key)).toBe(true);
  // Only the suffix goes; a metric that genuinely differs still fails.
  expect(matchesRuleKey('SUM(costs) (Query A)', key)).toBe(false);
});

test('a metric whose own name ends in a parenthesis is not truncated', () => {
  expect(
    matchesRuleKey('COUNT(Query A)', {
      kind: 'metric',
      metric: 'COUNT(Query A)',
    }),
  ).toBe(true);
});

test('every comma in a metric label is escaped, not just the first', () => {
  // Mirrors Python's `escape_separator`, which has no count limit.
  expect(
    matchesRuleKey('AVG(a\\, b\\, c), EMEA', {
      kind: 'metric',
      metric: 'AVG(a, b, c)',
    }),
  ).toBe(true);
});
