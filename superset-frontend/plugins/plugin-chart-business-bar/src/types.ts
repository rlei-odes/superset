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
 * The business meaning a series carries, independent of the colour a scheme
 * happens to assign it. Each role implies a default visual treatment, which the
 * user can override per rule.
 */
export enum SeriesRole {
  Actual = 'actual',
  Plan = 'plan',
  Forecast = 'forecast',
  PriorYear = 'prior_year',
  Custom = 'custom',
}

/** How a bar is filled. The semantic core of the chart type. */
export type FillStyle = 'solid' | 'outline' | 'hatched';

/**
 * How a rule identifies the series it applies to.
 *
 * A tagged union rather than a bare series-name string. Superset composes series
 * names from the metric and the groupby values (`"SUM(sales), EMEA"`), so an
 * exact-name rule silently stops matching the moment a groupby changes. Keying
 * on the metric or on a dimension value instead gives the user a closed set of
 * real choices, and survives regrouping.
 *
 * - `metric`    — wide data: Actual/Plan/Forecast are separate columns, so
 *                 separate metrics. The most common business-reporting shape.
 * - `dimension` — long/tidy data: a `scenario`-style column whose values name
 *                 the roles.
 * - `pattern`   — escape hatch for names neither of the above can express.
 */
export type SeriesStyleRuleKey =
  | { kind: 'metric'; metric: string }
  | { kind: 'dimension'; value: string }
  | { kind: 'pattern'; pattern: string };

export interface SeriesStyleRule {
  key: SeriesStyleRuleKey;
  role: SeriesRole;
  /** Overrides the role default. Omit to inherit the colour scheme's colour. */
  color?: string;
  /** Overrides the role default. */
  fillStyle?: FillStyle;
}

/** Form data this plugin adds on top of the stock Bar chart's. */
export interface BusinessBarFormData {
  series_style_rules?: SeriesStyleRule[];
}

/**
 * The theme values this plugin needs. Narrowed to the two tokens actually used
 * so tests can supply a plain object instead of a whole `SupersetTheme`.
 */
export interface RoleThemeTokens {
  /** Muted grey for prior-period reference bars. */
  colorTextTertiary: string;
  /** Container background, used for the stripes cut through a hatched bar. */
  colorBgContainer: string;
}

/**
 * Role defaults, resolved against the theme so they follow light and dark mode.
 *
 * Only Prior Year pins a colour. For every other role the treatment (solid /
 * outline / hatched) carries the meaning and the colour is left to the scheme —
 * which is the entire point of the chart type: role and colour stay orthogonal.
 * Prior year is the exception because "last year, for reference" is conveyed by
 * desaturation, not by fill.
 */
export function getRoleDefaults(
  theme: RoleThemeTokens,
): Record<SeriesRole, { fillStyle: FillStyle; color?: string }> {
  return {
    [SeriesRole.Actual]: { fillStyle: 'solid' },
    [SeriesRole.Plan]: { fillStyle: 'outline' },
    [SeriesRole.Forecast]: { fillStyle: 'hatched' },
    [SeriesRole.PriorYear]: {
      fillStyle: 'solid',
      color: theme.colorTextTertiary,
    },
    [SeriesRole.Custom]: { fillStyle: 'solid' },
  };
}
