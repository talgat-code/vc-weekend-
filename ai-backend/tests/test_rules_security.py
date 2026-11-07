from __future__ import annotations

from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.rules.payment import extract_money, iban_valid, parse_money


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
