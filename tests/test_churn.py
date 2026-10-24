from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from agents.workflow import run_workflow
from backend.app.explanations import explain_risk
from backend.app.ingestion import parse_usage_csv
from backend.app.main import app
from backend.app.models import AccountUsage, RiskLevel, WeeklyLogin
from backend.app.playbook import recommend_action
from backend.app.scoring import score_account

client = TestClient(app)
START = date(2026, 8, 31)


def account(values: list[int], *, gap_at: int | None = None) -> AccountUsage:
    dates = []
    current = START
    for index in range(len(values)):
        if index == gap_at:
            current += timedelta(days=14)
        dates.append(current)
        current += timedelta(days=7)
    return AccountUsage(
        account_id="T-1",
        weekly_logins=[
            WeeklyLogin(week_start=week, login_count=value)
            for week, value in zip(dates, values, strict=True)
        ],
        account_age_weeks=(dates[-1] - dates[0]).days // 7 + 1,
    )


def csv_for(values: list[int]) -> str:
    rows = ["account_id,week_start,login_count"]
    for index, value in enumerate(values):
        week = START + timedelta(days=index * 7)
        rows.append(f"T-1,{week.isoformat()},{value}")
    return "\n".join(rows)


@pytest.mark.parametrize(
    ("recent", "expected"),
    [
        ([90, 90, 90, 90], RiskLevel.HEALTHY),
        ([85, 85, 85, 85], RiskLevel.WATCH),
        ([70, 70, 70, 70], RiskLevel.AT_RISK),
        ([50, 50, 50, 50], RiskLevel.AT_RISK),
        ([49, 49, 49, 49], RiskLevel.CRITICAL),
    ],
)
def test_risk_bands_and_boundaries(recent: list[int], expected: RiskLevel) -> None:
    result = score_account(account([100] * 4 + recent))
    assert result.risk_level == expected
    assert result.previous_average == 100


def test_insufficient_history_and_missing_recent_week() -> None:
    assert score_account(account([10] * 7)).risk_level == RiskLevel.INSUFFICIENT_DATA
    assert score_account(account([10] * 8, gap_at=5)).risk_level == RiskLevel.INSUFFICIENT_DATA


def test_downward_slope_raises_confidence() -> None:
    declining = score_account(account([100] * 4 + [90, 80, 70, 60]))
    non_declining = score_account(account([100] * 4 + [0, 40, 100, 160]))
    assert declining.trend_slope < 0
    assert non_declining.trend_slope > 0
    assert declining.confidence > non_declining.confidence


def test_zero_baseline_does_not_divide_by_zero() -> None:
    result = score_account(account([0] * 8))
    assert result.decline_percent == 0
    assert result.risk_level == RiskLevel.HEALTHY


def test_explanation_includes_change_amount_comparison_and_reason() -> None:
    usage = account([100] * 4 + [60] * 4)
    score = score_account(usage)
    text = explain_risk(usage, score)
    assert "declined by 40%" in text
    assert "100.0 over the prior 4 weeks" in text
    assert "meets the at-risk threshold" in text


def test_explanation_describes_increased_usage_without_claiming_decline() -> None:
    usage = account([10] * 4 + [20] * 4)
    text = explain_risk(usage, score_account(usage))
    assert "increased by 100%" in text
    assert "decline remains below the watch threshold" in text


@pytest.mark.parametrize(
    ("recent", "reason"),
    [
        ([80] * 4, "meets the watch threshold"),
        ([40] * 4, "exceeds the critical threshold"),
    ],
)
def test_explanation_uses_matching_risk_reason(recent: list[int], reason: str) -> None:
    usage = account([100] * 4 + recent)
    assert reason in explain_risk(usage, score_account(usage))


def test_explanation_handles_zero_baseline_and_no_change() -> None:
    rising = account([0] * 4 + [10] * 4)
    unchanged = account([0] * 8)
    assert "cannot be calculated from a zero baseline" in explain_risk(rising, score_account(rising))
    assert "were unchanged (0% change)" in explain_risk(unchanged, score_account(unchanged))


def test_insufficient_explanation_states_history_requirement() -> None:
    usage = account([4] * 6)
    text = explain_risk(usage, score_account(usage))
    assert "at least 8 consecutive weeks are required" in text


def test_insufficient_explanation_identifies_recent_gap() -> None:
    usage = account([10] * 8, gap_at=5)
    text = explain_risk(usage, score_account(usage))
    assert "latest history contains a missing week" in text


@pytest.mark.parametrize(
    ("risk", "expected_action", "expected_priority"),
    [
        (RiskLevel.HEALTHY, "Monitor normally", "Low"),
        (RiskLevel.WATCH, "Send customer health check", "Medium"),
        (RiskLevel.AT_RISK, "Customer Success outreach", "High"),
        (RiskLevel.CRITICAL, "Immediate executive engagement", "Urgent"),
        (RiskLevel.INSUFFICIENT_DATA, "Collect more weekly usage history", "Low"),
    ],
)
def test_playbook_mapping(risk: RiskLevel, expected_action: str, expected_priority: str) -> None:
    action, priority, notes = recommend_action(risk)
    assert action == expected_action
    assert priority == expected_priority
    assert notes


def test_ingestion_sorts_rows_and_reports_missing_weeks() -> None:
    csv = (
        "account_id,week_start,login_count\n"
        "T-1,2026-09-14,7\n"
        "T-1,2026-08-31,5\n"
    )
    parsed = parse_usage_csv(csv)[0]
    assert [item.login_count for item in parsed.weekly_logins] == [5, 7]
    assert parsed.account_age_weeks == 3
    assert parsed.missing_weeks == [date(2026, 9, 7)]


@pytest.mark.parametrize(
    ("csv", "message"),
    [
        ("account_id,week_start\nT,2026-01-05\n", "Missing required columns"),
        ("account_id,week_start,login_count\nT,2026-01-05,\n", "null or blank"),
        ("account_id,week_start,login_count\nT,2026-02-30,2\n", "valid YYYY-MM-DD"),
        ("account_id,week_start,login_count\nT,2026-01-05,-1\n", "non-negative whole numbers"),
        (
            "account_id,week_start,login_count\nT,2026-01-05,2\nT,2026-01-05,3\n",
            "duplicate",
        ),
        (
            "account_id,week_start,login_count\nT,2026-01-05,2\nT,2026-01-09,3\n",
            "not 7 days apart",
        ),
    ],
)
def test_ingestion_rejects_invalid_csv(csv: str, message: str) -> None:
    with pytest.raises(ValueError, match=message):
        parse_usage_csv(csv)


def test_ingestion_rejects_empty_csv() -> None:
    with pytest.raises(ValueError, match="at least one data row"):
        parse_usage_csv("account_id,week_start,login_count\n")


def test_api_lists_accounts_and_summary() -> None:
    response = client.get("/accounts")
    assert response.status_code == 200
    assert len(response.json()) == 16
    summary = client.get("/risk-summary").json()
    assert summary["total_accounts"] == 16
    assert summary["counts"] == {
        "Insufficient Data": 2,
        "Healthy": 5,
        "Watch": 3,
        "At Risk": 4,
        "Critical": 2,
    }


def test_sample_data_covers_decline_boundaries_and_zero_baseline() -> None:
    reports = {
        report["account_id"]: report
        for report in client.get("/accounts").json()
    }
    expected = {
        "VNT-009": (0.71, "Healthy"),
        "VNT-010": (15.0, "Watch"),
        "VNT-011": (20.0, "Watch"),
        "VNT-012": (30.0, "At Risk"),
        "VNT-013": (40.0, "At Risk"),
        "VNT-014": (50.0, "At Risk"),
        "VNT-015": (51.0, "Critical"),
        "VNT-016": (0.0, "Healthy"),
    }
    for account_id, (decline, risk_level) in expected.items():
        assert reports[account_id]["decline_percent"] == pytest.approx(decline)
        assert reports[account_id]["risk_level"] == risk_level
        assert reports[account_id]["account_age_weeks"] == 12


def test_api_account_lookup_and_high_risk() -> None:
    assert client.get("/accounts/VNT-004").json()["risk_level"] == "Critical"
    assert client.get("/accounts/unknown").status_code == 404
    assert all(
        item["risk_level"] in {"At Risk", "Critical"}
        for item in client.get("/high-risk").json()
    )


def test_api_analyze_and_validation() -> None:
    response = client.post("/analyze", json={"csv_content": csv_for([100] * 4 + [50] * 4)})
    assert response.status_code == 200
    assert response.json()[0]["risk_level"] == "At Risk"
    assert client.post("/analyze", json={"csv_content": "bad"}).status_code == 422


def test_api_openapi_and_health() -> None:
    assert client.get("/healthz").json() == {"status": "ok"}
    assert "/analyze" in client.get("/openapi.json").json()["paths"]


def test_langgraph_workflow_runs_all_stages() -> None:
    reports = run_workflow(csv_for([100] * 4 + [50] * 4))
    assert reports[0]["risk_level"] == RiskLevel.AT_RISK
    assert reports[0]["explanation"]
    assert reports[0]["recommended_action"] == "Customer Success outreach"


def test_langgraph_workflow_loads_default_accounts() -> None:
    assert len(run_workflow()) == 16
