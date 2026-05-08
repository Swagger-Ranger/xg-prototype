"""Insight agent eval — CI gate for /api/v1/insights.

Each fixture is a metrics payload + expectations. Assertions check the
properties that matter most:
  - no fabricated metric refs (every `type=metric` ref id must be a real
    key in the fixture metrics)
  - severity invariant (quiet input must not yield critical; loud input
    should yield at least one warn/critical)
  - item-count bounds (quiet ≤ 2 items, loud ≥ 2 items)
  - JSON parse success (error_message is None)

Run (requires sidecar on localhost:8000):
  .venv/bin/python -m eval.insight_eval

Exits 1 if any fixture fails so this can be wired into CI directly.
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.api.insight import _flatten_metric_keys


SIDECAR_URL = os.environ.get("SIDECAR_URL", "http://localhost:8000")
ENDPOINT = f"{SIDECAR_URL}/api/v1/insights"


@dataclass
class Case:
    name: str
    role: str
    metrics: dict[str, Any]
    min_items: int = 0
    max_items: int = 5
    # If set, at least one insight must have this severity.
    expect_severity: str | None = None
    # If set, no insight is allowed to have this severity.
    forbid_severity: str | None = None
    note: str = ""


FIXTURES: list[Case] = [
    Case(
        name="dean_quiet",
        role="dean",
        metrics={
            "scope": "global",
            "total_students": 5,
            "total_counselors": 2,
            "alerts_open_total": 0,
            "alerts_by_severity": {},
            "leave_pending": 0,
            "leave_submitted_last_7d": 0,
            "leave_submitted_prev_7d": 0,
            "violations_last_30d": 0,
            "checkin_late_last_7d": 0,
            "top_counselor_workload": [],
        },
        min_items=0,
        max_items=2,
        forbid_severity="critical",
        note="全院无异常,不应编出 critical",
    ),
    Case(
        name="dean_critical",
        role="dean",
        metrics={
            "scope": "global",
            "total_students": 50,
            "total_counselors": 3,
            "alerts_open_total": 5,
            "alerts_by_severity": {"critical": 2, "medium": 3},
            "leave_pending": 18,
            "leave_submitted_last_7d": 12,
            "leave_submitted_prev_7d": 3,
            "violations_last_30d": 4,
            "checkin_late_last_7d": 9,
            "top_counselor_workload": [
                {"name": "张老师", "pending": 12},
                {"name": "李老师", "pending": 4},
            ],
        },
        min_items=2,
        max_items=5,
        expect_severity="critical",
        note="critical 告警 + 审批堆积 + 环比激增,应产出 critical",
    ),
    Case(
        name="counselor_empty_class",
        role="counselor",
        metrics={
            "scope": "counselor",
            "counselor_id": 9999,
            "class_student_count": 0,
            "empty_class": True,
            "leave_pending": 0,
            "leave_uncancelled_overdue": 0,
            "alerts_open": 0,
            "alerts_critical": 0,
            "violations_last_30d": 0,
            "checkin_late_last_7d": 0,
        },
        min_items=0,
        max_items=2,
        forbid_severity="critical",
        note="空班辅导员,降级提示即可,不应硬凑洞察",
    ),
]


@dataclass
class CaseResult:
    name: str
    ok: bool
    items: int
    severities: list[str]
    fabricated_refs: list[tuple[str, str]] = field(default_factory=list)
    error_message: str | None = None
    failures: list[str] = field(default_factory=list)


def _assert(case: Case, payload: dict[str, Any]) -> CaseResult:
    insights = payload.get("insights") or []
    err = payload.get("error_message")
    result = CaseResult(
        name=case.name,
        ok=True,
        items=len(insights),
        severities=[i.get("severity", "?") for i in insights],
        error_message=err,
    )

    if err:
        result.failures.append(f"llm error: {err}")

    if not (case.min_items <= len(insights) <= case.max_items):
        result.failures.append(
            f"item count {len(insights)} outside [{case.min_items}, {case.max_items}]"
        )

    if case.expect_severity and not any(
        i.get("severity") == case.expect_severity for i in insights
    ):
        result.failures.append(f"missing expected severity={case.expect_severity}")

    if case.forbid_severity and any(
        i.get("severity") == case.forbid_severity for i in insights
    ):
        result.failures.append(f"forbidden severity={case.forbid_severity} present")

    valid_keys = _flatten_metric_keys(case.metrics)
    for item in insights:
        title = item.get("title", "?")
        for ref in item.get("refs", []) or []:
            if ref.get("type") == "metric":
                rid = ref.get("id", "")
                if rid and rid not in valid_keys:
                    result.fabricated_refs.append((title, rid))
    if result.fabricated_refs:
        result.failures.append(
            f"{len(result.fabricated_refs)} fabricated metric ref(s)"
        )

    result.ok = not result.failures
    return result


def run_case(case: Case, client: httpx.Client) -> CaseResult:
    body = {
        "role": case.role,
        "scope_key": "eval",
        "user_id": "0",
        "user_role": case.role,
        "tenant_id": "default",
        "metrics": case.metrics,
    }
    try:
        r = client.post(ENDPOINT, json=body, timeout=90.0)
        r.raise_for_status()
        return _assert(case, r.json())
    except Exception as e:
        return CaseResult(
            name=case.name, ok=False, items=0, severities=[],
            failures=[f"http error: {e}"],
        )


def _print_row(r: CaseResult) -> None:
    status = "PASS" if r.ok else "FAIL"
    sev = ",".join(r.severities) if r.severities else "-"
    print(f"  [{status}] {r.name:<24} items={r.items:<2} sev=[{sev}]")
    for f in r.failures:
        print(f"           └─ {f}")
    for title, rid in r.fabricated_refs:
        print(f"           └─ fab ref: {title!r} → {rid!r}")


def main() -> int:
    print(f"Insight eval target: {ENDPOINT}")
    print(f"Fixtures: {len(FIXTURES)}")
    print()
    results: list[CaseResult] = []
    with httpx.Client(trust_env=False) as client:
        for case in FIXTURES:
            print(f"  ... running {case.name}")
            r = run_case(case, client)
            results.append(r)

    print("\n── Summary ────────────────────────────────")
    for r in results:
        _print_row(r)

    passed = sum(1 for r in results if r.ok)
    total = len(results)
    print(f"\n{passed}/{total} passed")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
