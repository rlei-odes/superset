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
  ensureIsArray,
  getColumnLabel,
  getMetricLabel,
  QueryFormColumn,
  QueryFormMetric,
} from '@superset-ui/core';
import {
  ControlPanelConfig,
  ControlPanelState,
} from '@superset-ui/chart-controls';
import {
  buildBusinessStylingSection,
  getVerboseMap,
} from '../shared/controlPanel';
import {
  getDimensionKeyOptions,
  getMetricKeyOptions,
  mergeRuleKeyOptions,
} from '../shared/controls/ruleOptions';
import { stockMixedPlugin } from './stockMixed';

/** The Mixed chart's two metric controls, in query order. */
const METRIC_CONTROLS = ['metrics', 'metrics_b'] as const;

function readMetrics(
  state: ControlPanelState,
  control: string,
): QueryFormMetric[] {
  return ensureIsArray(
    state?.controls?.[control]?.value as QueryFormMetric[] | undefined,
  );
}

const businessStylingSection = buildBusinessStylingSection({
  styleDescription: () =>
    t(
      'Assign a business role to a series. The role sets how the series is drawn — a bar is filled solid (actual), hollow (plan) or hatched (forecast), and a line is stroked solid, dashed or dotted to match — while the color scheme still picks the color. One rule covers both queries, so a metric plotted as a monthly bar and as a cumulative line reads as one role. Treatment and color can be overridden per rule.',
    ),
  orderDescription: t(
    'Show series in the order the metrics are listed, instead of the order "Sort Series By" produces. Each query is ordered against its own metric list. Within one metric, groupby values keep their existing order.',
  ),
  styleMapStateToProps(state, _controlState, chart) {
    const verboseMap = getVerboseMap(state?.datasource);
    const metricsByQuery = METRIC_CONTROLS.map(control =>
      readMetrics(state, control),
    );

    /*
     * Both queries contribute options, merged into one list.
     *
     * A rule keys on a metric or a dimension value, not on a query, so which of
     * the two a series came from is not something the user should have to pick
     * — and in the Z-chart shape the *same* metric appears in both, once as a
     * monthly bar and once as a running total line. One rule dressing both is
     * the intended behaviour, not a collision.
     */
    const metricOptions = mergeRuleKeyOptions(
      ...metricsByQuery.map((metrics, queryIndex) =>
        getMetricKeyOptions(
          metrics,
          verboseMap,
          chart?.queriesResponse?.[queryIndex]?.colnames ?? [],
        ),
      ),
    );

    // The x-axis is shared between the two queries; the metric labels are not.
    const notSeries = [
      getColumnLabel(state?.controls?.x_axis?.value as QueryFormColumn),
      ...metricsByQuery.flat().map(getMetricLabel),
    ];
    const dimensionOptions = mergeRuleKeyOptions(
      ...metricsByQuery.map((_metrics, queryIndex) =>
        getDimensionKeyOptions(
          chart?.queriesResponse?.[queryIndex]?.colnames ?? [],
          notSeries,
        ),
      ),
    );

    /*
     * `showLineType` is unconditional, not derived from the two `Series type`
     * controls: both shapes are on the table whichever way they currently
     * point, a rule outlives a switch from bar to line, and hiding the override
     * would quietly drop the treatment it holds.
     *
     * No `colorByPrimaryAxis` warning here either — that control belongs to the
     * stock Bar panel and the Mixed panel does not carry it, so there is no
     * mode in which these rules are silently dropped.
     */
    return { metricOptions, dimensionOptions, showLineType: true };
  },
});

const controlPanel: ControlPanelConfig = {
  ...(stockMixedPlugin.controlPanel as ControlPanelConfig),
  controlPanelSections: [
    ...((stockMixedPlugin.controlPanel as ControlPanelConfig)
      .controlPanelSections ?? []),
    businessStylingSection,
  ],
};

export default controlPanel;
