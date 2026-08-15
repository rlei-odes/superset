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
import { QueryFormMetric } from '@superset-ui/core';
import {
  ControlPanelConfig,
  ControlPanelSectionConfig,
  ControlPanelState,
  ControlSubSectionHeader,
  Dataset,
} from '@superset-ui/chart-controls';
import SeriesStyleControl from './controls/SeriesStyleControl';
import {
  getDimensionKeyOptions,
  getMetricKeyOptions,
} from './controls/ruleOptions';
import { stockBarPlugin } from './stockBar';

/**
 * `verbose_map` is a Dataset field; a QueryResponse datasource (SQL Lab) has no
 * such thing. Absent, metric labels are shown and matched raw, which is correct
 * for that case.
 */
function getVerboseMap(
  datasource: ControlPanelState['datasource'],
): Record<string, string> {
  return (datasource as Dataset)?.verbose_map ?? {};
}

/**
 * Everything this chart adds on top of a stock Bar chart, in one section.
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
const businessStylingSection: ControlPanelSectionConfig = {
  // Section labels are typed `ReactNode`, so this one cannot be deferred behind
  // an arrow function the way the control's own label and description are.
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
          description: () =>
            t(
              'Assign a business role to a series. The role sets how the bar is filled — actual (solid), plan (outline), forecast (hatched), prior year (grey) — while the color scheme still picks the color. Fill and color can be overridden per rule.',
            ),
          shouldMapStateToProps() {
            return true;
          },
          mapStateToProps(state: ControlPanelState, _, chart) {
            const verboseMap = getVerboseMap(state?.datasource);
            const { colnames } = chart?.queriesResponse?.[0] ?? {};

            return {
              metricOptions: getMetricKeyOptions(
                state?.controls?.metrics?.value as
                  | QueryFormMetric[]
                  | undefined,
                verboseMap,
              ),
              dimensionOptions: getDimensionKeyOptions(colnames ?? []),
              /*
               * `colorByPrimaryAxis` colors each bar individually and drops
               * `itemStyle` from the series entirely, so role styling cannot
               * apply at all in that mode. `transformProps` ignores the rules
               * rather than half-applying them; without this warning that
               * looks like the control is broken.
               */
              warning: state?.controls?.color_by_primary_axis?.value
                ? t(
                    'Ignored while "Color by primary axis" is on, which colors every bar individually.',
                  )
                : undefined,
            };
          },
        },
      },
    ],

    /*
     * Chrome subsection.
     *
     * All of this is hardcoded in the stock Timeseries transform, so none of it
     * can be reached by inheriting the Bar panel — these controls exist only
     * because this plugin post-processes the finished ECharts option.
     *
     * The checkboxes default to `true` and are *subtractive*: unticking hides,
     * re-ticking returns to the stock behaviour rather than forcing the element
     * on. That matters because upstream already hides gridlines and ticks on a
     * small chart, and a forced-on state would override it.
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
          default: true,
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
          default: true,
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
          default: true,
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
          renderTrigger: true,
          description: t('Thickness of the axis line, in pixels.'),
        },
      },
    ],
  ],
};

const controlPanel: ControlPanelConfig = {
  ...(stockBarPlugin.controlPanel as ControlPanelConfig),
  controlPanelSections: [
    ...((stockBarPlugin.controlPanel as ControlPanelConfig)
      .controlPanelSections ?? []),
    businessStylingSection,
  ],
};

export default controlPanel;
