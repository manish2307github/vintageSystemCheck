from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from backend.app.explanations import explain_risk
from backend.app.ingestion import load_default_accounts, parse_usage_csv
from backend.app.models import AccountUsage, RiskLevel, RiskScore
from backend.app.playbook import recommend_action
from backend.app.scoring import score_account


class WorkflowState(TypedDict, total=False):
    csv_content: str
    accounts: list[AccountUsage]
    scores: list[dict]
    reports: list[dict]


def data_agent(state: WorkflowState) -> dict:
    if state.get("csv_content") is not None:
        accounts = parse_usage_csv(state["csv_content"])
    elif state.get("accounts") is not None:
        accounts = [AccountUsage.model_validate(account) for account in state["accounts"]]
    else:
        accounts = load_default_accounts()
    return {"accounts": accounts}


def trend_agent(state: WorkflowState) -> dict:
    return {"scores": [score_account(account).model_dump(mode="json") for account in state["accounts"]]}


def explanation_agent(state: WorkflowState) -> dict:
    reports = []
    for account, raw_score in zip(state["accounts"], state["scores"], strict=True):
        score = RiskScore.model_validate(raw_score)
        reports.append({
            **account.model_dump(mode="json"),
            **score.model_dump(mode="json"),
            "explanation": explain_risk(account, score),
        })
    return {"reports": reports}


def retention_agent(state: WorkflowState) -> dict:
    reports = []
    for report in state["reports"]:
        action, priority, notes = recommend_action(RiskLevel(report["risk_level"]))
        reports.append({
            **report,
            "recommended_action": action,
            "priority": priority,
            "customer_success_notes": notes,
        })
    return {"reports": reports}


def build_workflow():
    graph = StateGraph(WorkflowState)
    graph.add_node("data_agent", data_agent)
    graph.add_node("trend_agent", trend_agent)
    graph.add_node("explanation_agent", explanation_agent)
    graph.add_node("retention_agent", retention_agent)
    graph.add_edge(START, "data_agent")
    graph.add_edge("data_agent", "trend_agent")
    graph.add_edge("trend_agent", "explanation_agent")
    graph.add_edge("explanation_agent", "retention_agent")
    graph.add_edge("retention_agent", END)
    return graph.compile()


workflow = build_workflow()


def run_workflow(csv_content: str | None = None) -> list[dict]:
    result = workflow.invoke({"csv_content": csv_content} if csv_content is not None else {})
    return result["reports"]
