from __future__ import annotations

from fastapi.testclient import TestClient

CANONICAL_KEYS = {
    "analysis_id", "mode", "workflow", "contract", "application", "invoice", "payment",
    "issues", "missing_fields", "next_actions", "ready_for_review",
}
FIELD_IDS = [
    "application_number", "debit_account", "transfer_amount", "value_date", "urgent_transfer", "beneficiary_bank_swift",
    "intermediary_bank", "knp", "payment_purpose", "linked_to_contract", "supporting_document_number", "supporting_document_date", "supporting_documents",
    "beneficiary_name", "beneficiary_residency_country", "beneficiary_account", "kbe", "beneficiary_address_country",
    "beneficiary_address_type", "commission_type", "commission_debit_account", "director_signatory", "chief_accountant_signatory", "use_bonuses", "agreement_accepted",
]


def test_health(client: TestClient):
    assert client.get("/health").json()["status"] == "ok"


def test_session_is_additional_public_endpoint(client: TestClient):
    response = client.post("/api/v1/sessions")
    assert response.status_code == 201
    assert len(response.json()["session_token"]) >= 32


def test_session_token_required(client: TestClient):
    response = client.get("/api/v1/fields")
    assert response.status_code == 401
    assert response.json()["errors"][0]["code"] == "SESSION_REQUIRED"


def test_exact_25_field_ids_and_order(client: TestClient, auth):
    fields = client.get("/api/v1/fields", headers=auth).json()
    assert len(fields) == 25
    assert [field["id"] for field in fields] == FIELD_IDS
    assert "currency" not in FIELD_IDS


def test_every_field_has_exact_definition_shape(client: TestClient, auth):
    fields = client.get("/api/v1/fields", headers=auth).json()
    expected = {"id", "label", "type", "required", "source", "editable", "visible", "dependencies", "help_text"}
    assert all(set(field) == expected for field in fields)
    assert all(field["visible"] and field["editable"] for field in fields)


def test_create_returns_full_canonical_workflow(client: TestClient, auth, complete_payload):
    response = client.post("/api/v1/workflows", headers=auth, json=complete_payload)
    assert response.status_code == 201
    data = response.json()
    assert set(data) == CANONICAL_KEYS
    assert [step["id"] for step in data["workflow"]["steps"]] == ["contract", "application", "payment", "status"]
    assert data["ready_for_review"] is True


def test_get_persists_workflow(client: TestClient, auth, complete_payload):
    created = client.post("/api/v1/workflows", headers=auth, json=complete_payload).json()
    loaded = client.get(f"/api/v1/workflows/{created['analysis_id']}", headers=auth)
    assert loaded.status_code == 200
    assert loaded.json() == created


def test_application_stage_and_document_type(client: TestClient, auth, complete_payload):
    data = client.post("/api/v1/workflows", headers=auth, json=complete_payload).json()
    assert data["application"]["document_type"] == "other"
    assert data["application"]["fields"]["document_type"]["value"] == "invoice"
    assert data["application"]["linked_to_contract"] is True


def test_extracted_fields_have_provenance(client: TestClient, auth, complete_payload):
    data = client.post("/api/v1/workflows", headers=auth, json=complete_payload).json()
    field = data["contract"]["fields"]["contract_number"]
    assert set(field) == {"value", "source_document", "source_section", "source_excerpt", "confidence", "status", "confirmed_by_user"}


def test_status_endpoint(client: TestClient, auth, complete_payload):
    workflow = client.post("/api/v1/workflows", headers=auth, json=complete_payload).json()
    status = client.get(f"/api/v1/workflows/{workflow['analysis_id']}/status", headers=auth).json()
    assert status["current_step"] == "status"
    assert status["ready_for_review"] is True


def test_draft_returns_canonical_and_is_audited(client: TestClient, auth, complete_payload):
    workflow = client.post("/api/v1/workflows", headers=auth, json=complete_payload).json()
    draft = client.post(f"/api/v1/workflows/{workflow['analysis_id']}/draft", headers=auth)
    assert set(draft.json()) == CANONICAL_KEYS
    audit = client.get(f"/api/v1/workflows/{workflow['analysis_id']}/audit", headers=auth).json()
    assert "draft_saved" in [event["action"] for event in audit["events"]]


def test_cross_session_ownership_returns_404(client: TestClient, auth, complete_payload):
    workflow = client.post("/api/v1/workflows", headers=auth, json=complete_payload).json()
    other = {"X-Session-Token": client.post("/api/v1/sessions").json()["session_token"]}
    response = client.get(f"/api/v1/workflows/{workflow['analysis_id']}", headers=other)
    assert response.status_code == 404


def test_patch_cors_preflight(client: TestClient):
    response = client.options("/api/v1/workflows/id", headers={
        "Origin": "http://localhost:5173", "Access-Control-Request-Method": "PATCH",
        "Access-Control-Request-Headers": "x-session-token,content-type",
    })
    assert response.status_code == 200
    assert "PATCH" in response.headers["access-control-allow-methods"]


def test_openapi_has_required_routes(client: TestClient):
    paths = set(client.get("/openapi.json").json()["paths"])
    assert {
        "/api/v1/fields", "/api/v1/analyze", "/api/v1/workflows", "/api/v1/workflows/{analysis_id}",
        "/api/v1/workflows/{analysis_id}/contract", "/api/v1/workflows/{analysis_id}/application", "/api/v1/workflows/{analysis_id}/payment",
        "/api/v1/workflows/{analysis_id}/validate", "/api/v1/workflows/{analysis_id}/draft",
        "/api/v1/workflows/{analysis_id}/status", "/api/v1/demo/run/{scenario_id}",
    } <= paths
