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
  decodeRuleKey,
  describeRuleKey,
  encodeRuleKey,
  getDimensionKeyOptions,
  getMetricKeyOptions,
  getSeriesOptionGroups,
  getUnclaimedOption,
} from '../src/controls/ruleOptions';
import { SeriesRole, SeriesStyleRule, SeriesStyleRuleKey } from '../src/types';

test('round-trips each kind of rule key through the Select value', () => {
  const keys: SeriesStyleRuleKey[] = [
    { kind: 'metric', metric: 'SUM(sales)' },
    { kind: 'dimension', value: 'EMEA' },
    { kind: 'pattern', pattern: '^SUM' },
  ];
  keys.forEach(key => {
    expect(decodeRuleKey(encodeRuleKey(key))).toEqual(key);
  });
});

test('round-trips a metric label containing a colon', () => {
  // Only the first colon separates the kind, so a metric label may hold more.
  const key: SeriesStyleRuleKey = {
    kind: 'metric',
    metric: 'CAST(x AS TIME): total',
  };
  expect(decodeRuleKey(encodeRuleKey(key))).toEqual(key);
});

test('rejects an unrecognised encoded key', () => {
  expect(decodeRuleKey('nonsense')).toBeUndefined();
  expect(decodeRuleKey('unknown:value')).toBeUndefined();
});

test('offers a rule key per metric on the chart', () => {
  const options = getMetricKeyOptions([
    'sum__sales',
    { label: 'Plan', expressionType: 'SQL', sqlExpression: 'SUM(plan)' } as any,
  ]);
  expect(options).toEqual([
    { value: 'metric:sum__sales', label: 'sum__sales' },
    { value: 'metric:Plan', label: 'Plan' },
  ]);
});

test('shows a metric under its verbose name but stores its label', () => {
  // The legend shows the verbose name, so the dropdown has to as well or the
  // user cannot tell which series a row refers to. Matching still keys on the
  // label, which is what the rule stores.
  const options = getMetricKeyOptions(['sum__sales'], {
    sum__sales: 'Total sales',
  });
  expect(options).toEqual([
    { value: 'metric:sum__sales', label: 'Total sales' },
  ]);
});

test('tolerates a single metric and no metrics at all', () => {
  expect(getMetricKeyOptions('sum__sales')).toHaveLength(1);
  expect(getMetricKeyOptions(undefined)).toEqual([]);
});

test('does not offer the same metric twice', () => {
  expect(getMetricKeyOptions(['sum__sales', 'sum__sales'])).toHaveLength(1);
});

test('derives dimension values from the flattened column names', () => {
  // Segment 0 is the metric; the rest are the groupby values.
  const options = getDimensionKeyOptions([
    'SUM(sales), EMEA',
    'SUM(sales), APAC',
    'SUM(plan), EMEA',
  ]);
  expect(options).toEqual([
    { value: 'dimension:EMEA', label: 'EMEA' },
    { value: 'dimension:APAC', label: 'APAC' },
  ]);
});

test('offers no dimension values before the chart has run', () => {
  expect(getDimensionKeyOptions([])).toEqual([]);
  expect(getDimensionKeyOptions()).toEqual([]);
});

test('offers no dimension values when the query has no groupby', () => {
  expect(getDimensionKeyOptions(['SUM(sales)'])).toEqual([]);
});

test('describes keys the dropdown groups cannot offer', () => {
  // A pattern rule, or one left over from a removed metric, still has to be
  // visible and deletable rather than rendering as an empty row.
  expect(describeRuleKey({ kind: 'pattern', pattern: '^SUM' })).toBe('/^SUM/');
  expect(describeRuleKey({ kind: 'metric', metric: 'SUM(gone)' })).toBe(
    'SUM(gone)',
  );
  expect(describeRuleKey({ kind: 'dimension', value: 'EMEA' })).toBe('EMEA');
});

const rule = (metric: string): SeriesStyleRule => ({
  key: { kind: 'metric', metric },
  role: SeriesRole.Actual,
});

const LABELS = {
  metrics: 'Metrics',
  dimensions: 'Dimension values',
  current: 'Current',
};

const metricOptions = [
  { value: 'metric:SUM(sales)', label: 'Total sales' },
  { value: 'metric:SUM(plan)', label: 'Plan' },
];
const dimensionOptions = [{ value: 'dimension:EMEA', label: 'EMEA' }];

test('disables a series another rule has already claimed', () => {
  // Two rules on one series is meaningless: the first match wins, so the second
  // never applies.
  const rules = [rule('SUM(sales)'), rule('SUM(plan)')];
  const groups = getSeriesOptionGroups(
    rules,
    1,
    metricOptions,
    dimensionOptions,
    LABELS,
  );
  const metrics = groups[0].options;
  expect(metrics.find(o => o.value === 'metric:SUM(sales)')?.disabled).toBe(
    true,
  );
});

test("leaves a rule's own series selectable", () => {
  // Otherwise the rule could not re-select what it already has.
  const rules = [rule('SUM(sales)'), rule('SUM(plan)')];
  const groups = getSeriesOptionGroups(
    rules,
    1,
    metricOptions,
    dimensionOptions,
    LABELS,
  );
  expect(
    groups[0].options.find(o => o.value === 'metric:SUM(plan)')?.disabled,
  ).toBe(false);
});

test('disables rather than hides a claimed series', () => {
  // Hiding it would leave the user wondering where a metric went.
  const groups = getSeriesOptionGroups(
    [rule('SUM(sales)'), rule('SUM(plan)')],
    1,
    metricOptions,
    dimensionOptions,
    LABELS,
  );
  expect(groups[0].options).toHaveLength(2);
});

test('appends a key no group offers under "Current"', () => {
  const rules: SeriesStyleRule[] = [
    { key: { kind: 'pattern', pattern: '^SUM' }, role: SeriesRole.Forecast },
  ];
  const groups = getSeriesOptionGroups(
    rules,
    0,
    metricOptions,
    dimensionOptions,
    LABELS,
  );
  expect(groups).toHaveLength(3);
  expect(groups[2].options[0].label).toBe('/^SUM/');
});

test('does not append a "Current" group when the key is already offered', () => {
  const groups = getSeriesOptionGroups(
    [rule('SUM(sales)')],
    0,
    metricOptions,
    dimensionOptions,
    LABELS,
  );
  expect(groups).toHaveLength(2);
});

test('finds the first series no rule covers yet', () => {
  expect(
    getUnclaimedOption([rule('SUM(sales)')], metricOptions, dimensionOptions),
  ).toEqual({ value: 'metric:SUM(plan)', label: 'Plan' });
});

test('falls through to dimension values once the metrics are covered', () => {
  expect(
    getUnclaimedOption(
      [rule('SUM(sales)'), rule('SUM(plan)')],
      metricOptions,
      dimensionOptions,
    ),
  ).toEqual({ value: 'dimension:EMEA', label: 'EMEA' });
});

test('finds nothing once every series is covered', () => {
  const rules = [
    rule('SUM(sales)'),
    rule('SUM(plan)'),
    {
      key: { kind: 'dimension' as const, value: 'EMEA' },
      role: SeriesRole.Actual,
    },
  ];
  expect(
    getUnclaimedOption(rules, metricOptions, dimensionOptions),
  ).toBeUndefined();
});
