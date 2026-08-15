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
  getMetricOrder,
  orderByMetrics,
  readOrderByMetrics,
} from '../src/seriesOrder';

const named = (...names: string[]) => names.map(name => ({ name }));
const namesOf = (entries: { name: string }[]) => entries.map(e => e.name);

test('restores the order the metrics were defined in', () => {
  // The stock sort had put these in descending total-value order.
  const series = named('sum_revenue', 'sum_cost', 'sum_profit');
  const result = orderByMetrics(series, [
    'sum_cost',
    'sum_revenue',
    'sum_profit',
  ]);
  expect(namesOf(result)).toEqual(['sum_cost', 'sum_revenue', 'sum_profit']);
});

test('groups a groupby under its metric and keeps the values in place', () => {
  // Only the metric grouping is imposed; EMEA/APAC keep the query's order.
  const series = named(
    'sum_revenue, EMEA',
    'sum_cost, EMEA',
    'sum_revenue, APAC',
    'sum_cost, APAC',
  );
  const result = orderByMetrics(series, ['sum_cost', 'sum_revenue']);
  expect(namesOf(result)).toEqual([
    'sum_cost, EMEA',
    'sum_cost, APAC',
    'sum_revenue, EMEA',
    'sum_revenue, APAC',
  ]);
});

test('matches a metric carrying its dataset verbose name', () => {
  // A grouped series is named with the verbose name, an ungrouped one with the
  // raw label; both have to resolve to the same metric.
  const series = named('Total revenue, EMEA', 'Total cost, EMEA');
  const result = orderByMetrics(series, ['sum_cost', 'sum_revenue'], {
    sum_cost: 'Total cost',
    sum_revenue: 'Total revenue',
  });
  expect(namesOf(result)).toEqual(['Total cost, EMEA', 'Total revenue, EMEA']);
});

test('leaves series that belong to no metric exactly where they are', () => {
  // Forecast bands and annotation layers share the array, and
  // reorderForecastSeries has already arranged them. Moving them would undo it.
  const series = named(
    'sum_revenue__yhat',
    'annotation line',
    'sum_revenue',
    'sum_cost',
  );
  const result = orderByMetrics(series, ['sum_cost', 'sum_revenue']);
  expect(namesOf(result)).toEqual([
    'sum_revenue__yhat',
    'annotation line',
    'sum_cost',
    'sum_revenue',
  ]);
});

test('reorders legend entries given as plain strings', () => {
  const result = orderByMetrics(
    ['sum_revenue', 'sum_cost'],
    ['sum_cost', 'sum_revenue'],
  );
  expect(result).toEqual(['sum_cost', 'sum_revenue']);
});

test('leaves the array alone when it cannot help', () => {
  const series = named('sum_revenue', 'sum_cost');
  expect(orderByMetrics(series, [])).toBe(series);
  expect(orderByMetrics([], ['sum_cost'])).toEqual([]);
  // Only one series belongs to a metric, so there is nothing to reorder.
  expect(
    namesOf(orderByMetrics(named('sum_cost', 'other'), ['sum_cost'])),
  ).toEqual(['sum_cost', 'other']);
});

test('reads the metric labels in control order', () => {
  expect(
    getMetricOrder([
      'sum_cost',
      { label: 'Plan', expressionType: 'SQL', sqlExpression: 'x' } as any,
    ]),
  ).toEqual(['sum_cost', 'Plan']);
  expect(getMetricOrder(undefined)).toEqual([]);
});

test('defaults to on, and only an explicit false turns it off', () => {
  expect(readOrderByMetrics({})).toBe(true);
  expect(readOrderByMetrics({ formData: {} })).toBe(true);
  expect(
    readOrderByMetrics({ formData: { seriesOrderAsDefined: false } }),
  ).toBe(false);
  // convertKeysToCamelCase means the snake_case key only survives on rawFormData.
  expect(
    readOrderByMetrics({
      formData: {},
      rawFormData: { series_order_as_defined: false },
    }),
  ).toBe(false);
});
