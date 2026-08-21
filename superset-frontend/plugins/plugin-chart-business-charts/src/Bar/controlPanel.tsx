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
import { ControlPanelConfig } from '@superset-ui/chart-controls';
import {
  buildBusinessStylingSection,
  getVerboseMap,
} from '../shared/controlPanel';
import {
  getDimensionKeyOptions,
  getMetricKeyOptions,
} from '../shared/controls/ruleOptions';
import { stockBarPlugin } from './stockBar';

const businessStylingSection = buildBusinessStylingSection({
  styleDescription: () =>
    t(
      'Assign a business role to a series. The role sets how the bar is filled — actual (solid), plan (outline), forecast (hatched), prior year (grey) — while the color scheme still picks the color. Fill and color can be overridden per rule.',
    ),
  orderDescription: t(
    'Show series in the order the metrics are listed, instead of the order "Sort Series By" produces. Within one metric, groupby values keep their existing order.',
  ),
  styleMapStateToProps(state, _controlState, chart) {
    const verboseMap = getVerboseMap(state?.datasource);
    const { colnames } = chart?.queriesResponse?.[0] ?? {};
    const metrics = state?.controls?.metrics?.value as
      | QueryFormMetric[]
      | undefined;

    return {
      /*
       * Passing the column names lets a metric that the query truncated away be
       * dropped, rather than offered as a rule that could never match. See
       * `getMetricKeyOptions`.
       */
      metricOptions: getMetricKeyOptions(metrics, verboseMap, colnames ?? []),
      /*
       * The x-axis column and the metrics are columns too, but they are not
       * series. Naming them lets a single truncated metric's columns — bare
       * dimension values — be read without mistaking the axis for one.
       */
      dimensionOptions: getDimensionKeyOptions(colnames ?? [], [
        getColumnLabel(state?.controls?.x_axis?.value as QueryFormColumn),
        ...ensureIsArray(metrics).map(getMetricLabel),
      ]),
      /*
       * `colorByPrimaryAxis` colors each bar individually and drops `itemStyle`
       * from the series entirely, so role styling cannot apply at all in that
       * mode. `transformProps` ignores the rules rather than half-applying
       * them; without this warning that looks like the control is broken.
       */
      warning: state?.controls?.color_by_primary_axis?.value
        ? t(
            'Ignored while "Color by primary axis" is on, which colors every bar individually.',
          )
        : undefined,
    };
  },
});

const controlPanel: ControlPanelConfig = {
  ...(stockBarPlugin.controlPanel as ControlPanelConfig),
  controlPanelSections: [
    ...((stockBarPlugin.controlPanel as ControlPanelConfig)
      .controlPanelSections ?? []),
    businessStylingSection,
  ],
};

export default controlPanel;
