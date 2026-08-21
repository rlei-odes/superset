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
 * How a line is stroked — the line's equivalent of {@link FillStyle}.
 *
 * A separate axis rather than a widening of `FillStyle`, because in a mixed
 * chart the *same* role appears as both shapes at once: the Z chart plots
 * monthly Plan as a bar and cumulative Plan as a line, and one rule has to
 * dress both. Collapsing the two into one field would force a rule to choose
 * which of its two series it styles.
 *
 * ECharts' `lineStyle.type` accepts these three names directly.
 */
export type LineType = 'solid' | 'dashed' | 'dotted';

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
  /** Overrides the role default, on series drawn as bars. */
  fillStyle?: FillStyle;
  /** Overrides the role default, on series drawn as lines. */
  lineType?: LineType;
}

/** Form data these charts add on top of their stock counterparts'. */
export interface BusinessChartFormData {
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
  /** Foreground ink, used for current-period bars. */
  colorText: string;
}

/**
 * Role defaults, resolved against the theme so they follow light and dark mode.
 *
 * The two halves are used differently, and the difference matters:
 *
 * - **`fillStyle` and `lineType` are render-time fallbacks.** A rule that names
 *   neither renders with its role's treatment for whichever shape the series
 *   turned out to be, and the control shows that as the Select's placeholder.
 *   There is no need to opt out: every role has a sensible pair.
 * - **`color` is only a *seed*.** The control writes it into the rule when a
 *   role is chosen, so it lands in the saved value where it can be edited or
 *   cleared. `resolveStyle` deliberately does **not** fall back to it, because
 *   the clear button writes `undefined` — if the role colour were also a
 *   fallback, "cleared" and "never set" would be the same state and the colour
 *   could never actually be removed.
 *
 * The greyscale is deliberate: this chart type reserves colour for emphasis
 * rather than for cycling categories, so the palette is not used to distinguish
 * roles. A rule can still pin any colour it likes.
 */
export function getRoleDefaults(theme: RoleThemeTokens): Record<
  SeriesRole,
  {
    fillStyle: FillStyle;
    lineType: LineType;
    color?: string;
  }
> {
  /*
   * The fill and the line treatment say the same thing in two vocabularies:
   * a solid bar and a solid line are both "this happened"; a hollow bar and a
   * dashed line are both "this is intended"; a hatched bar and a dotted line
   * are both "this is a guess". A Z chart shows a role as both shapes at once,
   * so the pair has to read as one statement rather than two.
   */
  return {
    [SeriesRole.Actual]: {
      fillStyle: 'solid',
      lineType: 'solid',
      color: theme.colorText,
    },
    [SeriesRole.Plan]: {
      fillStyle: 'outline',
      lineType: 'dashed',
      color: theme.colorText,
    },
    [SeriesRole.Forecast]: {
      fillStyle: 'hatched',
      lineType: 'dotted',
      color: theme.colorText,
    },
    [SeriesRole.PriorYear]: {
      fillStyle: 'solid',
      lineType: 'solid',
      color: theme.colorTextTertiary,
    },
    [SeriesRole.Custom]: { fillStyle: 'solid', lineType: 'solid' },
  };
}
