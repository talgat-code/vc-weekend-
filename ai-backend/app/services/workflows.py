from __future__ import annotations

import json
import uuid
from copy import deepcopy
from pathlib import Path
from typing import Any

from app.repositories import Repository
from app.rules import evaluate_workflow
from app.schemas.workflow import (
    ApplicationRecord,
    CreateWorkflowRequest,
    DocumentRecord,
    DocumentType,
    ExtractedField,
    PaymentRecord,
    WorkflowPatchRequest,
    WorkflowResponse,
    WorkflowState,
    WorkflowStep,
)

FIXTURES = Path(__file__).parent.parent / "demo" / "fixtures" / "scenarios.json"


class ConfirmedFieldConflict(ValueError):
    pass


def _fields(values: dict[str, Any], document_type: DocumentType, method: str = "user") -> dict[str, ExtractedField]:
    filename = "synthetic-demo.json" if method == "demo" else "api-input"
    status = "extracted" if method == "demo" else "confirmed"
    return {key: ExtractedField(
        value=value, source_document=filename, source_section="demo" if method == "demo" else "user",
        source_excerpt=str(value)[:160], confidence="high", status=status,
        confirmed_by_user=method == "user",
    ) for key, value in values.items()}


def base_workflow(mode: str = "deterministic") -> dict[str, Any]:
    return {
        "analysis_id": str(uuid.uuid4()), "mode": mode,
        "contract": DocumentRecord(document_type=DocumentType.CONTRACT).model_dump(mode="json"),
        "application": ApplicationRecord(document_type=DocumentType.OTHER).model_dump(mode="json"),
        "invoice": DocumentRecord(document_type=DocumentType.INVOICE).model_dump(mode="json"),
        "payment": PaymentRecord().model_dump(mode="json"),
        "issues": [], "missing_fields": [], "next_actions": [], "ready_for_review": False,
    }


def from_request(payload: CreateWorkflowRequest) -> dict[str, Any]:
    data = base_workflow(payload.mode)
    data["contract"]["fields"] = {k: v.model_dump(mode="json") for k, v in _fields(payload.contract, DocumentType.CONTRACT).items()}
    app_values = dict(payload.application)
    linked = bool(app_values.pop("linked_to_contract", True))
    data["application"]["linked_to_contract"] = linked
    data["application"]["fields"] = {k: v.model_dump(mode="json") for k, v in _fields(app_values, DocumentType.OTHER).items()}
    data["invoice"]["fields"] = {k: v.model_dump(mode="json") for k, v in _fields(payload.invoice, DocumentType.INVOICE).items()}
    data["payment"]["fields"] = payload.payment
    invoice_amount = payload.invoice.get("invoice_amount", payload.invoice.get("amount"))
    data["payment"]["underlying"] = {"invoice_amount": invoice_amount, "invoice_currency": payload.invoice.get("invoice_currency", payload.invoice.get("currency")), "application_number": None, "link_currency_contract": None, "supporting_documents": [], "use_bonuses": False}
    return canonicalize(data)


def demo_scenario(scenario_id: str) -> dict[str, Any] | None:
    fixtures = json.loads(FIXTURES.read_text(encoding="utf-8"))
    definition = fixtures["scenarios"].get(scenario_id.upper())
    if not definition:
        return None
    values = deepcopy(fixtures["base"])
    for dotted, value in definition.get("overrides", {}).items():
        stage, field = dotted.split(".", 1)
        values[stage][field] = value
    data = base_workflow("demo")
    data["contract"]["filename"] = "synthetic_contract.txt"
    data["contract"]["fields"] = {k: v.model_dump(mode="json") for k, v in _fields(values["contract"], DocumentType.CONTRACT, "demo").items()}
    app = dict(values["application"])
    data["application"]["linked_to_contract"] = app.pop("linked_to_contract")
    data["application"]["fields"] = {k: v.model_dump(mode="json") for k, v in _fields(app, DocumentType.OTHER, "demo").items()}
    data["invoice"]["filename"] = "synthetic_invoice.txt"
    data["invoice"]["fields"] = {k: v.model_dump(mode="json") for k, v in _fields(values["invoice"], DocumentType.INVOICE, "demo").items()}
    data["payment"]["fields"] = values["payment"]
    data["payment"]["underlying"] = {
        "invoice_amount": values["invoice"].get("invoice_amount"), "invoice_currency": values["invoice"].get("invoice_currency"),
        "application_number": "APP-DEMO-001", "link_currency_contract": values["contract"].get("contract_number"),
        "supporting_documents": values["application"].get("supporting_documents", []), "use_bonuses": False, "synthetic": True,
    }
    return canonicalize(data)


def canonicalize(data: dict[str, Any]) -> dict[str, Any]:
    issues, missing = evaluate_workflow(data)
    blocking = [issue for issue in issues if issue.severity == "blocking"]
    contract_fields = data["contract"]["fields"]
    app_fields = data["application"]["fields"]
    contract_done = all(key in contract_fields for key in ("contract_number", "seller_name", "contract_amount", "contract_currency"))
    application_done = all(key in app_fields for key in ("document_number", "document_date", "document_type"))
    payment_done = not any(issue.blocking_step == "payment" for issue in blocking) and not missing
    status_done = payment_done and bool(data["payment"]["fields"].get("agreement_accepted"))
    done = {"contract": contract_done, "application": application_done, "payment": payment_done, "status": status_done}
    first_incomplete = next((step for step in ("contract", "application", "payment", "status") if not done[step]), "status")
    blocking_ids = [issue.id for issue in blocking]
    steps = []
    labels = {"contract": "Валютный договор", "application": "Заявление", "payment": "Валютный платёж", "status": "Статус"}
    for step in ("contract", "application", "payment", "status"):
        blocked = any(issue.blocking_step == step and issue.severity == "blocking" for issue in issues)
        status = "completed" if done[step] else "needs_attention" if blocked else "in_progress" if step == first_incomplete else "not_started"
        steps.append(WorkflowStep(id=step, label=labels[step], status=status))
    ready = payment_done and bool(data["payment"]["fields"].get("agreement_accepted"))
    next_action = "Демонстрационный пакет подготовлен. Данные не отправлены в банк." if ready else f"Проверьте этап «{labels[first_incomplete]}» и исправьте отмеченные поля."
    data.update({
        "workflow": WorkflowState(current_step="status" if ready else first_incomplete, steps=steps,
            completed_steps=[step for step, complete in done.items() if complete], blocking_issues=blocking_ids, next_action=next_action).model_dump(mode="json"),
        "issues": [issue.model_dump(mode="json") for issue in issues], "missing_fields": missing,
        "next_actions": [next_action], "ready_for_review": ready,
    })
    return WorkflowResponse.model_validate(data).model_dump(mode="json")


def patch_workflow(repository: Repository, session_id: str, data: dict[str, Any], patch: WorkflowPatchRequest) -> dict[str, Any]:
    if patch.step == "payment":
        values = data["payment"]["fields"]
        confirmed = set(data["payment"]["confirmed_fields"])
        for field, new in patch.fields.items():
            previous = values.get(field)
            values[field] = new
            repository.add_audit(session_id, data["analysis_id"], patch.actor, "field_updated", patch.step, field, previous, new)
        for field in patch.confirm_fields:
            if field not in values:
                raise ValueError(field)
            if field not in confirmed:
                repository.add_audit(session_id, data["analysis_id"], patch.actor, "field_confirmed", patch.step, field, False, True)
                confirmed.add(field)
        data["payment"]["confirmed_fields"] = list(dict.fromkeys([*data["payment"]["confirmed_fields"], *patch.confirm_fields]))
    else:
        fields = data[patch.step]["fields"]
        document_type = DocumentType(data[patch.step]["document_type"])
        for field, new in patch.fields.items():
            previous_field = fields.get(field)
            previous = previous_field.get("value") if previous_field else None
            if previous_field:
                previous_field.update(value=new, source_document="api-input", source_section="user", source_excerpt=str(new)[:160], confidence="high", status="confirmed", confirmed_by_user=True)
            else:
                fields[field] = _fields({field: new}, document_type)[field].model_dump(mode="json")
            repository.add_audit(session_id, data["analysis_id"], patch.actor, "field_updated", patch.step, field, previous, new)
        for field in patch.confirm_fields:
            if field not in fields:
                raise ValueError(field)
            previous = fields[field]["confirmed_by_user"]
            fields[field]["confirmed_by_user"] = True
            fields[field]["status"] = "confirmed"
            repository.add_audit(session_id, data["analysis_id"], patch.actor, "field_confirmed", patch.step, field, previous, True)
        if patch.step == "invoice":
            for field, target in (("amount", "invoice_amount"), ("currency", "invoice_currency")):
                if field in fields:
                    data["payment"]["underlying"][target] = fields[field]["value"]
    result = canonicalize(data)
    repository.save_workflow(session_id, result)
    return result
