from collections import Counter

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from backend.app.models import AccountReport, AnalyzeRequest, RiskLevel, RiskSummary
from backend.app.service import analyze_csv, get_default_reports

app = FastAPI(
    title="Vantage Churn Early Warning API",
    description="Explainable account engagement signals from weekly login history.",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/accounts")
def list_accounts() -> list[AccountReport]:
    return get_default_reports()


@app.get("/accounts/{account_id}")
def get_account(account_id: str) -> AccountReport:
    account = next(
        (item for item in get_default_reports() if item.account_id == account_id),
        None,
    )
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found.")
    return account


@app.get("/risk-summary")
def risk_summary() -> RiskSummary:
    reports = get_default_reports()
    counts = Counter(report.risk_level.value for report in reports)
    return {
        "total_accounts": len(reports),
        "counts": {level.value: counts.get(level.value, 0) for level in RiskLevel},
    }


@app.get("/high-risk")
def high_risk() -> list[AccountReport]:
    return [
        report for report in get_default_reports()
        if report.risk_level in {RiskLevel.AT_RISK, RiskLevel.CRITICAL}
    ]


@app.post("/analyze")
def analyze(request: AnalyzeRequest) -> list[AccountReport]:
    try:
        return analyze_csv(request.csv_content)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.get("/healthz")
def health() -> dict[str, str]:
    return {"status": "ok"}
