from __future__ import annotations

from fastapi.testclient import TestClient


def run_c(client: TestClient, auth: dict[str, str]) -> dict:
    response = client.post("/api/v1/demo/run/C", headers=auth)
    assert response.status_code == 201
    return response.json()


def test_all_scenarios_a_to_f_exist(client: TestClient, auth):
    for scenario in "ABCDEF":
        assert client.post(f"/api/v1/demo/run/{scenario}", headers=auth).status_code == 201


def test_scenario_c_exact_invoice_and_purpose_amounts(client: TestClient, auth):
    data = run_c(client, auth)
    assert data["invoice"]["fields"]["invoice_amount"]["value"] == "12800.00"
    assert "15 800 USD" in data["payment"]["fields"]["payment_purpose"]
    assert data["payment"]["underlying"]["invoice_amount"] == "12800.00"


def test_scenario_c_is_persisted_and_blocked(client: TestClient, auth):
    data = run_c(client, auth)
    loaded = client.get(f"/api/v1/workflows/{data['analysis_id']}", headers=auth).json()
    assert loaded["analysis_id"] == data["analysis_id"]
    assert "PAYMENT_PURPOSE_AMOUNT_MISMATCH" in {issue["code"] for issue in loaded["issues"]}
    assert loaded["ready_for_review"] is False


def test_validate_does_not_automatically_correct_scenario_c(client: TestClient, auth):
    data = run_c(client, auth)
    validated = client.post(f"/api/v1/workflows/{data['analysis_id']}/validate", headers=auth).json()
    assert "15 800 USD" in validated["payment"]["fields"]["payment_purpose"]
    assert "PAYMENT_PURPOSE_AMOUNT_MISMATCH" in {issue["code"] for issue in validated["issues"]}


def test_manual_patch_then_validate_removes_mismatch(client: TestClient, auth):
    data = run_c(client, auth)
    url = f"/api/v1/workflows/{data['analysis_id']}"
    patch = client.patch(url, headers=auth, json={
        "step": "payment", "fields": {"payment_purpose": "Оплата по инвойсу INV-DEMO-001, 12 800 USD"},
        "actor": "user", "confirm_fields": ["payment_purpose"],
    })
    assert patch.status_code == 200
    validated = client.post(f"{url}/validate", headers=auth).json()
    assert "PAYMENT_PURPOSE_AMOUNT_MISMATCH" not in {issue["code"] for issue in validated["issues"]}
    assert validated["ready_for_review"] is True


def test_patch_audit_has_previous_new_actor_action(client: TestClient, auth):
    data = run_c(client, auth)
    client.patch(f"/api/v1/workflows/{data['analysis_id']}", headers=auth, json={
        "step": "payment", "fields": {"payment_purpose": "Invoice INV-DEMO-001, 12 800 USD"}, "actor": "user", "confirm_fields": [],
    })
    events = client.get(f"/api/v1/workflows/{data['analysis_id']}/audit", headers=auth).json()["events"]
    event = next(event for event in events if event["action"] == "field_updated")
    assert event["actor"] == "user"
    assert "15 800 USD" in event["previous_value"]
    assert "12 800 USD" in event["new_value"]


def test_confirmed_payment_value_is_preserved(client: TestClient, auth):
    data = run_c(client, auth)
    url = f"/api/v1/workflows/{data['analysis_id']}"
    first = {"step": "payment", "fields": {"payment_purpose": "Invoice INV-284, 12 800 USD"}, "confirm_fields": ["payment_purpose"], "actor": "user"}
    assert client.patch(url, headers=auth, json=first).status_code == 200
    replacement = {"step": "payment", "fields": {"payment_purpose": "Changed, 11 000 USD"}, "confirm_fields": [], "actor": "user"}
    response = client.patch(url, headers=auth, json=replacement)
    assert response.status_code == 200
    assert response.json()["payment"]["fields"]["payment_purpose"] == "Changed, 11 000 USD"


def test_over_50k_has_registration_review_state(client: TestClient, auth):
    data = client.post("/api/v1/demo/run/A", headers=auth).json()
    assert data["application"]["registration_review_required"] is True
    assert data["contract"]["fields"]["contract_registration_number"]["value"] == "DEMO-UNK-001"


def test_registration_number_can_be_updated(client: TestClient, auth):
    data = client.post("/api/v1/demo/run/A", headers=auth).json()
    patched = client.patch(f"/api/v1/workflows/{data['analysis_id']}", headers=auth, json={
        "step": "application", "fields": {"registration_number": "REG-SYNTHETIC-1"}, "confirm_fields": ["registration_number"], "actor": "user",
    }).json()
    assert patched["application"]["fields"]["registration_number"]["value"] == "REG-SYNTHETIC-1"
    assert patched["ready_for_review"] is True


def test_unknown_demo_scenario_is_404(client: TestClient, auth):
    assert client.post("/api/v1/demo/run/Z", headers=auth).status_code == 404


def test_missing_invoice_is_structured_blocker(client: TestClient, auth):
    data = client.post("/api/v1/demo/run/B", headers=auth).json()
    issue = next(issue for issue in data["issues"] if issue["code"] == "MISSING_SUPPORTING_DOCUMENT")
    assert issue["severity"] == "blocking"
    assert issue["recommended_action"]


def test_missing_swift_is_not_invented(client: TestClient, auth):
    data = client.post("/api/v1/demo/run/D", headers=auth).json()
    assert data["payment"]["fields"]["beneficiary_bank_swift"] == ""
    assert "REQUIRED_FIELD_MISSING" in {issue["code"] for issue in data["issues"]}


def test_prompt_injection_cannot_approve_workflow(client: TestClient, auth):
    data = client.post("/api/v1/demo/run/E", headers=auth).json()
    assert "Ignore previous instructions" in data["contract"]["fields"]["contract_subject"]["value"]
    assert data["mode"] == "demo"
    assert data["workflow"]["current_step"] == "status"


def test_multiple_purpose_amounts_require_verification(client: TestClient, auth):
    data = run_c(client, auth)
    response = client.patch(f"/api/v1/workflows/{data['analysis_id']}/payment", headers=auth, json={
        "fields": {"payment_purpose": "Аванс 5 000 USD, остаток 7 800 USD"}
    }).json()
    codes = {issue["code"] for issue in response["issues"]}
    assert "PAYMENT_PURPOSE_AMOUNT_AMBIGUOUS" in codes
    assert "PAYMENT_PURPOSE_AMOUNT_MISMATCH" not in codes


def test_no_amount_in_purpose_does_not_force_mismatch(client: TestClient, auth):
    data = run_c(client, auth)
    response = client.patch(f"/api/v1/workflows/{data['analysis_id']}/payment", headers=auth, json={
        "fields": {"payment_purpose": "Оплата по инвойсу INV-DEMO-001"}
    }).json()
    assert "PAYMENT_PURPOSE_AMOUNT_MISMATCH" not in {issue["code"] for issue in response["issues"]}


def test_agreement_is_never_accepted_automatically(client: TestClient, auth):
    data = run_c(client, auth)
    response = client.patch(f"/api/v1/workflows/{data['analysis_id']}/payment", headers=auth, json={
        "fields": {"agreement_accepted": False}
    }).json()
    assert response["payment"]["fields"]["agreement_accepted"] is False
    assert response["ready_for_review"] is False
