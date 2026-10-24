from backend.app.models import RiskLevel

PLAYBOOK = {
    RiskLevel.INSUFFICIENT_DATA: (
        "Collect more weekly usage history",
        "Low",
        "Wait for at least 8 consecutive weeks before assigning a usage-based risk level.",
    ),
    RiskLevel.HEALTHY: (
        "Monitor normally",
        "Low",
        "Continue routine account reviews and monitor weekly usage.",
    ),
    RiskLevel.WATCH: (
        "Send customer health check",
        "Medium",
        "Ask about workflow, staffing, or seasonal changes before escalating.",
    ),
    RiskLevel.AT_RISK: (
        "Customer Success outreach",
        "High",
        "Contact the account owner, validate the usage change, and agree on one adoption goal.",
    ),
    RiskLevel.CRITICAL: (
        "Immediate executive engagement",
        "Urgent",
        "Escalate to the account executive and Customer Success lead for a same-week recovery plan.",
    ),
}


def recommend_action(risk_level: RiskLevel) -> tuple[str, str, str]:
    return PLAYBOOK[risk_level]
