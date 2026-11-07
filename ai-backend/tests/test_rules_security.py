from __future__ import annotations

from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.rules.payment import evaluate_workflow, extract_money, iban_valid, parse_money


def test_deterministic_money_parser():
    assert parse_money("Purpose 15 800 USD") == (Decimal("15800"), "USD")
    assert parse_money("без суммы") == (None, None)


@pytest.mark.parametrize("text", [
    "12 800 USD", "12,800 USD", "12800 USD", "12 800,00 USD", "USD 12,800.00",
])
def test_supported_money_formats(text):
    assert parse_money(text) == (Decimal("12800"), "USD")


def test_money_parser_does_not_consume_dates_or_invoice_ids():
    assert extract_money("INV-001 от 06.11.2026, сумма 12 800 USD") == [(Decimal("12800"), "USD")]


def test_iban_validation():
    assert iban_valid("GB82 WEST 1234 5698 7654 32") is True
    assert iban_valid("GB00 WEST 1234 5698 7654 32") is False
    assert iban_valid("622208881100483905") is None


def test_invoice_larger_than_contract_is_a_blocking_issue(complete_payload):
    complete_payload["invoice"]["invoice_amount"] = "52000"
    complete_payload["payment"]["transfer_amount"] = "52000"
    complete_payload["payment"]["payment_purpose"] = "Invoice INV-1, 52 000 USD"
    issues, _ = evaluate_workflow({
        "contract": {"fields": {key: {"value": value} for key, value in complete_payload["contract"].items()}},
        "application": {"fields": {key: {"value": value} for key, value in complete_payload["application"].items()}},
        "invoice": {"fields": {key: {"value": value} for key, value in complete_payload["invoice"].items()}},
        "payment": {"fields": complete_payload["payment"], "underlying": {}},
    })
    assert "INVOICE_AMOUNT_EXCEEDS_CONTRACT" in {issue.code for issue in issues}


def test_partial_invoice_is_not_contract_amount_conflict(complete_payload):
    issues, _ = evaluate_workflow({
        "contract": {"fields": {key: {"value": value} for key, value in complete_payload["contract"].items()}},
        "application": {"fields": {key: {"value": value} for key, value in complete_payload["application"].items()}},
        "invoice": {"fields": {key: {"value": value} for key, value in complete_payload["invoice"].items()}},
        "payment": {"fields": complete_payload["payment"], "underlying": {}},
    })
    assert "INVOICE_AMOUNT_EXCEEDS_CONTRACT" not in {issue.code for issue in issues}


def test_cross_document_currency_and_bank_conflicts_are_explicit(complete_payload):
    complete_payload["contract"].update({"beneficiary_swift": "DEUTDEFF", "beneficiary_account": "GB82WEST12345698765432"})
    complete_payload["invoice"].update({"invoice_currency": "EUR", "beneficiary_swift": "NEDSZAJJ", "beneficiary_account": "DE89370400440532013000"})
    issues, _ = evaluate_workflow({
        "contract": {"fields": {key: {"value": value} for key, value in complete_payload["contract"].items()}},
        "application": {"fields": {key: {"value": value} for key, value in complete_payload["application"].items()}},
        "invoice": {"fields": {key: {"value": value} for key, value in complete_payload["invoice"].items()}},
        "payment": {"fields": complete_payload["payment"], "underlying": {}},
    })
    codes = {issue.code for issue in issues}
    assert "DOCUMENT_CURRENCY_MISMATCH" in codes
    assert "BENEFICIARY_DETAILS_CONFLICT" in codes


def test_rate_limit_response(tmp_path: Path):
    settings = Settings(database_url=f"sqlite:///{(tmp_path / 'rate.db').as_posix()}", rate_limit_requests=1, rate_limit_window_seconds=60)
    with TestClient(create_app(settings)) as client:
        assert client.get("/health").status_code == 200
        response = client.get("/health")
    assert response.status_code == 429
    assert response.json()["errors"][0]["code"] == "RATE_LIMITED"


def test_security_headers(client: TestClient):
    response = client.get("/health")
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
