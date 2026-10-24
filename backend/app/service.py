from agents.workflow import run_workflow
from backend.app.models import AccountReport, AccountUsage
from backend.app.ingestion import load_default_accounts


def build_reports(accounts: list[AccountUsage]) -> list[AccountReport]:
    return [
        AccountReport.model_validate(report)
        for report in run_workflow(accounts=[account.model_dump() for account in accounts])
    ]


def get_default_reports() -> list[AccountReport]:
    return build_reports(load_default_accounts())


def analyze_csv(csv_content: str) -> list[AccountReport]:
    return [
        AccountReport.model_validate(report)
        for report in run_workflow(csv_content=csv_content)
    ]
