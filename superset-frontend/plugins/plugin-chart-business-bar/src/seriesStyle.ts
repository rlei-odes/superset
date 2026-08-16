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
import {
  FillStyle,
  getRoleDefaults,
  RoleThemeTokens,
  SeriesStyleRule,
  SeriesStyleRuleKey,
} from './types';

/**
 * Superset flattens pivoted columns to `"<metric>, <groupby>, <groupby>"`, with
 * commas inside a value escaped as `\,`.
 *
 * Verified against `superset/utils/pandas_postprocessing`: the separator is
 * `FLAT_COLUMN_SEPARATOR = ", "` (utils.py) and the escaping is
 * `str.replace(",", "\\,")` (`escape_separator`). Metric comes first.
 */
const SEPARATOR = ', ';

/** Mirrors Python's `escape_separator`, so rule values compare like for like. */
export function escapeSeparator(value: string): string {
  return value.replace(',', '\\,');
}

/** Splits on the separator without breaking on escaped commas. */
export function splitSeriesName(seriesName: string): string[] {
  return seriesName.split(/(?<!\\), /);
}

/**
 * A series belongs to a metric when its name is exactly the metric label (no
 * groupby) or begins with it (grouped). Comparing against the escaped label
 * keeps metrics containing a comma — `AVG(a, b)` — matching correctly.
 *
 * A rule stores the metric's own label, but the series name may carry the
 * dataset's `verbose_name` for it instead, so both are tried. Upstream is
 * genuinely inconsistent here: the pivoted columns are renamed to verbose names
 * (`rebaseForecastDatum`), and the Timeseries transform then maps the name back
 * through an inverted verbose map — but only on an exact whole-name hit
 * (`Timeseries/transformProps.ts`, `inverted[entryName] || entryName`). So an
 * ungrouped series ends up named `SUM(sales)` while the same metric grouped by
 * region ends up `Total sales, EMEA`. Matching only one of the two would make
 * rules work until a groupby was added, then silently stop.
 */
export function matchesRuleKey(
  seriesName: string,
  key: SeriesStyleRuleKey,
  verboseMap: Record<string, string> = {},
): boolean {
  if (key.kind === 'metric') {
    const aliases = [key.metric, verboseMap[key.metric]].filter(Boolean);
    return aliases.some(alias => {
      const metric = escapeSeparator(alias as string);
      return seriesName === metric || seriesName.startsWith(metric + SEPARATOR);
    });
  }
  if (key.kind === 'dimension') {
    /*
     * Segment 0 is normally the metric, so dimension values occupy the rest —
     * but only when there is more than one segment.
     *
     * With a *single* metric and a groupby, Superset drops the metric from the
     * series name entirely: one metric grouped by `scenario` yields series
     * named `Plan` and `Actual`, not `Revenue, Plan`. Skipping segment 0
     * unconditionally therefore left nothing to match against, and dimension
     * rules silently did nothing on exactly the shape they were designed for.
     * Found on real data; the fixture used to test this had two metrics.
     */
    const segments = splitSeriesName(seriesName);
    const candidates = segments.length > 1 ? segments.slice(1) : segments;
    return candidates.includes(escapeSeparator(key.value));
  }
  try {
    return new RegExp(key.pattern).test(seriesName);
  } catch {
    // A half-typed regex in the control should not blank the chart.
    return false;
  }
}

/**
 * Normalises whatever the control put in form data into a rule array.
 *
 * While the rules are edited as raw JSON the value arrives as a string, and a
 * user mid-edit will frequently have it unparseable. Once the rule-row UI
 * replaces the JSON control the value will already be an array, so both are
 * accepted. Anything unusable yields no rules, which renders as a stock Bar
 * chart — never a blank one.
 */
export function parseSeriesStyleRules(raw: unknown): SeriesStyleRule[] {
  if (Array.isArray(raw)) {
    return raw as SeriesStyleRule[];
  }
  if (typeof raw !== 'string' || !raw.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SeriesStyleRule[]) : [];
  } catch {
    return [];
  }
}

/**
 * Reads the rules off chart props, from either casing of the form data key.
 *
 * `ChartProps` stores form data twice: `formData` is run through
 * `convertKeysToCamelCase` (ChartProps.ts, `this.formData =
 * convertKeysToCamelCase(formData)`) while `rawFormData` keeps the original
 * snake_case. The control registers the field as `series_style_rules`, so it
 * arrives as `seriesStyleRules` on `formData` and `series_style_rules` on
 * `rawFormData`. Reading only the snake_case key off `formData` silently finds
 * nothing — the styling appears to do nothing at all.
 */
export function readSeriesStyleRules(chartProps: {
  formData?: Record<string, unknown>;
  rawFormData?: Record<string, unknown>;
}): SeriesStyleRule[] {
  return parseSeriesStyleRules(
    chartProps.formData?.seriesStyleRules ??
      chartProps.rawFormData?.series_style_rules,
  );
}

/** First matching rule wins, so earlier rows can override later ones. */
export function findRule(
  seriesName: string,
  rules: SeriesStyleRule[],
  verboseMap: Record<string, string> = {},
): SeriesStyleRule | undefined {
  return rules.find(rule => matchesRuleKey(seriesName, rule.key, verboseMap));
}

/**
 * Resolves a rule against its theme-derived role defaults.
 *
 * Fill falls back to the role's treatment; colour does not. The control seeds a
 * role's colour into the rule itself, and its clear button writes `undefined` —
 * so falling back here would make "cleared" indistinguishable from "never set"
 * and the colour impossible to remove. An unset colour means exactly that: let
 * the colour scheme decide.
 */
export function resolveStyle(
  rule: SeriesStyleRule,
  theme: RoleThemeTokens,
): {
  fillStyle: FillStyle;
  color?: string;
} {
  const roleDefaults = getRoleDefaults(theme);
  const defaults = roleDefaults[rule.role] ?? roleDefaults.custom;
  return {
    fillStyle: rule.fillStyle ?? defaults.fillStyle,
    color: rule.color,
  };
}

/**
 * Builds the ECharts `itemStyle` for a resolved rule.
 *
 * `baseColor` is whatever the colour scheme already assigned; a rule that does
 * not pin a colour keeps it, so role and palette stay independent.
 */
export function buildItemStyle(
  fillStyle: FillStyle,
  color: string | undefined,
  baseColor: string | undefined,
  theme: RoleThemeTokens,
): Record<string, unknown> {
  const effective = color ?? baseColor;

  if (fillStyle === 'outline') {
    return {
      color: 'transparent',
      borderColor: effective,
      borderWidth: 2,
      borderType: 'solid',
    };
  }
  if (fillStyle === 'hatched') {
    return {
      color: effective,
      // ECharts 6 DecalObject. Diagonal stripes in the container background
      // colour, so the hatching reads as gaps cut through the bar and follows
      // light and dark mode. Dense enough to say "provisional" at small bar
      // widths without muddying the hue.
      decal: {
        symbol: 'rect',
        dashArrayX: [1, 0],
        dashArrayY: [2, 4],
        rotation: -Math.PI / 4,
        color: theme.colorBgContainer,
      },
    };
  }
  return { color: effective };
}

/**
 * ECharts brightens bars on hover by default, which would make an outline bar
 * flash solid. Restating the resolved style as the emphasis style pins it.
 */
function buildEmphasisItemStyle(
  fillStyle: FillStyle,
  itemStyle: Record<string, unknown>,
): Record<string, unknown> {
  if (fillStyle === 'outline') {
    return { ...itemStyle, borderWidth: 3 };
  }
  return { ...itemStyle };
}

export interface StylableSeries {
  name?: string;
  itemStyle?: { color?: string; [key: string]: unknown };
  emphasis?: { itemStyle?: Record<string, unknown>; [key: string]: unknown };
  [key: string]: unknown;
}

/**
 * Applies role styling to an already-built ECharts series array. Series that no
 * rule matches are returned untouched, so an empty or partial rule set degrades
 * to the stock Bar chart rather than to a blank chart.
 */
export function applySeriesStyles<T extends StylableSeries>(
  series: T[],
  rules: SeriesStyleRule[],
  theme: RoleThemeTokens,
  verboseMap: Record<string, string> = {},
): T[] {
  if (!rules?.length) {
    return series;
  }

  return series.map(entry => {
    const name = typeof entry.name === 'string' ? entry.name : '';
    const rule = findRule(name, rules, verboseMap);
    if (!rule) {
      return entry;
    }

    const { fillStyle, color } = resolveStyle(rule, theme);
    const itemStyle = buildItemStyle(
      fillStyle,
      color,
      entry.itemStyle?.color,
      theme,
    );

    return {
      ...entry,
      itemStyle: { ...entry.itemStyle, ...itemStyle },
      emphasis: {
        ...entry.emphasis,
        itemStyle: {
          ...entry.emphasis?.itemStyle,
          ...buildEmphasisItemStyle(fillStyle, itemStyle),
        },
      },
    };
  });
}
