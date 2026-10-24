import asyncio
import json
import socket
import time
from urllib.request import Request, urlopen

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

API_URL = "http://localhost:8000"
DASHBOARD_URL = "http://localhost:3000"
MCP_URL = "http://localhost:8001/mcp"


def wait_for_http(url: str, timeout: int = 120) -> None:
    deadline = time.monotonic() + timeout
    last_error = None
    while time.monotonic() < deadline:
        try:
            with urlopen(url, timeout=3) as response:
                if response.status == 200:
                    return
        except OSError as error:
            last_error = error
        time.sleep(2)
    raise RuntimeError(f"Timed out waiting for {url}: {last_error}")


def wait_for_mcp_port(timeout: int = 120) -> None:
    deadline = time.monotonic() + timeout
    last_error = None
    while time.monotonic() < deadline:
        try:
            with socket.create_connection(("localhost", 8001), timeout=3):
                return
        except OSError as error:
            last_error = error
        time.sleep(2)
    raise RuntimeError(f"Timed out waiting for MCP server: {last_error}")


def get_json(path: str) -> dict | list:
    with urlopen(f"{API_URL}{path}", timeout=10) as response:
        if response.status != 200:
            raise AssertionError(f"GET {path} returned HTTP {response.status}")
        return json.load(response)


def post_json(path: str, payload: dict) -> dict | list:
    request = Request(
        f"{API_URL}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=10) as response:
        if response.status != 200:
            raise AssertionError(f"POST {path} returned HTTP {response.status}")
        return json.load(response)


async def check_mcp() -> None:
    async with streamablehttp_client(MCP_URL) as (read_stream, write_stream, _):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            tools = await session.list_tools()
            names = {tool.name for tool in tools.tools}
            expected = {
                "get_account_usage",
                "calculate_risk",
                "explain_risk",
                "recommend_action",
            }
            assert expected <= names, f"Missing MCP tools: {expected - names}"

            result = await session.call_tool("calculate_risk", {"account_id": "VNT-014"})
            assert not result.isError, "MCP calculate_risk returned an error"
            structured_content = (
                getattr(result, "structuredContent", None)
                or getattr(result, "structured_content", None)
            )
            if structured_content is not None:
                assert structured_content["risk_level"] == "At Risk"
            else:
                text = "\n".join(
                    block.text for block in result.content if hasattr(block, "text")
                )
                assert "risk_level" in text and "At Risk" in text


def main() -> None:
    wait_for_http(f"{API_URL}/healthz")
    wait_for_http(DASHBOARD_URL)
    wait_for_mcp_port()

    with urlopen(DASHBOARD_URL, timeout=10) as response:
        assert b"Churn early warning" in response.read()

    accounts = get_json("/accounts")
    assert len(accounts) == 16
    summary = get_json("/risk-summary")
    assert summary["counts"] == {
        "Insufficient Data": 2,
        "Healthy": 5,
        "Watch": 3,
        "At Risk": 4,
        "Critical": 2,
    }
    assert get_json("/accounts/VNT-007")["risk_level"] == "Insufficient Data"

    csv_content = "\n".join([
        "account_id,week_start,login_count",
        "E2E-1,2026-08-31,100",
        "E2E-1,2026-09-07,100",
        "E2E-1,2026-09-14,100",
        "E2E-1,2026-09-21,100",
        "E2E-1,2026-09-28,50",
        "E2E-1,2026-10-05,50",
        "E2E-1,2026-10-12,50",
        "E2E-1,2026-10-19,50",
    ])
    report = post_json("/analyze", {"csv_content": csv_content})[0]
    assert report["risk_level"] == "At Risk"
    assert report["explanation"]
    assert report["recommended_action"] == "Customer Success outreach"

    asyncio.run(check_mcp())
    print("End-to-end smoke test passed.")


if __name__ == "__main__":
    main()
