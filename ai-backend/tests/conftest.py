from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def client(tmp_path: Path):
    settings = Settings(
        database_url=f"sqlite:///{(tmp_path / 'test.db').as_posix()}", ai_demo_mode=True,
        frontend_origin="http://localhost:5173", max_upload_bytes=1024 * 1024,
        rate_limit_requests=1000, rate_limit_window_seconds=60,
    )
    with TestClient(create_app(settings)) as value:
        yield value


@pytest.fixture
def auth(client: TestClient) -> dict[str, str]:
    response = client.post("/api/v1/sessions")
    assert response.status_code == 201
    return {"X-Session-Token": response.json()["session_token"]}


@pytest.fixture
def complete_payload() -> dict:
    return {
        "mode": "deterministic",
        "contract": {"contract_number": "VED-1", "seller_name": "Synthetic Supplier", "contract_amount": "51000", "contract_currency": "USD", "contract_registration_number": "DEMO-UNK"},
        "application": {"document_number": "INV-1", "document_date": "2026-11-06", "document_type": "invoice", "supporting_documents": [{"name": "invoice.pdf"}], "linked_to_contract": True},
        "invoice": {"invoice_number": "INV-1", "invoice_amount": "12800", "invoice_currency": "USD"},
        "payment": {
            "debit_account": "KZ account", "transfer_amount": "12800", "value_date": "2026-11-10", "urgent_transfer": False,
            "beneficiary_bank_swift": "BKCHCNBJ92A", "intermediary_bank": "", "knp": "710",
            "payment_purpose": "Invoice INV-1, 12 800 USD", "supporting_document_number": "INV-1", "supporting_document_date": "2026-11-06", "beneficiary_name": "Synthetic Supplier",
            "beneficiary_residency_country": "China", "beneficiary_account": "GB82 WEST 1234 5698 7654 32", "kbe": "17", "beneficiary_address_country": "China",
            "beneficiary_address_type": "legal", "commission_type": "SHA", "commission_debit_account": "KZ account",
            "director_signatory": "Demo Director", "chief_accountant_signatory": "Не предусмотрен", "agreement_accepted": True,
        },
    }
