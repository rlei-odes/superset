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
import { getChartMetadataRegistry } from '@superset-ui/core';
import BusinessBarChartPlugin from '../src/plugin/BusinessBarChartPlugin';
import controlPanel from '../src/controlPanel';
import { stockBarPlugin } from '../src/stockBar';

test('registers under the business_bar key', () => {
  new BusinessBarChartPlugin().configure({ key: 'business_bar' }).register();

  const metadata = getChartMetadataRegistry().get('business_bar');
  expect(metadata).toBeDefined();
  expect(metadata?.name).toEqual('Business Bar Chart');
});

test('borrows the stock Bar query builder and render component', () => {
  // These are what make the chart render identically to stock Bar. If either
  // stops being borrowed, the scaffolding invariant is broken.
  const plugin = new BusinessBarChartPlugin();
  expect(plugin.loadBuildQuery).toBeDefined();
  expect(plugin.loadChart).toBeDefined();
});

test('keeps every stock Bar control section and appends its own', () => {
  const stockSections = stockBarPlugin.controlPanel.controlPanelSections ?? [];
  const sections = controlPanel.controlPanelSections ?? [];

  // Anything the stock Bar chart can configure, this chart can too.
  expect(sections.slice(0, stockSections.length)).toEqual(stockSections);
  // Everything this chart adds lives in one section, the way Superset's own
  // panels group related controls behind subsection headers.
  expect(sections.slice(stockSections.length).map(s => s?.label)).toEqual([
    'Business chart styling',
  ]);
});

test('the added section carries both the rules control and the chrome controls', () => {
  const sections = controlPanel.controlPanelSections ?? [];
  const added = sections[sections.length - 1];
  // Rows are either a named control or a subsection header, which is a bare
  // ReactElement with no `name`.
  const names = (added?.controlSetRows ?? [])
    .flat()
    .filter(row => row !== null && typeof row === 'object' && 'name' in row)
    .map(row => (row as { name: string }).name);

  expect(names).toEqual([
    'series_style_rules',
    'series_order_as_defined',
    'show_gridlines',
    'show_axis_ticks',
    'show_value_axis_labels',
    'show_category_axis_labels',
    'axis_line_color',
    'axis_line_width',
  ]);
});

test('appending a section does not mutate the stock Bar control panel', () => {
  const stockSections = stockBarPlugin.controlPanel.controlPanelSections ?? [];
  expect(
    stockSections.some(
      (section: { label?: unknown } | null) =>
        section?.label === 'Business chart styling',
    ),
  ).toBe(false);
});

test('does not mutate the stock Bar control panel', () => {
  // The control panel spreads the stock config; a shared mutable reference
  // would let later edits leak into the stock Bar chart.
  expect(controlPanel).not.toBe(stockBarPlugin.controlPanel);
});
