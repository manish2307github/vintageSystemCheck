# Vantage Churn Early Warning System

The goal is to help Vantage Retail Systems Customer Success spot declining account engagement early and decide when to follow up. The system uses explainable weekly-login signals as an early-warning proxy; it does not predict whether or when an account will churn. Its risk levels describe usage patterns, not confirmed churn outcomes.

## What this project is (and is not)

This is a demo early-warning system: it applies shared, transparent rules to synthetic weekly login histories to highlight declining engagement and suggest a follow-up action. The sample accounts are not real companies, and their histories do not represent company-specific parameters.

It is not a churn prediction model. It has no labeled churn or renewal outcomes, does not estimate a churn probability or date, and has not been validated against actual customer outcomes. A risk level is a usage signal for human review, not proof that an account will churn.

### Turning it into a churn prediction model

Building a predictive model would require historical customer data linked to clearly defined churn or renewal outcomes. Define the outcome and prediction horizon, assemble features available before that outcome, and prevent future information from leaking into training. Train and compare a baseline model, evaluate it on a time-based holdout using metrics suited to the business and class balance, then validate its usefulness with Customer Success before any operational use. Add privacy and access controls, monitoring for data and model drift, and a human review process. Until that work is done, treat this project’s scores as heuristic engagement signals only.

## Start the application

Requirements: Rancher Desktop with the `dockerd (Moby)` container engine and Docker Compose. In Rancher Desktop, select **dockerd (Moby)** under **Container Engine**, apply the setting, and restart Rancher Desktop. Verify the CLI and Compose plugin are available:

```powershell
docker version
docker compose version
```

```sh
docker compose up --build
```

Keep this terminal open while the services run.

- Dashboard: <http://localhost:3000>
- API: <http://localhost:8000>
- OpenAPI / Swagger UI: <http://localhost:8000/docs>
- MCP streamable HTTP: <http://localhost:8001/mcp>

Stop the services with `Ctrl+C`, then remove the containers with:

```sh
docker compose down
```

If Rancher Desktop uses `containerd`, use `nerdctl compose` instead of `docker compose` if that command is available in your installation.

## Architecture

- `backend/`: FastAPI API, Pandas CSV ingestion, Pydantic models, scoring, explanation, and retention playbook.
- `agents/`: sequential LangGraph workflow: Data → Trend → Explanation → Retention.
- `mcp-server/`: MCP tools backed by the same workflow and domain rules.
- `frontend/`: Next.js dashboard with overview, account table, and account detail views.
- `tests/`: Pytest domain, ingestion, API, and workflow tests.
- `docs/architecture.md`: assumptions, risk definitions, decisions, and tradeoffs.

The dashboard calls the API from the browser. The API and MCP server share the LangGraph workflow and deterministic domain logic. No language model makes or alters risk decisions. The dashboard uses local CSS rather than Tailwind.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/accounts` | All account reports and weekly history |
| GET | `/accounts/{id}` | One account report |
| GET | `/risk-summary` | Total and per-level counts |
| GET | `/high-risk` | At Risk and Critical accounts |
| POST | `/analyze` | Analyze CSV provided as `{"csv_content":"..."}` |

CSV columns: `account_id,week_start,login_count`. Invalid or null values return HTTP 422. OpenAPI is served at `/openapi.json`.

### Smoke test

With the services running, use PowerShell to check health, sample data, and an account report:

```powershell
Invoke-RestMethod http://localhost:8000/healthz
Invoke-RestMethod http://localhost:8000/risk-summary
Invoke-RestMethod http://localhost:8000/accounts/VNT-004
```

The active API sample has 16 synthetic accounts. `VNT-004` should be Critical; `VNT-007` and `VNT-008` should be Insufficient Data. The risk summary should report 5 Healthy, 3 Watch, 4 At Risk, 2 Critical, and 2 Insufficient Data accounts.

To test CSV analysis, open `/docs`, expand `POST /analyze`, select **Try it out**, and submit:

```json
{
  "csv_content": "account_id,week_start,login_count\nT-1,2026-08-31,100\nT-1,2026-09-07,100\nT-1,2026-09-14,100\nT-1,2026-09-21,100\nT-1,2026-09-28,50\nT-1,2026-10-05,50\nT-1,2026-10-12,50\nT-1,2026-10-19,50"
}
```

The response should classify `T-1` as `At Risk` and include an explanation and recommended action.

## MCP connection

Start with `docker compose up --build`, then configure an MCP client for streamable HTTP at `http://localhost:8001/mcp`. For clients using JSON configuration:

```json
{
  "mcpServers": {
    "vantage-churn": {
      "url": "http://localhost:8001/mcp"
    }
  }
}
```

Tools: `get_account_usage(account_id)`, `calculate_risk(account_id)`, `explain_risk(account_id)`, and `recommend_action(account_id)`.

## Tests

Python 3.12 is required for backend tests:

```sh
python -m pip install -r backend/requirements.txt
python -m pytest
```

Pytest enforces at least 80% coverage for `backend.app` and `agents`. To build the dashboard:

```sh
cd frontend
npm ci
npm run build
```

The root Node.js prototype has separate tests. Run `npm test` from the repository root; these tests do not cover the Compose application.

## Repository notes

- Source repository: [github.com/manish2307github/vintageSystemCheck](https://github.com/manish2307github/vintageSystemCheck).
- `docs/architecture.md` records risk assumptions, thresholds, workflow, and tradeoffs.
- `backend/data/weekly_usage.csv` contains synthetic usage histories for 16 demo accounts, not data from 16 real companies. The histories exercise different patterns, risk-band boundaries, and data-quality cases, but every account is scored using the same rules and thresholds; there are no company-specific parameters. This is demo and test data, not labeled churn training data or evidence of predictive accuracy.
- The root `src/` and `test/` directories contain a pre-existing Node.js prototype. It uses `data/seed.json`, Compose does not run it, and its scoring rules differ from the Python service.
- `.github/workflows/ci.yml` runs backend tests, dashboard build, legacy prototype tests, and a Compose end-to-end smoke test on pushes and pull requests.
- The MCP endpoint has no authentication. Keep it on a trusted local network; do not expose it publicly without access controls.
- Do not commit credentials, `.env` files, or generated build output.
