from backend.app.models import AccountUsage, RiskLevel, RiskScore

MINIMUM_HISTORY = 39  # 9 months of weekly data
PRIOR_WINDOW = 35  # 8 months for prior average
RECENT_WINDOW = 4  # 1 month for recent average


def score_account(account: AccountUsage) -> RiskScore:
    history = account.weekly_logins
    values = [week.login_count for week in history]
    recent_weeks = history[-MINIMUM_HISTORY:]
    contiguous = len(recent_weeks) == MINIMUM_HISTORY and all(
        (current.week_start - previous.week_start).days == 7
        for previous, current in zip(recent_weeks, recent_weeks[1:])
    )
    if len(values) < MINIMUM_HISTORY or not contiguous:
        return RiskScore(
            account_id=account.account_id,
            previous_average=None,
            recent_average=None,
            decline_percent=None,
            trend_slope=None,
            risk_level=RiskLevel.INSUFFICIENT_DATA,
            confidence=0,
        )

    window = values[-MINIMUM_HISTORY:]
    previous_average = sum(window[:PRIOR_WINDOW]) / PRIOR_WINDOW
    recent_average = sum(window[PRIOR_WINDOW:]) / RECENT_WINDOW
    decline_percent = (
        ((previous_average - recent_average) / previous_average) * 100
        if previous_average > 0 else 0.0
    )
    trend_slope = _linear_slope(window)

    if decline_percent < 15:
        risk_level = RiskLevel.HEALTHY
    elif decline_percent < 30:
        risk_level = RiskLevel.WATCH
    elif decline_percent <= 50:
        risk_level = RiskLevel.AT_RISK
    else:
        risk_level = RiskLevel.CRITICAL

    confidence = min(100.0, 60.0 + min(decline_percent, 40.0) * 0.5)
    if trend_slope < 0:
        confidence = min(100.0, confidence + 15.0)

    return RiskScore(
        account_id=account.account_id,
        previous_average=round(previous_average, 2),
        recent_average=round(recent_average, 2),
        decline_percent=round(decline_percent, 2),
        trend_slope=round(trend_slope, 2),
        risk_level=risk_level,
        confidence=round(confidence, 2),
    )


def _linear_slope(values: list[int]) -> float:
    size = len(values)
    mean_x = (size - 1) / 2
    mean_y = sum(values) / size
    numerator = sum((index - mean_x) * (value - mean_y) for index, value in enumerate(values))
    denominator = sum((index - mean_x) ** 2 for index in range(size))
    return numerator / denominator
