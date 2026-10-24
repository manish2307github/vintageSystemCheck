from datetime import date
from enum import StrEnum

from pydantic import BaseModel, Field


class RiskLevel(StrEnum):
    INSUFFICIENT_DATA = "Insufficient Data"
    HEALTHY = "Healthy"
    WATCH = "Watch"
    AT_RISK = "At Risk"
    CRITICAL = "Critical"


class WeeklyLogin(BaseModel):
    week_start: date
    login_count: int = Field(ge=0)


class AccountUsage(BaseModel):
    account_id: str = Field(min_length=1)
    weekly_logins: list[WeeklyLogin]
    account_age_weeks: int = Field(ge=1)
    missing_weeks: list[date] = Field(default_factory=list)


class RiskScore(BaseModel):
    account_id: str
    previous_average: float | None
    recent_average: float | None
    decline_percent: float | None
    trend_slope: float | None
    risk_level: RiskLevel
    confidence: float = Field(ge=0, le=100)


class AccountReport(BaseModel):
    account_id: str
    weekly_logins: list[WeeklyLogin]
    account_age_weeks: int
    missing_weeks: list[date]
    previous_average: float | None
    recent_average: float | None
    decline_percent: float | None
    trend_slope: float | None
    risk_level: RiskLevel
    confidence: float = Field(ge=0, le=100)
    explanation: str
    recommended_action: str
    priority: str
    customer_success_notes: str


class RiskSummary(BaseModel):
    total_accounts: int
    counts: dict[str, int]


class AnalyzeRequest(BaseModel):
    csv_content: str = Field(min_length=1)
