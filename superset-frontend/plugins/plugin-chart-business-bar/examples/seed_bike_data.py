#!/usr/bin/env python3
# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
"""
Seed a realistic bike-manufacturer dataset into the Superset examples DB.

Why this exists
---------------
The stock Superset examples have no plan, forecast or prior-year columns, so
none of the business-charts roles can be exercised against them. This builds a
dataset shaped like real management reporting:

  bike_sales         transaction grain -- one row per bike sold to a store
  bike_plan          month x country x product line -- plan and forecast
  bike_monthly       month grain, long/tidy: one row per scenario
  bike_monthly_wide  month grain, wide: actual/plan/forecast/prior year columns

The two grains are the point. Actuals arrive as individual sales; plan is set
once per month per country. Everything above transaction grain is derived, which
is what a real warehouse does.

Both a long and a wide monthly shape are built on purpose: the chart's rules can
key on a *metric* (wide) or on a *dimension value* (long), and both need to be
testable.

Re-running rebuilds every table from scratch, deterministically -- the RNG is
seeded, so the same data comes back.

Usage:  .local/sup python .local/seed_bike_data.py
"""

from __future__ import annotations

import os
import random
import sqlite3
from datetime import date, timedelta
from typing import Any

# The grain every scenario shares: (year, month, country, product line).
PeriodKey = tuple[int, int, str, str]
# What a scenario holds at that grain: (units, revenue).
Figures = tuple[int, float]
# One row as handed to executemany, in its table's column order. The columns are
# deliberately heterogeneous, so this stays loose.
Row = tuple[Any, ...]

DB_PATH = os.path.expanduser("~/.superset/examples.db")
SEED = 20260815

# Actuals run to this date; the current year is deliberately partial, which is
# what makes "actual so far, plan for the rest" a real question.
TODAY = date(2026, 8, 15)
FIRST_YEAR = TODAY.year - 3  # 2023
PLAN_LAST_YEAR = TODAY.year + 1  # plan exists for next year, with no actuals

COUNTRIES = {
    "Germany": 0.34,
    "Netherlands": 0.22,
    "France": 0.18,
    "Austria": 0.14,
    "Switzerland": 0.12,
}

STORES = {
    "Germany": ["Berlin Velo", "Munich Radhaus", "Hamburg Cycles", "Koln Bikes"],
    "Netherlands": ["Amsterdam Fiets", "Utrecht Wheels", "Rotterdam Rijwiel"],
    "France": ["Paris Cyclo", "Lyon Velodrome", "Bordeaux Bikes"],
    "Austria": ["Vienna Radsport", "Innsbruck Alpin"],
    "Switzerland": ["Zurich Velo", "Geneva Cycles"],
}

# base_price, base share of units, yearly share drift (e-bikes take over)
PRODUCT_LINES = {
    "E-Bike": {"price": 3200, "share": 0.22, "drift": 0.045},
    "Road": {"price": 2400, "share": 0.20, "drift": -0.010},
    "Mountain": {"price": 1950, "share": 0.24, "drift": -0.010},
    "City": {"price": 890, "share": 0.22, "drift": -0.015},
    "Kids": {"price": 420, "share": 0.12, "drift": -0.010},
}

MODELS = {
    "E-Bike": ["Volt 500", "Volt 700", "Cargo-E"],
    "Road": ["Aero R1", "Aero R3", "Gran Fondo"],
    "Mountain": ["Trail 29", "Enduro X", "Hardtail S"],
    "City": ["Urban 3", "Urban 7", "Commuter"],
    "Kids": ["Junior 16", "Junior 20", "Junior 24"],
}

# Bikes are strongly seasonal: spring peak, winter trough.
SEASONALITY = {
    1: 0.45,
    2: 0.55,
    3: 0.90,
    4: 1.35,
    5: 1.60,
    6: 1.45,
    7: 1.25,
    8: 1.05,
    9: 0.95,
    10: 0.80,
    11: 0.60,
    12: 0.75,
}

GROWTH_PER_YEAR = 1.08
MARGIN = {"E-Bike": 0.34, "Road": 0.30, "Mountain": 0.31, "City": 0.27, "Kids": 0.25}


def product_share(line: str, year_index: int) -> float:
    """Share of units, drifting year over year, renormalised by the caller."""
    spec = PRODUCT_LINES[line]
    return max(0.02, spec["share"] + spec["drift"] * year_index)


def daily_lambda(country: str, line: str, day: date, year_index: int) -> float:
    """Expected bikes sold, for one store-day-productline."""
    shares = {other: product_share(other, year_index) for other in PRODUCT_LINES}
    total = sum(shares.values())
    share = shares[line] / total

    base = 11.0 * COUNTRIES[country] * share * len(PRODUCT_LINES)
    seasonal = SEASONALITY[day.month]
    growth = GROWTH_PER_YEAR**year_index
    # Weekends are busier in retail.
    weekday = 1.35 if day.weekday() >= 5 else 0.92
    return base * seasonal * growth * weekday


def build_sales(rng: random.Random) -> list[Row]:
    rows: list[Row] = []
    sale_id = 0
    day = date(FIRST_YEAR, 1, 1)

    while day <= TODAY:
        year_index = day.year - FIRST_YEAR
        for country, stores in STORES.items():
            for store in stores:
                for line, spec in PRODUCT_LINES.items():
                    lam = daily_lambda(country, line, day, year_index) / len(stores)
                    # A normal draw round lambda gives believable dispersion.
                    # Rounded rather than truncated: `int()` floors toward zero,
                    # which quietly halves the mean at the small lambdas most
                    # store-day-line combinations have.
                    count = round(rng.gauss(lam, max(0.8, lam * 0.5)))
                    if count <= 0:
                        continue
                    for _ in range(count):
                        sale_id += 1
                        model = rng.choice(MODELS[line])
                        # Discounts and model tiers move the realised price.
                        price = spec["price"] * rng.uniform(0.88, 1.14)
                        units = 1 if rng.random() < 0.93 else 2
                        revenue = round(price * units, 2)
                        cost = round(revenue * (1 - MARGIN[line]), 2)
                        rows.append(
                            (
                                sale_id,
                                f"{day.isoformat()} 00:00:00",
                                day.isoformat(),
                                day.year,
                                day.month,
                                country,
                                store,
                                line,
                                model,
                                units,
                                round(price, 2),
                                revenue,
                                cost,
                                round(revenue - cost, 2),
                            )
                        )
        day += timedelta(days=1)
    return rows


def month_starts(first_year: int, last_year: int) -> list[date]:
    return [
        date(y, m, 1) for y in range(first_year, last_year + 1) for m in range(1, 13)
    ]


def build_plan(
    actual_by_key: dict[PeriodKey, Figures], rng: random.Random
) -> list[Row]:
    """
    Plan is set per month, country and product line -- deliberately coarser than
    the transaction grain.

    Built off the best available view of the prior year plus an ambition factor,
    which is how planning actually works and keeps plan close enough to actual
    that variances are believable rather than random.

    "Best available" matters, and getting it wrong is visible the moment the data
    is charted by year:

    - The **first year** has no prior year at all. Falling back to a modelled
      figure produced a 2023 plan of 3.4M against a 45.4M actual. It is derived
      from the same year's actual instead -- a plan that turned out roughly
      right, which is the honest stand-in when there is no history.
    - **Next year** is planned while the current year is still incomplete, so its
      prior-year baseline has to be the current year's *full-year estimate*
      (actual to date plus forecast for the rest), not the partial actual. Using
      the partial figure made the 2027 plan lower than 2026's.

    Years are generated in order so each can see the one before it.
    """
    rows = []
    plan_by_key: dict[PeriodKey, Figures] = {}
    forecast_by_key: dict[PeriodKey, Figures] = {}

    for year in range(FIRST_YEAR, PLAN_LAST_YEAR + 1):
        for month_no in range(1, 13):
            month = date(year, month_no, 1)
            for country in COUNTRIES:
                for line in PRODUCT_LINES:
                    prior_key = (year - 1, month_no, country, line)
                    this_key = (year, month_no, country, line)

                    # Widened from `Figures`: this is an input to arithmetic
                    # rather than a stored figure, and the last-resort branch
                    # below is modelled, so its units are not yet whole bikes.
                    baseline: tuple[float, float] | None = (
                        # Last year actually happened.
                        actual_by_key.get(prior_key)
                        # Last year is the current, partial year: use the
                        # forecast for the months that have not closed yet.
                        or forecast_by_key.get(prior_key)
                        # Failing that, what last year was planned to do.
                        or plan_by_key.get(prior_key)
                        # First year: no history at all, so anchor on what this
                        # year turned out to be.
                        or actual_by_key.get(this_key)
                    )
                    if baseline is None:
                        base_units = (
                            28
                            * COUNTRIES[country]
                            * product_share(line, year - FIRST_YEAR)
                            * len(PRODUCT_LINES)
                            * SEASONALITY[month_no]
                        )
                        baseline = (
                            base_units,
                            base_units * PRODUCT_LINES[line]["price"],
                        )

                    # A first-year plan is a guess at the year itself, not an
                    # ambition on top of a known prior year.
                    ambition = (
                        rng.uniform(0.92, 1.06)
                        if year == FIRST_YEAR
                        else rng.uniform(1.03, 1.14)
                    )
                    units = max(1, round(baseline[0] * ambition))
                    revenue = round(baseline[1] * ambition, 2)
                    plan_by_key[this_key] = (units, revenue)

                    rows.append(
                        (
                            f"{month.isoformat()} 00:00:00",
                            year,
                            month_no,
                            country,
                            line,
                            "Plan",
                            units,
                            revenue,
                        )
                    )

                    # A forecast is only meaningful once the year is under way
                    # and the plan is known to be off -- so only for months
                    # after the last actual, in the current year.
                    if year == TODAY.year and month_no > TODAY.month:
                        drift = rng.uniform(0.88, 1.09)
                        fc = (max(1, round(units * drift)), round(revenue * drift, 2))
                        forecast_by_key[this_key] = fc
                        rows.append(
                            (
                                f"{month.isoformat()} 00:00:00",
                                year,
                                month_no,
                                country,
                                line,
                                "Forecast",
                                fc[0],
                                fc[1],
                            )
                        )
    return rows


def main() -> None:  # noqa: C901
    # C901: a seeding script is a linear recipe -- drop, create, fill, derive,
    # in that order -- and splitting it into functions to satisfy a complexity
    # count would scatter steps that only make sense read top to bottom.
    #
    # S311: the seed is the point. This generates demo data reproducibly, and
    # has nothing to do with cryptography.
    rng = random.Random(SEED)  # noqa: S311
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    print(f"seeding {DB_PATH}")

    for name in (
        "bike_monthly_wide",
        "bike_monthly",
        "bike_plan",
        "bike_sales",
    ):
        cur.execute(f"DROP TABLE IF EXISTS {name}")
        cur.execute(f"DROP VIEW IF EXISTS {name}")

    cur.execute(
        """
        CREATE TABLE bike_sales (
            sale_id      INTEGER PRIMARY KEY,
            sale_ts      TIMESTAMP,
            sale_date    DATE,
            year         INTEGER,
            month        INTEGER,
            country      VARCHAR(64),
            store        VARCHAR(64),
            product_line VARCHAR(32),
            model        VARCHAR(32),
            units        INTEGER,
            unit_price   NUMERIC,
            revenue      NUMERIC,
            cost         NUMERIC,
            margin       NUMERIC
        )
        """
    )
    sales = build_sales(rng)
    cur.executemany(
        "INSERT INTO bike_sales VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", sales
    )
    print(f"  bike_sales        {len(sales):>7,} rows (transaction grain)")

    # Roll actuals up once, for plan seeding and the monthly tables.
    cur.execute(
        """
        SELECT year, month, country, product_line, SUM(units), SUM(revenue),
               SUM(cost), SUM(margin)
        FROM bike_sales GROUP BY 1,2,3,4
        """
    )
    actual_rows = cur.fetchall()
    actual_by_key = {(y, m, c, p): (u, r) for y, m, c, p, u, r, _, _ in actual_rows}

    cur.execute(
        """
        CREATE TABLE bike_plan (
            plan_month       TIMESTAMP,
            year             INTEGER,
            month            INTEGER,
            country          VARCHAR(64),
            product_line     VARCHAR(32),
            scenario         VARCHAR(16),
            planned_units    INTEGER,
            planned_revenue  NUMERIC
        )
        """
    )
    plan = build_plan(actual_by_key, rng)
    cur.executemany("INSERT INTO bike_plan VALUES (?,?,?,?,?,?,?,?)", plan)
    print(f"  bike_plan         {len(plan):>7,} rows (month x country x line)")

    # ---- monthly, long/tidy -------------------------------------------------
    # One row per scenario, so a rule can key on the `scenario` dimension value.
    # `year_type` is the CY/PY flag: it makes prior-year comparison work without
    # any time-shift machinery, which is what the Prior Year role needs on data
    # that has no usable temporal column.
    cur.execute(
        """
        CREATE TABLE bike_monthly (
            month_start  TIMESTAMP,
            year         INTEGER,
            month        INTEGER,
            country      VARCHAR(64),
            product_line VARCHAR(32),
            scenario     VARCHAR(16),
            year_type    VARCHAR(4),
            units        INTEGER,
            revenue      NUMERIC
        )
        """
    )

    def year_type(y: int) -> str:
        if y == TODAY.year:
            return "CY"
        if y == TODAY.year - 1:
            return "PY"
        return str(y)

    monthly: list[Row] = []
    for y, m, c, p, units, revenue, _cost, _margin in actual_rows:
        monthly.append(
            (
                f"{date(y, m, 1).isoformat()} 00:00:00",
                y,
                m,
                c,
                p,
                "Actual",
                year_type(y),
                units,
                round(revenue, 2),
            )
        )
    for ts, y, m, c, p, scenario, units, revenue in plan:
        monthly.append((ts, y, m, c, p, scenario, year_type(y), units, revenue))

    cur.executemany("INSERT INTO bike_monthly VALUES (?,?,?,?,?,?,?,?,?)", monthly)
    print(f"  bike_monthly      {len(monthly):>7,} rows (long: one row/scenario)")

    # ---- monthly, wide ------------------------------------------------------
    # One row per period with a column per scenario, which is the shape the
    # metric-keyed rules were designed around. Prior year is last year's actual
    # carried onto this year's month, so it can be charted beside it directly.
    cur.execute(
        """
        CREATE TABLE bike_monthly_wide (
            month_start   TIMESTAMP,
            year          INTEGER,
            month         INTEGER,
            country       VARCHAR(64),
            product_line  VARCHAR(32),
            actual        NUMERIC,
            plan          NUMERIC,
            forecast      NUMERIC,
            prior_year    NUMERIC,
            actual_units  INTEGER,
            plan_units    INTEGER
        )
        """
    )

    actual_rev = {(y, m, c, p): r for y, m, c, p, _u, r, _c, _g in actual_rows}
    actual_units = {(y, m, c, p): u for y, m, c, p, u, _r, _c, _g in actual_rows}
    plan_rev = {(y, m, c, p): r for _ts, y, m, c, p, s, _u, r in plan if s == "Plan"}
    plan_units = {(y, m, c, p): u for _ts, y, m, c, p, s, u, _r in plan if s == "Plan"}
    fc_rev = {(y, m, c, p): r for _ts, y, m, c, p, s, _u, r in plan if s == "Forecast"}

    wide = []
    for month in month_starts(FIRST_YEAR, PLAN_LAST_YEAR):
        for country in COUNTRIES:
            for line in PRODUCT_LINES:
                key = (month.year, month.month, country, line)
                prior_key = (month.year - 1, month.month, country, line)
                row = (
                    f"{month.isoformat()} 00:00:00",
                    month.year,
                    month.month,
                    country,
                    line,
                    round(actual_rev[key], 2) if key in actual_rev else None,
                    plan_rev.get(key),
                    fc_rev.get(key),
                    round(actual_rev[prior_key], 2)
                    if prior_key in actual_rev
                    else None,
                    actual_units.get(key),
                    plan_units.get(key),
                )
                # Skip periods with nothing at all in them.
                if any(v is not None for v in row[5:9]):
                    wide.append(row)

    cur.executemany(
        "INSERT INTO bike_monthly_wide VALUES (?,?,?,?,?,?,?,?,?,?,?)", wide
    )
    print(f"  bike_monthly_wide {len(wide):>7,} rows (wide: column/scenario)")

    for stmt in (
        "CREATE INDEX idx_bike_sales_date ON bike_sales(sale_date)",
        "CREATE INDEX idx_bike_sales_country ON bike_sales(country)",
        "CREATE INDEX idx_bike_monthly_month ON bike_monthly(month_start)",
        "CREATE INDEX idx_bike_wide_month ON bike_monthly_wide(month_start)",
    ):
        cur.execute(stmt)

    con.commit()
    con.close()
    print("done")


if __name__ == "__main__":
    main()
