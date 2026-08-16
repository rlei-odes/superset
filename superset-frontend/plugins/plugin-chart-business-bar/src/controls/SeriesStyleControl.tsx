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
import { useMemo } from 'react';
import { t } from '@apache-superset/core/translation';
import { styled, css, useTheme } from '@apache-superset/core/theme';
import { ControlHeader, ControlHeaderProps } from '@superset-ui/chart-controls';
import { Button, ColorPicker, Select } from '@superset-ui/core/components';
import { Icons } from '@superset-ui/core/components/Icons';
import { parseSeriesStyleRules, resolveStyle } from '../seriesStyle';
import {
  FillStyle,
  getRoleDefaults,
  SeriesRole,
  SeriesStyleRule,
} from '../types';
import {
  decodeRuleKey,
  encodeRuleKey,
  getSeriesOptionGroups,
  getUnclaimedOption,
  RuleKeyOption,
} from './ruleOptions';

export interface SeriesStyleControlProps extends ControlHeaderProps {
  /**
   * Accepts a string as well as an array: charts saved while this field was a
   * raw JSON text control still hold the serialised form.
   */
  value?: SeriesStyleRule[] | string | null;
  onChange?: (value: SeriesStyleRule[]) => void;
  /** Metrics on the chart, from `mapStateToProps`. */
  metricOptions?: RuleKeyOption[];
  /** Dimension values seen in the last query result, from `mapStateToProps`. */
  dimensionOptions?: RuleKeyOption[];
}

const ROLE_LABELS: Record<SeriesRole, () => string> = {
  [SeriesRole.Actual]: () => t('Actual'),
  [SeriesRole.Plan]: () => t('Plan'),
  [SeriesRole.Forecast]: () => t('Forecast'),
  [SeriesRole.PriorYear]: () => t('Prior year'),
  [SeriesRole.Custom]: () => t('Custom'),
};

const FILL_LABELS: Record<FillStyle, () => string> = {
  solid: () => t('Solid'),
  outline: () => t('Outline'),
  hatched: () => t('Hatched'),
};

const RulesContainer = styled.div`
  ${({ theme }) => css`
    padding: ${theme.sizeUnit}px;
    border: solid 1px ${theme.colorBorder};
    border-radius: ${theme.borderRadius}px;
  `}
`;

const RuleCard = styled.div`
  ${({ theme }) => css`
    display: flex;
    flex-direction: column;
    gap: ${theme.sizeUnit}px;
    padding: ${theme.sizeUnit}px;
    margin-bottom: ${theme.sizeUnit}px;
    border: solid 1px ${theme.colorBorderSecondary};
    border-radius: ${theme.borderRadius}px;
  `}
`;

/**
 * Children keep their natural width; the ones that should absorb the row's free
 * space opt in with `grow`.
 *
 * Deliberately not positional. `:first-of-type` matches the first child *of each
 * element type*, and a Select renders a `div` while the delete button renders a
 * `button` — so both matched, the button stretched across the rest of the row,
 * and its hit area covered every pixel between the dropdown and the panel edge.
 * Clicking near the edge silently deleted a rule.
 */
const RuleRow = styled.div`
  ${({ theme }) => css`
    display: flex;
    align-items: center;
    gap: ${theme.sizeUnit}px;

    & > * {
      flex: 0 0 auto;
    }

    & > .grow {
      flex: 1 1 0;
      min-width: 0;
    }
  `}
`;

const EmptyHint = styled.div`
  ${({ theme }) => css`
    color: ${theme.colorTextTertiary};
    font-size: ${theme.fontSizeSM}px;
    padding: ${theme.sizeUnit}px;
  `}
`;

export default function SeriesStyleControl({
  value,
  onChange,
  metricOptions = [],
  dimensionOptions = [],
  ...headerProps
}: SeriesStyleControlProps) {
  const theme = useTheme();
  const rules = useMemo(() => parseSeriesStyleRules(value), [value]);

  const roleOptions = useMemo(
    () =>
      Object.values(SeriesRole).map(role => ({
        value: role,
        label: ROLE_LABELS[role](),
      })),
    [],
  );

  const fillOptions = useMemo(
    () =>
      (Object.keys(FILL_LABELS) as FillStyle[]).map(fill => ({
        value: fill,
        label: FILL_LABELS[fill](),
      })),
    [],
  );

  const groupLabels = {
    metrics: t('Metrics'),
    dimensions: t('Dimension values'),
    current: t('Current'),
  };

  const commit = (next: SeriesStyleRule[]) => onChange?.(next);

  const updateRule = (index: number, patch: Partial<SeriesStyleRule>) =>
    commit(
      rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)),
    );

  const deleteRule = (index: number) =>
    commit(rules.filter((_, i) => i !== index));

  const seedOption = getUnclaimedOption(rules, metricOptions, dimensionOptions);
  const hasSeries = metricOptions.length > 0 || dimensionOptions.length > 0;

  /**
   * The colour a role starts life with. Seeded into the rule rather than
   * applied at render, so it shows up in the picker as a real value the user
   * can change or clear. See the note on `getRoleDefaults`.
   */
  const seedColor = (role: SeriesRole) => getRoleDefaults(theme)[role]?.color;

  const addRule = () => {
    const key = seedOption && decodeRuleKey(seedOption.value);
    if (!key) return;
    commit([
      ...rules,
      {
        key,
        role: SeriesRole.Actual,
        color: seedColor(SeriesRole.Actual),
      },
    ]);
  };

  return (
    <div>
      <ControlHeader {...headerProps} />
      <RulesContainer>
        {rules.map((rule, index) => {
          // Shown as the fill Select's placeholder, so the role's default reads
          // as a real value rather than an empty box.
          const roleDefault = resolveStyle(
            { ...rule, fillStyle: undefined },
            theme,
          ).fillStyle;
          return (
            // Rules have no id and are reorderable only by delete/re-add, so
            // the index is the only stable key available.
            // eslint-disable-next-line react/no-array-index-key
            <RuleCard key={index}>
              <RuleRow>
                <Select
                  className="grow"
                  ariaLabel={t('Series')}
                  value={encodeRuleKey(rule.key)}
                  options={getSeriesOptionGroups(
                    rules,
                    index,
                    metricOptions,
                    dimensionOptions,
                    groupLabels,
                  )}
                  onChange={next => {
                    const key = decodeRuleKey(String(next));
                    if (key) updateRule(index, { key });
                  }}
                  placeholder={t('Select a series')}
                  allowClear={false}
                  showSearch
                />
                <Button
                  buttonStyle="link"
                  buttonSize="small"
                  aria-label={t('Remove rule')}
                  onClick={() => deleteRule(index)}
                  icon={<Icons.CloseOutlined iconSize="m" />}
                />
              </RuleRow>
              <RuleRow>
                <Select
                  className="grow"
                  ariaLabel={t('Role')}
                  value={rule.role}
                  options={roleOptions}
                  onChange={next => {
                    const role = next as SeriesRole;
                    // Re-seed only a colour that the previous role seeded.
                    // A colour the user picked is kept, and one they cleared
                    // stays cleared -- neither is theirs to overwrite.
                    const color =
                      rule.color === seedColor(rule.role)
                        ? seedColor(role)
                        : rule.color;
                    updateRule(index, { role, color });
                  }}
                  allowClear={false}
                />
                <Select
                  className="grow"
                  ariaLabel={t('Fill style')}
                  value={rule.fillStyle}
                  options={fillOptions}
                  onChange={next =>
                    updateRule(index, {
                      fillStyle: (next as FillStyle) ?? undefined,
                    })
                  }
                  placeholder={FILL_LABELS[roleDefault]()}
                  allowClear
                />
                <ColorPicker
                  size="small"
                  value={rule.color ?? null}
                  allowClear
                  // Only on release: dragging inside the picker would otherwise
                  // re-render the chart on every intermediate colour.
                  onChangeComplete={color =>
                    updateRule(index, { color: color?.toHexString() })
                  }
                  onClear={() => updateRule(index, { color: undefined })}
                />
              </RuleRow>
            </RuleCard>
          );
        })}
        {rules.length === 0 && (
          <EmptyHint>
            {hasSeries
              ? t('No rules yet. Series keep their color scheme styling.')
              : t('Add a metric to the chart to start assigning roles.')}
          </EmptyHint>
        )}
        <Button
          // No seed left means every series already has a rule, or the chart
          // has none yet. Either way there is nothing useful to add, and a
          // second rule on an already-covered series would never apply.
          disabled={!seedOption}
          tooltip={
            !seedOption && hasSeries
              ? t('Every series already has a rule.')
              : undefined
          }
          buttonStyle="link"
          buttonSize="small"
          onClick={addRule}
          icon={<Icons.PlusOutlined iconSize="m" />}
        >
          {t('Add rule')}
        </Button>
      </RulesContainer>
    </div>
  );
}
