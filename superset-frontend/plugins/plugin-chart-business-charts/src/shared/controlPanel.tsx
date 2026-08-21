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
import { t } from '@apache-superset/core/translation';
import {
  ControlPanelSectionConfig,
  ControlPanelState,
  ControlState,
  ControlSubSectionHeader,
  Dataset,
  ExtraControlProps,
} from '@superset-ui/chart-controls';
import SeriesStyleControl from './controls/SeriesStyleControl';

/**
 * `verbose_map` is a Dataset field; a QueryResponse datasource (SQL Lab) has no
 * such thing. Absent, metric labels are shown and matched raw, which is correct
 * for that case.
 */
export function getVerboseMap(
  datasource: ControlPanelState['datasource'],
): Record<string, string> {
  return (datasource as Dataset)?.verbose_map ?? {};
}

/**
 * The shape of a chart state as far as the rules control cares: the last query
 * responses, whose `colnames` are the only place the dimension *values* on the
 * chart can be read from.
 *
 * `chartState` is typed `AnyDict` upstream, with a standing TODO to tighten it,
 * so a chart type narrows it at the call site rather than here.
 */
export interface QueriesChartState {
  queriesResponse?: ({ colnames?: string[] } | null)[] | null;
}

/** What a chart type has to supply to get the shared styling section. */
export interface BusinessStylingSectionOptions {
  /** Describes the rules control. Differs per chart: bars fill, lines stroke. */
  styleDescription: () => string;
  /** Feeds the rules control its options and any warning. */
  styleMapStateToProps: (
    state: ControlPanelState,
    controlState: ControlState,
    chartState?: QueriesChartState,
  ) => ExtraControlProps;
  /** Describes the ordering checkbox, which has one metric list or two. */
  orderDescription: string;
}

/**
 * Everything these chart types add on top of their stock counterpart, in one
 * section.
 *
 * One section with `ControlSubSectionHeader` dividers is Superset's own idiom —
 * "Chart Options" groups Legend / Tooltip / Series Order this way, "Advanced
 * analytics" groups Rolling window / Time comparison / Resample. Two top-level
 * sections would also have meant the section and the rules control shared the
 * name "Series style rules", printing the same title twice.
 *
 * The rules control keeps its own `ControlHeader` rather than getting a
 * subsection header, because that header already carries its description
 * tooltip and the instant-render bolt; a divider above it would just repeat the
 * words.
 */
export function buildBusinessStylingSection(
  options: BusinessStylingSectionOptions,
): ControlPanelSectionConfig {
  return {
    // Section labels are typed `ReactNode`, so this one cannot be deferred
    // behind an arrow function the way the control's own label and description
    // are.
    label: t('Business chart styling'),
    expanded: true,
    // Presentation only, so it belongs with the other Customize controls rather
    // than beside the query controls.
    tabOverride: 'customize',
    controlSetRows: [
      [
        {
          name: 'series_style_rules',
          config: {
            // A component rather than a registry string. `Control.tsx` accepts
            // either (`typeof type === 'string' ? controlMap[type] : type`),
            // which is what lets this control ship inside the plugin instead of
            // needing a core registration.
            type: SeriesStyleControl,
            label: () => t('Series style rules'),
            default: [],
            // Styling needs no new data, so editing a rule re-renders from the
            // cached result instead of re-running the query.
            renderTrigger: true,
            description: options.styleDescription,
            shouldMapStateToProps() {
              return true;
            },
            mapStateToProps: options.styleMapStateToProps,
          },
        },
      ],

      /*
       * Superset always sorts series and cannot be told not to:
       * `sort_series_type` defaults to `'sum'`, and clearing it falls through
       * to sorting by name rather than disabling the sort. There is no "as
       * defined" choice, because the sorting happens in `extractSeries`, a
       * layer that never sees the metric list.
       *
       * Defaulted on: a semantic sequence — Actual, Plan, Forecast — is the
       * point of these chart types, and a value-sorted one reshuffles whenever
       * the numbers move.
       */
      [
        {
          name: 'series_order_as_defined',
          config: {
            type: 'CheckboxControl',
            label: t('Order series as defined'),
            default: true,
            renderTrigger: true,
            description: options.orderDescription,
          },
        },
      ],

      /*
       * Chrome subsection.
       *
       * All of this is hardcoded in the stock transforms, so none of it can be
       * reached by inheriting a stock control panel — these controls exist only
       * because these plugins post-process the finished ECharts option.
       *
       * The checkboxes default to `true` and are *subtractive*: unticking
       * hides, re-ticking returns to the stock behaviour rather than forcing
       * the element on. That matters because upstream already hides gridlines
       * and ticks on a small chart, and a forced-on state would override it.
       */
      [
        <ControlSubSectionHeader key="chrome">
          {t('Chart chrome')}
        </ControlSubSectionHeader>,
      ],
      [
        {
          name: 'show_gridlines',
          config: {
            type: 'CheckboxControl',
            label: t('Gridlines'),
            // Off by default: these chart types exist for a sparse,
            // high-data-ink look. Existing charts store their own value and are
            // unaffected.
            default: false,
            renderTrigger: true,
            description: t('Lines across the plot area, on the value axis.'),
          },
        },
      ],
      [
        {
          name: 'show_axis_ticks',
          config: {
            type: 'CheckboxControl',
            label: t('Axis ticks'),
            default: false,
            renderTrigger: true,
            description: t('The small marks along both axes.'),
          },
        },
      ],
      [
        {
          name: 'show_value_axis_labels',
          config: {
            type: 'CheckboxControl',
            label: t('Value axis labels'),
            default: false,
            renderTrigger: true,
            description: t(
              'The numbers along the value axis. Often redundant when values are shown on the bars.',
            ),
          },
        },
      ],
      [
        {
          name: 'show_category_axis_labels',
          config: {
            type: 'CheckboxControl',
            label: t('Category axis labels'),
            default: true,
            renderTrigger: true,
            description: t('The category names along the other axis.'),
          },
        },
      ],
      [
        {
          name: 'axis_line_color',
          config: {
            type: 'ColorPickerControl',
            label: t('Axis line color'),
            // A mid grey, deliberately readable against both a light and a dark
            // background. Clearing it hands the line back to the theme.
            default: { r: 147, g: 147, b: 147, a: 1 },
            renderTrigger: true,
            description: t(
              'Colors the axis line where it is drawn. Leave unset to follow the theme.',
            ),
          },
        },
      ],
      [
        {
          name: 'axis_line_width',
          config: {
            type: 'TextControl',
            label: t('Axis line width'),
            isInt: true,
            // A baseline heavy enough to read as the chart's ground line, which
            // is what carries the structure once gridlines are off.
            default: 4,
            renderTrigger: true,
            description: t('Thickness of the axis line, in pixels.'),
          },
        },
      ],
      /*
       * The one chrome control that adds rather than subtracts, so it defaults
       * off: ticking it writes `labelLayout.hideOverlap` onto every series,
       * where upstream writes nothing at all. Off by default therefore means
       * "stock behaviour", the same guarantee the checkboxes above give — it
       * just reads inverted, because here stock is the noisier option.
       */
      [
        {
          name: 'hide_overlapping_labels',
          config: {
            type: 'CheckboxControl',
            label: t('Hide overlapping value labels'),
            default: false,
            renderTrigger: true,
            description: t(
              'Drop a value label rather than print it over one already drawn. Which label survives a collision is ECharts’ choice, so a specific value is not guaranteed to stay.',
            ),
          },
        },
      ],
    ],
  };
}
