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

-- Scenario timeline: prior years, current year to date, full-year forecast, and
-- plan for the current and following year -- as one bar each.
--
--   2023   2024   2025   2026   2026 FC   2026 Plan   2027 Plan
--
-- Use as the SQL of a virtual dataset, then in the chart set:
--   X-Axis     = period
--   Dimensions = role
--   Metric     = SUM(revenue)
--   Stack      = on   (layout only -- see the package README)
--
-- Written against the `bike_monthly` table produced by `seed_bike_data.py`.
-- Adapt the table and column names; the structure is the point.
--
-- Every branch emits the same column list, because UNION ALL requires it. Each
-- branch decides two things: what the bar is *called* (`period`) and what role
-- it plays (`role`). Those are the only two columns the chart cares about.

WITH cy AS (
    -- The current year, derived rather than hardcoded, so the query keeps
    -- working as data advances. One row, one column -- see the note below.
    SELECT MAX(year) AS y FROM bike_monthly WHERE scenario = 'Actual'
)

-- Prior years: closed actuals, one bar per year, labelled with the year alone.
SELECT CAST(m.year AS VARCHAR)              AS period,
       'Previous'                           AS role,
       m.month, m.country, m.product_line, m.units, m.revenue
FROM bike_monthly m CROSS JOIN cy
WHERE m.scenario = 'Actual' AND m.year < cy.y

UNION ALL

-- Current year, actual to date. Same label shape as the prior years, so it
-- lines up with them on the axis and can be compared directly.
SELECT CAST(m.year AS VARCHAR),             'Actual',
       m.month, m.country, m.product_line, m.units, m.revenue
FROM bike_monthly m CROSS JOIN cy
WHERE m.scenario = 'Actual' AND m.year = cy.y

UNION ALL

-- Current year, full-year forecast, as its own bar.
--
-- This source stores forecast as the *remainder* -- only the months not yet
-- closed -- so a full-height bar is actual-to-date PLUS that remainder. The
-- actual rows are therefore emitted a second time here, under a different
-- label. That is why this is a UNION and not a CASE.
--
-- If your warehouse already stores a full-year forecast figure, drop the
-- 'Actual' from the IN list.
SELECT CAST(m.year AS VARCHAR) || ' FC',    'Forecast',
       m.month, m.country, m.product_line, m.units, m.revenue
FROM bike_monthly m CROSS JOIN cy
WHERE m.year = cy.y AND m.scenario IN ('Actual', 'Forecast')

UNION ALL

-- Plan for the current year and every year beyond it. Labelled ' Plan' so it
-- occupies its own bar rather than competing with the actual for the same one.
SELECT CAST(m.year AS VARCHAR) || ' Plan',  'Plan',
       m.month, m.country, m.product_line, m.units, m.revenue
FROM bike_monthly m CROSS JOIN cy
WHERE m.scenario = 'Plan' AND m.year >= cy.y

-- Note on the labels: they are what orders the x-axis. Superset's pivot sorts
-- the axis index, and X-Axis Sort By is inert whenever a dimension is set, so
-- lexicographic order IS the display order. It works out here because
-- '2026' < '2026 FC' < '2026 Plan' < '2027 Plan'. Choose labels accordingly.
--
-- Note on `month`: keeping it in the output is what makes a `month <= N` filter
-- produce a year-to-date view of every role at once.
