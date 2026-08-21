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
import BusinessMixedChartPlugin from '../../src/Mixed/BusinessMixedChartPlugin';
import controlPanel from '../../src/Mixed/controlPanel';
import { stockMixedPlugin } from '../../src/Mixed/stockMixed';

test('registers under the business_mixed key', () => {
  new BusinessMixedChartPlugin()
    .configure({ key: 'business_mixed' })
    .register();

  const metadata = getChartMetadataRegistry().get('business_mixed');
  expect(metadata).toBeDefined();
  expect(metadata?.name).toEqual('Business Mixed Chart');
});

test('declares two query objects', () => {
  // Without this the second query is never submitted and the chart is a more
  // elaborate way of drawing query A.
  const plugin = new BusinessMixedChartPlugin();
  expect(plugin.metadata.queryObjectCount).toBe(2);
});

test('borrows the stock Mixed query builder and render component', () => {
  const plugin = new BusinessMixedChartPlugin();
  expect(plugin.loadBuildQuery).toBeDefined();
  expect(plugin.loadChart).toBeDefined();
});

test('keeps every stock Mixed control section and appends its own', () => {
  const stockSections =
    stockMixedPlugin.controlPanel.controlPanelSections ?? [];
  const sections = controlPanel.controlPanelSections ?? [];

  expect(sections.slice(0, stockSections.length)).toEqual(stockSections);
  expect(sections.slice(stockSections.length).map(s => s?.label)).toEqual([
    'Business chart styling',
  ]);
});

test('the added section carries the same controls as the Bar chart', () => {
  // Both chart types share one section builder, so a control added to one is
  // added to both; this is what pins that.
  const sections = controlPanel.controlPanelSections ?? [];
  const added = sections[sections.length - 1];
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
    'hide_overlapping_labels',
  ]);
});

test('does not mutate the stock Mixed control panel', () => {
  const stockSections =
    stockMixedPlugin.controlPanel.controlPanelSections ?? [];
  expect(
    stockSections.some(
      (section: { label?: unknown } | null) =>
        section?.label === 'Business chart styling',
    ),
  ).toBe(false);
  expect(controlPanel).not.toBe(stockMixedPlugin.controlPanel);
});
