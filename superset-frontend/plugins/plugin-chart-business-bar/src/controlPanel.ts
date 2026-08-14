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
  ControlPanelConfig,
  ControlPanelSectionConfig,
} from '@superset-ui/chart-controls';
import { stockBarPlugin } from './stockBar';

const EXAMPLE_RULES = JSON.stringify(
  [
    { key: { kind: 'metric', metric: 'SUM(sales)' }, role: 'actual' },
    { key: { kind: 'metric', metric: 'SUM(plan)' }, role: 'plan' },
  ],
  null,
  2,
);

/**
 * Raw JSON for now. This proves the styling pipeline end to end before the
 * rule-row UI is built on top of the same `series_style_rules` field, so the
 * form data shape is settled before any UI depends on it.
 */
const seriesStyleSection: ControlPanelSectionConfig = {
  // Section labels are typed `ReactNode`, so this one cannot be deferred behind
  // an arrow function the way the control's own label and description are.
  label: t('Series style rules'),
  expanded: true,
  // Presentation only, so it belongs with the other Customize controls rather
  // than beside the query controls.
  tabOverride: 'customize',
  controlSetRows: [
    [
      {
        name: 'series_style_rules',
        config: {
          type: 'TextAreaControl',
          language: 'json',
          label: () => t('Series style rules'),
          default: '[]',
          // Styling needs no new data, so editing a rule re-renders from the
          // cached result instead of re-running the query.
          renderTrigger: true,
          offerEditInModal: true,
          minLines: 8,
          maxLines: 20,
          // The example is appended outside t(): a translatable string must be a
          // static literal, or it cannot be extracted for translation.
          description: () =>
            `${t(
              'JSON array of rules assigning a business role to a series. Each rule needs a key and a role; color and fillStyle are optional overrides of the role default. Roles: actual (solid), plan (outline), forecast (hatched), prior_year (grey), custom. Keys: {"kind":"metric","metric":"SUM(sales)"}, {"kind":"dimension","value":"EMEA"}, or {"kind":"pattern","pattern":"^SUM"}.',
            )} ${t('Example:')} ${EXAMPLE_RULES}`,
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
    seriesStyleSection,
  ],
};

export default controlPanel;
