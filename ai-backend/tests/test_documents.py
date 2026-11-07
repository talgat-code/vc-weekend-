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
