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
 * Control over the chart's "chrome" — gridlines, ticks, axis labels and the
 * axis line itself.
 *
 * The stock Timeseries transform hardcodes all of this
 * (`Timeseries/transformProps.ts`: `splitLine: { show: !isSmallChart }`,
 * `axisTick: { show: !isSmallChart }`), so none of it is reachable from a
 * control panel. A chart type whose whole point is a sparse, high-data-ink
 * look needs it, so this plugin patches the finished ECharts option — the same
 * hook the series styling already uses.
 */

/** An ECharts axis object, of the shape the Timeseries transform builds. */
interface AxisOption {
  splitLine?: { show?: boolean; [key: string]: unknown };
  axisTick?: { show?: boolean; [key: string]: unknown };
  axisLabel?: { show?: boolean; [key: string]: unknown };
  axisLine?: {
    show?: boolean;
    lineStyle?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ChromeOptions {
  /** Gridlines across the plot area. Undefined leaves the stock behaviour. */
  showGridlines?: boolean;
  /** The small ticks along both axes. */
  showAxisTicks?: boolean;
  /** Numbers along the value axis. Bar labels often make these redundant. */
  showValueAxisLabels?: boolean;
  /** Categories along the category axis. */
  showCategoryAxisLabels?: boolean;
  /** `ColorPickerControl` returns a hex string or an `{r,g,b,a}` object. */
  axisLineColor?: string | RgbColor;
  axisLineWidth?: number;
}

export interface RgbColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

/**
 * `ColorPickerControl` yields either a hex string or an `{r,g,b,a}` object
 * depending on how the value was set, so both have to be accepted.
 */
export function toCssColor(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const { r, g, b, a } = value as Record<string, number>;
    if ([r, g, b].every(channel => typeof channel === 'number')) {
      return `rgba(${r}, ${g}, ${b}, ${a ?? 1})`;
    }
  }
  return undefined;
}

/**
 * Patches one axis. Deliberately *subtractive*: a control only ever hides or
 * restyles, never forces something back on.
 *
 * That is what keeps the stock behaviour intact — upstream already hides
 * gridlines and ticks on a small chart, and writing `show: true` whenever the
 * checkbox is ticked would override that and put gridlines back on a chart too
 * small to carry them. Unticking then re-ticking therefore returns to the stock
 * default rather than to a forced-on state, which is the behaviour a user
 * expects from a checkbox that starts out ticked.
 */
function applyToAxis(
  axis: AxisOption | undefined,
  patch: {
    gridlines?: boolean;
    ticks?: boolean;
    labels?: boolean;
    lineStyle?: Record<string, unknown>;
  },
): AxisOption | undefined {
  if (!axis) return axis;
  const next: AxisOption = { ...axis };

  if (patch.gridlines === false) {
    next.splitLine = { ...next.splitLine, show: false };
  }
  if (patch.ticks === false) {
    next.axisTick = { ...next.axisTick, show: false };
  }
  if (patch.labels === false) {
    next.axisLabel = { ...next.axisLabel, show: false };
  }
  if (patch.lineStyle && Object.keys(patch.lineStyle).length) {
    next.axisLine = {
      ...next.axisLine,
      lineStyle: { ...next.axisLine?.lineStyle, ...patch.lineStyle },
    };
  }
  return next;
}

export interface ChromeableOptions {
  xAxis?: AxisOption;
  yAxis?: AxisOption;
  [key: string]: unknown;
}

/**
 * Applies chrome options to a finished ECharts option object.
 *
 * `isHorizontal` matters more than it looks. The Timeseries transform swaps the
 * two axes for a horizontal bar chart (`[xAxis, yAxis] = [yAxis, xAxis]`), so
 * `yAxis` is only the value axis when the chart is vertical. Gridlines belong
 * to the value axis in both orientations, so keying off `yAxis` directly would
 * silently do the wrong thing the moment someone flips the orientation.
 */
export function applyChartChrome<T extends ChromeableOptions>(
  echartOptions: T,
  chrome: ChromeOptions,
  isHorizontal = false,
): T {
  const lineStyle: Record<string, unknown> = {};
  const color = toCssColor(chrome.axisLineColor);
  if (color) lineStyle.color = color;
  if (typeof chrome.axisLineWidth === 'number') {
    lineStyle.width = chrome.axisLineWidth;
  }

  const valuePatch = {
    gridlines: chrome.showGridlines,
    ticks: chrome.showAxisTicks,
    labels: chrome.showValueAxisLabels,
    lineStyle,
  };
  const categoryPatch = {
    ticks: chrome.showAxisTicks,
    labels: chrome.showCategoryAxisLabels,
    lineStyle,
  };

  const [xPatch, yPatch] = isHorizontal
    ? [valuePatch, categoryPatch]
    : [categoryPatch, valuePatch];

  return {
    ...echartOptions,
    xAxis: applyToAxis(echartOptions.xAxis, xPatch),
    yAxis: applyToAxis(echartOptions.yAxis, yPatch),
  };
}

/**
 * Reads the chrome controls off chart props.
 *
 * Both casings are checked for the same reason the series rules are:
 * `ChartProps` runs form data through `convertKeysToCamelCase` and keeps the
 * original only on `rawFormData`, so a control named `show_gridlines` arrives
 * as `showGridlines` — and reading the snake_case key off `formData` finds
 * nothing, silently.
 */
export function readChromeOptions(chartProps: {
  formData?: Record<string, unknown>;
  rawFormData?: Record<string, unknown>;
}): ChromeOptions {
  const camel = chartProps.formData ?? {};
  const snake = chartProps.rawFormData ?? {};
  const read = (camelKey: string, snakeKey: string) =>
    camel[camelKey] ?? snake[snakeKey];

  const width = read('axisLineWidth', 'axis_line_width');
  const parsedWidth = width === '' || width == null ? undefined : Number(width);

  return {
    showGridlines: read('showGridlines', 'show_gridlines') as
      | boolean
      | undefined,
    showAxisTicks: read('showAxisTicks', 'show_axis_ticks') as
      | boolean
      | undefined,
    showValueAxisLabels: read(
      'showValueAxisLabels',
      'show_value_axis_labels',
    ) as boolean | undefined,
    showCategoryAxisLabels: read(
      'showCategoryAxisLabels',
      'show_category_axis_labels',
    ) as boolean | undefined,
    axisLineColor: read(
      'axisLineColor',
      'axis_line_color',
    ) as ChromeOptions['axisLineColor'],
    // A half-typed number in the control must not produce NaN in the option.
    axisLineWidth: Number.isFinite(parsedWidth)
      ? (parsedWidth as number)
      : undefined,
  };
}
