from mcp.server.fastmcp import FastMCP

from agents.workflow import run_workflow

mcp = FastMCP("Vantage Churn Signals", host="0.0.0.0", port=8001)


def _find_account(account_id: str) -> dict:
    report = next(
        (item for item in run_workflow() if item["account_id"] == account_id),
        None,
    )
    if report is None:
        raise ValueError(f"Account {account_id} not found.")
    return report


@mcp.tool()
def get_account_usage(account_id: str) -> dict:
    """Return the weekly login history and account age."""
    account = _find_account(account_id)
    return {
        "account_id": account["account_id"],
        "weekly_logins": account["weekly_logins"],
        "account_age_weeks": account["account_age_weeks"],
    }


@mcp.tool()
def calculate_risk(account_id: str) -> dict:
    """Return the account's usage-based risk score and evidence."""
    report = _find_account(account_id)
    return {key: report[key] for key in (
        "account_id", "previous_average", "recent_average", "decline_percent",
        "trend_slope", "risk_level", "confidence",
    )}


@mcp.tool()
def explain_risk(account_id: str) -> str:
    """Return the business-friendly explanation for an account's risk."""
    return _find_account(account_id)["explanation"]


@mcp.tool()
def recommend_action(account_id: str) -> dict:
    """Return the retention action, priority, and customer success notes."""
    report = _find_account(account_id)
    return {key: report[key] for key in (
        "recommended_action", "priority", "customer_success_notes",
    )}


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
