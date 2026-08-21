-- Licensed to the Apache Software Foundation (ASF) under one
-- or more contributor license agreements.  See the NOTICE file
-- distributed with this work for additional information
-- regarding copyright ownership.  The ASF licenses this file
-- to you under the Apache License, Version 2.0 (the
-- "License"); you may not use this file except in compliance
-- with the License.  You may obtain a copy of the License at
--
--   http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing,
-- software distributed under the License is distributed on an
-- "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
-- KIND, either express or implied.  See the License for the
-- specific language governing permissions and limitations
-- under the License.
--
-- Z chart source: monthly figures plus their running totals, for the Business
-- Mixed Chart. Paste as a virtual dataset's SQL.
--
-- WHY THE CUMULATIVE COLUMNS ARE COMPUTED HERE rather than by Superset's
-- Advanced Analytics "Cumulative sum" rolling window:
--
--   `superset/utils/pandas_postprocessing/cum.py` does `df_cum.fillna(0)`
--   before accumulating. A month with no value therefore contributes zero and,
--   worse, *keeps* a value in the output — so a cumulative forecast lies flat
--   on the floor for every month that has actuals instead of not being drawn,
--   and a cumulative actual flatlines into the future instead of stopping.
--
--   There is no chart setting that repairs this. ECharts will happily leave a
--   gap where there is no data, and "Connect nulls" governs exactly that — but
--   by the time the option reaches ECharts there are no nulls left to skip,
--   only zeros. The gaps have to survive into the data, which means SQL.
--
-- The three lines this produces are the Z:
--
--   actual_ytd    rises to the reporting month, then stops     (solid)
--   expected_ytd  starts AT the reporting month, then rises    (dotted)
--   plan_ytd      rises across the whole year                  (dashed)
--
-- `expected_ytd` deliberately overlaps `actual_ytd` by one month so the dotted
-- line begins exactly where the solid one ends, rather than jumping a gap.

WITH monthly AS (
  SELECT
    month_start,
    SUM(actual)   AS actual,
    SUM(plan)     AS plan,
    SUM(forecast) AS forecast
  FROM bike_monthly_wide
  WHERE year = 2026
  GROUP BY month_start
),

-- The reporting month: the last month that has actuals. Derived rather than
-- hardcoded, so the chart follows the data as more months close.
cutoff AS (
  SELECT MAX(month_start) AS reporting_month
  FROM monthly
  WHERE actual IS NOT NULL
),

running AS (
  SELECT
    m.*,
    SUM(COALESCE(m.actual, 0)) OVER (ORDER BY m.month_start) AS actual_run,
    SUM(COALESCE(m.plan, 0))   OVER (ORDER BY m.month_start) AS plan_run,
    -- Actual where it exists, forecast beyond it: the full-year expectation.
    SUM(COALESCE(m.actual, m.forecast, 0))
      OVER (ORDER BY m.month_start) AS expected_run
  FROM monthly m
)

SELECT
  r.month_start,
  -- Monthly figures, drawn as bars.
  r.actual,
  r.plan,
  r.forecast,
  -- Running totals, drawn as lines. The CASEs are what create the gaps.
  CASE WHEN r.month_start <= c.reporting_month THEN r.actual_run END
    AS actual_ytd,
  r.plan_run AS plan_ytd,
  CASE WHEN r.month_start >= c.reporting_month THEN r.expected_run END
    AS expected_ytd
FROM running r
CROSS JOIN cutoff c
ORDER BY r.month_start
