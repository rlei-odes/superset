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
  ensureIsArray,
  getMetricLabel,
  QueryFormMetric,
} from '@superset-ui/core';
import { splitSeriesName } from '../seriesStyle';
import { SeriesStyleRule, SeriesStyleRuleKey } from '../types';

/** One choice in the rule's "applies to" dropdown. */
export interface RuleKeyOption {
  /** Encoded key, round-tripped through {@link decodeRuleKey}. */
  value: string;
  label: string;
}

/**
 * Rule keys are a tagged union but a Select value has to be a scalar, so the
 * key is encoded as `<kind>:<value>`.
 *
 * Split on the *first* colon only: a kind never contains one, while a metric
 * label routinely does (`CAST(x AS TIME): total`).
 */
export function encodeRuleKey(key: SeriesStyleRuleKey): string {
  if (key.kind === 'metric') return `metric:${key.metric}`;
  if (key.kind === 'dimension') return `dimension:${key.value}`;
  return `pattern:${key.pattern}`;
}

export function decodeRuleKey(encoded: string): SeriesStyleRuleKey | undefined {
  const separator = encoded.indexOf(':');
  if (separator === -1) return undefined;
  const kind = encoded.slice(0, separator);
  const value = encoded.slice(separator + 1);
  if (kind === 'metric') return { kind: 'metric', metric: value };
  if (kind === 'dimension') return { kind: 'dimension', value };
  if (kind === 'pattern') return { kind: 'pattern', pattern: value };
  return undefined;
}

/**
 * The metrics currently on the chart, as rule keys.
 *
 * The stored value is the metric's *label* (`SUM(sales)`, or an ad-hoc metric's
 * custom label) because that is what Superset names the series after. The
 * displayed label prefers the dataset's verbose name, since that is what the
 * user sees in the legend — the two differ often enough that showing the raw
 * label would make the dropdown hard to match against the chart.
 */
export function getMetricKeyOptions(
  metrics: QueryFormMetric | QueryFormMetric[] | undefined,
  verboseMap: Record<string, string> = {},
): RuleKeyOption[] {
  const seen = new Set<string>();
  return ensureIsArray(metrics)
    .map(getMetricLabel)
    .filter(label => {
      if (!label || seen.has(label)) return false;
      seen.add(label);
      return true;
    })
    .map(label => ({
      value: encodeRuleKey({ kind: 'metric', metric: label }),
      label: verboseMap[label] ?? label,
    }));
}

/**
 * Dimension values observed in the last query result, as rule keys.
 *
 * Read off the response's column names rather than the groupby control: the
 * control names the *column* (`region`), while a rule keys on a *value*
 * (`EMEA`), and only the data knows which values are present. Segment 0 of a
 * flattened column name is the metric, so the dimension values are what
 * follows.
 *
 * Empty until the chart has run once, which is the honest state — before then
 * there is nothing to enumerate.
 */
export function getDimensionKeyOptions(
  colnames: string[] = [],
): RuleKeyOption[] {
  const values = new Set<string>();
  colnames.forEach(colname => {
    splitSeriesName(colname)
      .slice(1)
      .forEach(value => {
        if (value) values.add(value);
      });
  });
  return [...values].map(value => ({
    value: encodeRuleKey({ kind: 'dimension', value }),
    label: value,
  }));
}

/**
 * Human-readable form of a key that no dropdown group offers.
 *
 * Covers two cases that must not silently vanish from the UI: a `pattern` rule,
 * which has no enumerable option list, and a rule left over from a metric or
 * dimension the chart no longer has. Both keep rendering their stored value, so
 * the user can see and delete them instead of finding a blank row.
 */
export function describeRuleKey(key: SeriesStyleRuleKey): string {
  if (key.kind === 'metric') return key.metric;
  if (key.kind === 'dimension') return key.value;
  return `/${key.pattern}/`;
}

/** A dropdown group, as antd's grouped `options` prop expects it. */
export interface RuleKeyOptionGroup {
  label: string;
  title: string;
  options: (RuleKeyOption & { disabled?: boolean })[];
}

/**
 * The series options offered to the rule at `index`.
 *
 * Anything another rule already claims is disabled rather than hidden: two
 * rules on the same series are meaningless, since the first match wins and the
 * second never applies — but hiding the option would just leave the user
 * wondering where a metric went. The rule's *own* current value stays enabled,
 * or it could not re-select what it already has.
 *
 * A key that neither group offers is appended under "Current". That covers
 * `pattern` rules, which have no enumerable option list, and rules left over
 * from a metric the chart no longer has; both would otherwise render as an
 * empty Select and read as data loss.
 */
export function getSeriesOptionGroups(
  rules: SeriesStyleRule[],
  index: number,
  metricOptions: RuleKeyOption[],
  dimensionOptions: RuleKeyOption[],
  labels: { metrics: string; dimensions: string; current: string },
): RuleKeyOptionGroup[] {
  const claimedByOthers = new Set(
    rules.filter((_, i) => i !== index).map(other => encodeRuleKey(other.key)),
  );
  const mark = (options: RuleKeyOption[]) =>
    options.map(option => ({
      ...option,
      disabled: claimedByOthers.has(option.value),
    }));

  const groups: RuleKeyOptionGroup[] = [
    {
      label: labels.metrics,
      title: labels.metrics,
      options: mark(metricOptions),
    },
    {
      label: labels.dimensions,
      title: labels.dimensions,
      options: mark(dimensionOptions),
    },
  ];

  const rule = rules[index];
  const encoded = encodeRuleKey(rule.key);
  const offered = [...metricOptions, ...dimensionOptions].some(
    option => option.value === encoded,
  );
  if (offered) return groups;

  return [
    ...groups,
    {
      label: labels.current,
      title: labels.current,
      options: [{ value: encoded, label: describeRuleKey(rule.key) }],
    },
  ];
}

/**
 * The first series no rule covers yet, used to seed a new rule so the common
 * case — one rule per metric — needs no dropdown interaction at all.
 *
 * Undefined once every series is covered, which is what disables "Add rule":
 * a duplicate rule would never apply, and an empty key matches nothing and
 * renders as a blank row.
 */
export function getUnclaimedOption(
  rules: SeriesStyleRule[],
  metricOptions: RuleKeyOption[],
  dimensionOptions: RuleKeyOption[],
): RuleKeyOption | undefined {
  const claimed = new Set(rules.map(rule => encodeRuleKey(rule.key)));
  return [...metricOptions, ...dimensionOptions].find(
    option => !claimed.has(option.value),
  );
}
