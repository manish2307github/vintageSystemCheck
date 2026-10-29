from backend.app.models import AccountUsage, RiskLevel, RiskScore


def explain_risk(account: AccountUsage, score: RiskScore) -> str:
    if score.risk_level == RiskLevel.INSUFFICIENT_DATA:
        history = account.weekly_logins[-39:]
        has_gap = len(history) == 39 and any(
            (current.week_start - previous.week_start).days != 7
            for previous, current in zip(history, history[1:])
        )
        if has_gap:
            return (
                "The latest history contains a missing week; at least 39 consecutive "
                "weeks (9 months) are required, so no risk level was assigned."
            )
        return (
            f"Only {len(account.weekly_logins)} weekly login observations are available; "
            "at least 39 consecutive weeks (9 months) are required, so no risk level was assigned."
        )

    decline = score.decline_percent or 0
    previous = score.previous_average or 0
    recent = score.recent_average or 0
    if previous == 0 and recent > 0:
        change = (
            f"Average weekly logins increased from 0.0 to {recent:.1f}; "
            "a percentage decline cannot be calculated from a zero baseline"
        )
    elif recent < previous:
        change = f"Average weekly logins declined by {decline:.0f}%"
    elif recent > previous:
        increase = ((recent - previous) / previous) * 100
        change = f"Average weekly logins increased by {increase:.0f}%"
    else:
        change = "Average weekly logins were unchanged (0% change)"
    trend = (
        "The linear trend is downward, which strengthens this signal."
        if (score.trend_slope or 0) < 0
        else "The linear trend is not downward, so this signal has less trend support."
    )
    reason = (
        "The decline exceeds the critical threshold."
        if score.risk_level == RiskLevel.CRITICAL
        else "The decline meets the at-risk threshold."
        if score.risk_level == RiskLevel.AT_RISK
        else "The decline meets the watch threshold."
        if score.risk_level == RiskLevel.WATCH
        else "The decline remains below the watch threshold."
    )
    return (
        f"{change}, from {score.previous_average:.1f} over the prior 8 months "
        f"to {score.recent_average:.1f} over the latest 1 month. "
        f"{reason} {trend}"
    )
