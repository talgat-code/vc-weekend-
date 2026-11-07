from __future__ import annotations

import io

import pymupdf
from docx import Document
from fastapi.testclient import TestClient


def upload(client: TestClient, auth, filename: str, content: bytes, document_type: str = "invoice"):
    return client.post("/api/v1/analyze", headers=auth, data={"document_type": document_type}, files={"file": (filename, content)})


def test_analyze_txt_returns_canonical_with_provenance(client: TestClient, auth):
    response = upload(client, auth, "invoice.txt", b"SYNTHETIC Invoice No. INV-284 Total 12 800 USD")
    assert response.status_code == 200
    data = response.json()
    assert data["invoice"]["fields"]["invoice_amount"]["value"] == "12800"
    source = data["invoice"]["fields"]["invoice_amount"]
    assert source["source_document"] == "invoice.txt"
    assert source["status"] == "extracted"


def test_analyze_contract_document_type(client: TestClient, auth):
    response = upload(client, auth, "contract.txt", b"SYNTHETIC Contract No. VED-1 Total 12 800 USD", "contract")
    assert response.status_code == 200
    assert response.json()["contract"]["document_type"] == "contract"


def test_analyze_other_populates_application_stage(client: TestClient, auth):
    response = upload(client, auth, "application.txt", b"SYNTHETIC other supporting document", "other")
    assert response.status_code == 200
    assert response.json()["application"]["document_type"] == "other"
    assert response.json()["application"]["filename"] == "application.txt"


def test_docx_fixture_is_valid_and_parsed(client: TestClient, auth):
    stream = io.BytesIO()
    document = Document()
    document.add_paragraph("SYNTHETIC Invoice No. INV-284 Total 12 800 USD")
    document.save(stream)
    response = upload(client, auth, "invoice.docx", stream.getvalue())
    assert response.status_code == 200
    assert response.json()["invoice"]["fields"]["invoice_amount"]["value"] == "12800"


def test_pdf_fixture_is_valid_and_parsed(client: TestClient, auth):
    document = pymupdf.open()
    page = document.new_page()
    page.insert_text((72, 72), "SYNTHETIC Invoice No. INV-284 Total 12 800 USD")
    content = document.tobytes()
    document.close()
    response = upload(client, auth, "invoice.pdf", content)
    assert response.status_code == 200
    assert response.json()["invoice"]["fields"]["invoice_amount"]["value"] == "12800"


def test_rejects_unsupported_upload(client: TestClient, auth):
    response = upload(client, auth, "scan.png", b"image")
    assert response.status_code == 415


def test_rejects_oversized_upload(client: TestClient, auth):
    response = upload(client, auth, "large.txt", b"x" * (1024 * 1024 + 1))
    assert response.status_code == 413


def test_can_append_analyzed_document_to_workflow(client: TestClient, auth, complete_payload):
    workflow = client.post("/api/v1/workflows", headers=auth, json=complete_payload).json()
    response = client.post("/api/v1/analyze", headers=auth, data={"document_type": "invoice", "analysis_id": workflow["analysis_id"]}, files={"file": ("new.txt", b"Invoice No. INV-2 Total 12 800 USD")})
    assert response.status_code == 200
    assert response.json()["analysis_id"] == workflow["analysis_id"]


def test_docx_tables_and_bilingual_labels_are_parsed(client: TestClient, auth):
    stream = io.BytesIO()
    document = Document()
    table = document.add_table(rows=5, cols=2)
    values = [
        ("Contract No. / Договор №", "VED-BI-001"),
        ("Seller / Продавец", "Synthetic Global Equipment Ltd"),
        ("Buyer / Покупатель", "ТОО Синтетик Казахстан"),
        ("Contract Value / Цена договора", "51 000 USD"),
        ("Beneficiary Bank / Банк получателя", "Synthetic Demo Bank"),
    ]
    for row, (label, value) in zip(table.rows, values):
        row.cells[0].text, row.cells[1].text = label, value
    document.save(stream)
    response = upload(client, auth, "bilingual.docx", stream.getvalue(), "contract")
    fields = response.json()["contract"]["fields"]
    assert fields["contract_number"]["value"] == "VED-BI-001"
    assert fields["seller_name"]["value"] == "Synthetic Global Equipment Ltd"
    assert fields["contract_amount"]["value"] == "51000"
    assert fields["beneficiary_bank_name"]["value"] == "Synthetic Demo Bank"
    assert fields["contract_expiry_date"]["value"] is None
    assert fields["contract_expiry_date"]["status"] == "missing"


def test_pdf_column_table_is_parsed(client: TestClient, auth):
    document = pymupdf.open()
    page = document.new_page()
    for y, label, value in [
        (72, "Contract No.", "VED-PDF-001"),
        (96, "Seller", "Synthetic Supplier Ltd"),
        (120, "Contract Value", "51 000 USD"),
    ]:
        page.insert_text((72, y), label)
        page.insert_text((300, y), value)
    response = upload(client, auth, "columns.pdf", document.tobytes(), "contract")
    document.close()
    fields = response.json()["contract"]["fields"]
    assert fields["contract_number"]["value"] == "VED-PDF-001"
    assert fields["seller_name"]["value"] == "Synthetic Supplier Ltd"
    assert fields["contract_amount"]["value"] == "51000"


def test_different_bilingual_table_values_require_verification(client: TestClient, auth):
    stream = io.BytesIO()
    document = Document()
    table = document.add_table(rows=2, cols=2)
    table.rows[0].cells[0].text, table.rows[0].cells[1].text = "Seller", "Supplier One"
    table.rows[1].cells[0].text, table.rows[1].cells[1].text = "Продавец", "Supplier Two"
    document.save(stream)
    response = upload(client, auth, "conflict.docx", stream.getvalue(), "contract")
    data = response.json()
    assert data["contract"]["fields"]["seller_name"]["status"] == "needs_verification"
    assert "BILINGUAL_VALUE_CONFLICT" in {issue["code"] for issue in data["issues"]}


def test_parallel_bilingual_columns_require_verification(client: TestClient, auth):
    stream = io.BytesIO()
    document = Document()
    table = document.add_table(rows=1, cols=4)
    for cell, value in zip(table.rows[0].cells, ("Seller", "Supplier One", "Продавец", "Supplier Two")):
        cell.text = value
    document.save(stream)
    data = upload(client, auth, "parallel.docx", stream.getvalue(), "contract").json()
    assert data["contract"]["fields"]["seller_name"]["value"] == "Supplier One"
    assert data["contract"]["fields"]["seller_name"]["status"] == "needs_verification"


def test_subtotal_is_not_treated_as_invoice_total(client: TestClient, auth):
    stream = io.BytesIO()
    document = Document()
    table = document.add_table(rows=2, cols=2)
    table.rows[0].cells[0].text, table.rows[0].cells[1].text = "Subtotal", "10 000 USD"
    table.rows[1].cells[0].text, table.rows[1].cells[1].text = "Total", "12 800 USD"
    document.save(stream)
    data = upload(client, auth, "totals.docx", stream.getvalue()).json()
    assert data["invoice"]["fields"]["invoice_amount"]["value"] == "12800"
    assert data["invoice"]["fields"]["invoice_amount"]["status"] == "extracted"


def test_contract_and_invoice_can_be_analyzed_together(client: TestClient, auth):
    response = client.post("/api/v1/analyze", headers=auth, files={
        "contract_file": ("contract.txt", b"Contract No. VED-1\nSeller: Supplier One\nContract Value: 51 000 USD"),
        "invoice_file": ("invoice.txt", b"Invoice No. INV-1\nContract No: VED-1\nSeller: Supplier Two\nTotal: 12 800 USD"),
    })
    assert response.status_code == 200
    data = response.json()
    assert data["contract"]["filename"] == "contract.txt"
    assert data["invoice"]["filename"] == "invoice.txt"
    assert "SELLER_DETAILS_CONFLICT" in {issue["code"] for issue in data["issues"]}
    assert "INVOICE_AMOUNT_EXCEEDS_CONTRACT" not in {issue["code"] for issue in data["issues"]}


def test_reanalysis_preserves_user_confirmed_contract_value(client: TestClient, auth, complete_payload):
    workflow = client.post("/api/v1/workflows", headers=auth, json=complete_payload).json()
    response = client.post("/api/v1/analyze", headers=auth, data={"document_type": "contract", "analysis_id": workflow["analysis_id"]},
        files={"file": ("replacement.txt", b"Contract No. AI-REPLACEMENT Total 51 000 USD")})
    assert response.status_code == 200
    field = response.json()["contract"]["fields"]["contract_number"]
    assert field["value"] == "VED-1"
    assert field["confirmed_by_user"] is True


def test_reanalysis_uses_preserved_invoice_amount_for_validation(client: TestClient, auth, complete_payload):
    workflow = client.post("/api/v1/workflows", headers=auth, json=complete_payload).json()
    response = client.post("/api/v1/analyze", headers=auth, data={"document_type": "invoice", "analysis_id": workflow["analysis_id"]},
        files={"file": ("replacement.txt", b"Invoice No. INV-NEW Total 15 800 USD")})
    assert response.status_code == 200
    data = response.json()
    assert data["invoice"]["fields"]["invoice_amount"]["value"] == "12800"
    assert data["payment"]["underlying"]["invoice_amount"] == "12800"


def test_unconfirmed_reconciliation_does_not_freeze_extracted_fields(client: TestClient, auth):
    workflow = upload(client, auth, "first.txt", b"Invoice No. INV-1 Total 12 800 USD").json()
    analysis_id = workflow["analysis_id"]
    patch = client.patch(f"/api/v1/workflows/{analysis_id}", headers=auth, json={
        "step": "invoice", "fields": {"invoice_amount": "12800"}, "confirm_fields": [], "actor": "user",
    })
    assert patch.json()["invoice"]["fields"]["invoice_amount"]["confirmed_by_user"] is False
    response = client.post("/api/v1/analyze", headers=auth, data={"document_type": "invoice", "analysis_id": analysis_id},
        files={"file": ("second.txt", b"Invoice No. INV-2 Total 15 800 USD")})
    assert response.json()["invoice"]["fields"]["invoice_amount"]["value"] == "15800"


def test_document_can_be_removed_from_workflow(client: TestClient, auth):
    workflow = upload(client, auth, "invoice.txt", b"Invoice No. INV-1 Total 12 800 USD").json()
    response = client.delete(f"/api/v1/workflows/{workflow['analysis_id']}/documents/invoice", headers=auth)
    assert response.status_code == 200
    assert response.json()["invoice"]["filename"] is None
    assert response.json()["invoice"]["fields"] == {}
