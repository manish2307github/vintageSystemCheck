from datetime import date
from io import StringIO
from pathlib import Path

import pandas as pd

from backend.app.models import AccountUsage, WeeklyLogin

REQUIRED_COLUMNS = {"account_id", "week_start", "login_count"}
SAMPLE_CSV = Path(__file__).resolve().parents[1] / "data" / "weekly_usage.csv"


def parse_usage_csv(csv_content: str) -> list[AccountUsage]:
    try:
        frame = pd.read_csv(StringIO(csv_content), dtype={"account_id": "string"})
    except (pd.errors.ParserError, pd.errors.EmptyDataError) as error:
        raise ValueError(f"Invalid CSV: {error}") from error

    missing_columns = REQUIRED_COLUMNS - set(frame.columns)
    if missing_columns:
        raise ValueError(f"Missing required columns: {', '.join(sorted(missing_columns))}.")
    if frame.empty:
        raise ValueError("CSV must contain at least one data row.")

    frame = frame.loc[:, ["account_id", "week_start", "login_count"]].copy()
    frame["account_id"] = frame["account_id"].astype("string").str.strip()
    if frame.isna().any().any() or (frame["account_id"] == "").any():
        raise ValueError("CSV contains null or blank required values.")

    parsed_dates = pd.to_datetime(frame["week_start"], format="%Y-%m-%d", errors="coerce")
    if parsed_dates.isna().any():
        raise ValueError("week_start values must be valid YYYY-MM-DD dates.")
    frame["week_start"] = parsed_dates.dt.date

    numeric = pd.to_numeric(frame["login_count"], errors="coerce")
    if numeric.isna().any() or (numeric < 0).any() or (numeric % 1 != 0).any():
        raise ValueError("login_count values must be non-negative whole numbers.")
    frame["login_count"] = numeric.astype(int)
    if frame.duplicated(["account_id", "week_start"]).any():
        raise ValueError("CSV contains duplicate account_id and week_start values.")

    accounts = []
    for account_id, rows in frame.sort_values("week_start").groupby("account_id", sort=True):
        rows = rows.sort_values("week_start")
        dates = rows["week_start"].tolist()
        missing_weeks = []
        for previous, current in zip(dates, dates[1:]):
            gap = (current - previous).days
            if gap > 7 and gap % 7 == 0:
                missing_weeks.extend(
                    previous + pd.Timedelta(days=offset).to_pytimedelta()
                    for offset in range(7, gap, 7)
                )
            elif gap != 7:
                raise ValueError(f"Account {account_id} has week_start values that are not 7 days apart.")

        age_weeks = ((dates[-1] - dates[0]).days // 7) + 1
        accounts.append(AccountUsage(
            account_id=str(account_id),
            weekly_logins=[
                WeeklyLogin(week_start=row.week_start, login_count=int(row.login_count))
                for row in rows.itertuples(index=False)
            ],
            account_age_weeks=age_weeks,
            missing_weeks=[date.fromisoformat(str(day)) for day in missing_weeks],
        ))
    return accounts


def load_default_accounts() -> list[AccountUsage]:
    return parse_usage_csv(SAMPLE_CSV.read_text(encoding="utf-8"))
