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
import { ComponentProps } from 'react';
import { render, screen, userEvent } from 'spec/helpers/testing-library';
import Control from 'src/explore/components/Control';
import SeriesStyleControl from '../src/controls/SeriesStyleControl';
import { SeriesRole, SeriesStyleRule } from '../src/types';

const metricOptions = [
  { value: 'metric:SUM(sales)', label: 'Total sales' },
  { value: 'metric:SUM(plan)', label: 'Plan' },
];

const dimensionOptions = [{ value: 'dimension:EMEA', label: 'EMEA' }];

/**
 * Renders the control the way the explore panel does — through Superset's own
 * `Control` host, with the component passed as `type`.
 *
 * That indirection is the point of these tests, not incidental setup. No plugin
 * in the repo ships its own control component, so the branch in `Control.tsx`
 * that accepts a component instead of a registry-string is unexercised, and the
 * whole rule-row UI depends on it. Rendering the bare component would prove
 * nothing about it.
 */
function renderControl(value: SeriesStyleRule[] | string = []) {
  const setControlValue = jest.fn();
  // `ControlProps` lists only the fields `Control` itself reads. Anything
  // `mapStateToProps` returns — here the two option lists — reaches the
  // component through the same `{...props}` spread but has no place in that
  // type, so the explore panel's real prop shape cannot be expressed without a
  // cast.
  const props = {
    type: SeriesStyleControl,
    name: 'series_style_rules',
    label: 'Series style rules',
    value,
    actions: { setControlValue },
    metricOptions,
    dimensionOptions,
  } as unknown as ComponentProps<typeof Control>;

  render(<Control {...props} />);
  return { setControlValue };
}

test('renders through the Control host when passed as a component', () => {
  renderControl();
  expect(screen.getByText('Series style rules')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /add rule/i })).toBeInTheDocument();
});

test('says so when there are no rules yet', () => {
  renderControl();
  expect(screen.getByText(/no rules yet/i)).toBeInTheDocument();
});

test('adding a rule seeds it with the first metric not already used', async () => {
  const { setControlValue } = renderControl([
    { key: { kind: 'metric', metric: 'SUM(sales)' }, role: SeriesRole.Actual },
  ]);

  await userEvent.click(screen.getByRole('button', { name: /add rule/i }));

  expect(setControlValue).toHaveBeenCalledWith(
    'series_style_rules',
    [
      {
        key: { kind: 'metric', metric: 'SUM(sales)' },
        role: SeriesRole.Actual,
      },
      { key: { kind: 'metric', metric: 'SUM(plan)' }, role: SeriesRole.Actual },
    ],
    undefined,
  );
});

test('removing a rule drops just that rule', async () => {
  const { setControlValue } = renderControl([
    { key: { kind: 'metric', metric: 'SUM(sales)' }, role: SeriesRole.Actual },
    { key: { kind: 'metric', metric: 'SUM(plan)' }, role: SeriesRole.Plan },
  ]);

  const removeButtons = screen.getAllByRole('button', { name: /remove rule/i });
  await userEvent.click(removeButtons[0]);

  expect(setControlValue).toHaveBeenCalledWith(
    'series_style_rules',
    [{ key: { kind: 'metric', metric: 'SUM(plan)' }, role: SeriesRole.Plan }],
    undefined,
  );
});

test('shows a metric under the verbose name the legend uses', () => {
  renderControl([
    { key: { kind: 'metric', metric: 'SUM(sales)' }, role: SeriesRole.Actual },
  ]);
  expect(screen.getByText('Total sales')).toBeInTheDocument();
});

test('the fill dropdown shows the role default rather than an empty box', () => {
  // Plan defaults to outline, and no explicit fillStyle is set on the rule.
  renderControl([
    { key: { kind: 'metric', metric: 'SUM(plan)' }, role: SeriesRole.Plan },
  ]);
  expect(screen.getByText('Outline')).toBeInTheDocument();
});

test('still shows a rule whose metric the chart no longer has', () => {
  // Editing a chart can remove a metric out from under a saved rule. The row
  // has to keep showing its stored key so it can be seen and deleted, rather
  // than rendering blank and reading as data loss.
  renderControl([
    {
      key: { kind: 'metric', metric: 'SUM(removed)' },
      role: SeriesRole.Actual,
    },
  ]);
  expect(screen.getByText('SUM(removed)')).toBeInTheDocument();
});

test('still shows a pattern rule, which no dropdown group can offer', () => {
  renderControl([
    { key: { kind: 'pattern', pattern: '^SUM' }, role: SeriesRole.Forecast },
  ]);
  expect(screen.getByText('/^SUM/')).toBeInTheDocument();
});

test('reads rules saved as a JSON string by the earlier text control', () => {
  renderControl(
    JSON.stringify([
      { key: { kind: 'metric', metric: 'SUM(sales)' }, role: 'actual' },
    ]),
  );
  expect(screen.getByText('Total sales')).toBeInTheDocument();
});

test('cannot add a rule once every series already has one', async () => {
  // A second rule on the same series would never apply — the first match wins —
  // so there is nothing useful left to add.
  const { setControlValue } = renderControl([
    { key: { kind: 'metric', metric: 'SUM(sales)' }, role: SeriesRole.Actual },
    { key: { kind: 'metric', metric: 'SUM(plan)' }, role: SeriesRole.Plan },
    { key: { kind: 'dimension', value: 'EMEA' }, role: SeriesRole.Forecast },
  ]);

  const addButton = screen.getByRole('button', { name: /add rule/i });
  expect(addButton).toBeDisabled();

  await userEvent.click(addButton);
  expect(setControlValue).not.toHaveBeenCalled();
});

test('shows the hint for a chart that has no series to assign yet', () => {
  const setControlValue = jest.fn();
  const props = {
    type: SeriesStyleControl,
    name: 'series_style_rules',
    label: 'Series style rules',
    value: [],
    actions: { setControlValue },
    metricOptions: [],
    dimensionOptions: [],
  } as unknown as ComponentProps<typeof Control>;

  render(<Control {...props} />);

  expect(screen.getByText(/add a metric to the chart/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /add rule/i })).toBeDisabled();
});

test('falls back to a dimension value when only those are left uncovered', async () => {
  const { setControlValue } = renderControl([
    { key: { kind: 'metric', metric: 'SUM(sales)' }, role: SeriesRole.Actual },
    { key: { kind: 'metric', metric: 'SUM(plan)' }, role: SeriesRole.Plan },
  ]);

  await userEvent.click(screen.getByRole('button', { name: /add rule/i }));

  const added = setControlValue.mock.calls[0][1].at(-1);
  expect(added.key).toEqual({ kind: 'dimension', value: 'EMEA' });
});
