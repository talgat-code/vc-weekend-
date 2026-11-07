from __future__ import annotations

import uuid
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from app.api.dependencies import session_owner
from app.repositories import NotFound
from app.schemas.workflow import (
    AuditResponse,
    CreateWorkflowRequest,
    DocumentType,
    ErrorResponse,
    FieldDefinition,
    SessionResponse,
    StatusResponse,
    WorkflowPatchRequest,
    WorkflowResponse,
)
from app.services.documents import ALLOWED, DocumentFailure, deterministic_extract, openai_extract, read_text
from app.services.fields import PAYMENT_FIELDS
from app.services.workflows import (
    ConfirmedFieldConflict,
    base_workflow,
    canonicalize,
    demo_scenario,
    from_request,
    patch_workflow,
)

router = APIRouter(prefix="/api/v1")
SessionId = Annotated[str, Depends(session_owner)]
ALLOWED_MIME = {
    ".pdf": {"application/pdf", "application/octet-stream"},
    ".docx": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/octet-stream"},
    ".txt": {"text/plain", "application/octet-stream"},
}


@router.post("/sessions", response_model=SessionResponse, status_code=201, tags=["session"])
def create_session(request: Request):
    token, expires = request.app.state.repository.create_session()
    return SessionResponse(session_token=token, expires_at=expires)


@router.get("/fields", response_model=list[FieldDefinition], tags=["workflow"])
def fields(session_id: SessionId):
    return [field.model_dump(mode="json") for field in PAYMENT_FIELDS]


@router.post("/analyze", response_model=WorkflowResponse, responses={422: {"model": ErrorResponse}}, tags=["workflow"])
async def analyze(
    request: Request,
    session_id: SessionId,
    document_type: Annotated[DocumentType | None, Form()] = None,
    file: Annotated[UploadFile | None, File()] = None,
    contract_file: Annotated[UploadFile | None, File()] = None,
    invoice_file: Annotated[UploadFile | None, File()] = None,
    analysis_id: Annotated[str | None, Form()] = None,
):
    uploads = [(DocumentType.CONTRACT, contract_file), (DocumentType.INVOICE, invoice_file)]
    if file is not None and document_type is not None:
        uploads.append((document_type, file))
    uploads = [(kind, upload) for kind, upload in uploads if upload is not None]
    if not uploads:
        raise HTTPException(422, {"code": "DOCUMENT_REQUIRED", "message": "Загрузите договор или инвойс в PDF/DOCX."})
    settings = request.app.state.settings
    mode = "demo" if settings.ai_demo_mode else "deterministic"
    if analysis_id:
        try:
            data = request.app.state.repository.get_workflow(session_id, analysis_id)
        except NotFound as exc:
            raise HTTPException(404, {"code": "WORKFLOW_NOT_FOUND", "message": "Анализ не найден."}) from exc
        data["mode"] = mode
    else:
        data = base_workflow(mode)
    analyzed_names = []
    for kind, upload in uploads:
        filename = Path(upload.filename or "upload").name
        suffix = Path(filename).suffix.lower()
        if suffix not in ALLOWED:
            raise HTTPException(415, {"code": "UNSUPPORTED_FILE", "message": "Поддерживаются PDF, DOCX и TXT."})
        if upload.content_type and upload.content_type not in ALLOWED_MIME[suffix]:
            raise HTTPException(415, {"code": "INVALID_FILE_TYPE", "message": "Тип содержимого файла не соответствует его расширению. Выберите исходный PDF, DOCX или TXT."})
        content = await upload.read(settings.max_upload_bytes + 1)
        await upload.close()
        if not content:
            raise HTTPException(422, {"code": "EMPTY_FILE", "message": "Файл пуст."})
        if len(content) > settings.max_upload_bytes:
            raise HTTPException(413, {"code": "FILE_TOO_LARGE", "message": "Файл превышает допустимый размер."})
        try:
            text = read_text(filename, content)
        except DocumentFailure as exc:
            raise HTTPException(422, {"code": "DOCUMENT_PARSE_FAILED", "message": str(exc)}) from exc
        extracted = deterministic_extract(filename, kind, text)
        if settings.openai_api_key and not settings.ai_demo_mode:
            try:
                extracted = openai_extract(filename, kind, text, settings)
                mode = "openai"
            except Exception:
                mode = "deterministic"
        stage = "application" if kind == DocumentType.OTHER else kind.value
        data[stage]["document_id"] = str(uuid.uuid4())
        data[stage]["filename"] = filename
        data[stage]["document_type"] = kind.value
        previous_fields = data[stage]["fields"]
        merged_fields = {}
        for key, value in extracted.items():
            previous = previous_fields.get(key)
            if previous and previous.get("confirmed_by_user"):
                merged_fields[key] = previous
            else:
                merged_fields[key] = value.model_dump(mode="json")
        data[stage]["fields"] = merged_fields
        if stage == "invoice":
            amount = merged_fields.get("invoice_amount") or merged_fields.get("amount")
            currency = merged_fields.get("invoice_currency") or merged_fields.get("currency")
            data["payment"]["underlying"].update({
                "invoice_amount": amount.get("value") if amount else None,
                "invoice_currency": currency.get("value") if currency else None,
            })
        analyzed_names.append(filename)
    data["mode"] = mode
    result = canonicalize(data)
    if analysis_id:
        request.app.state.repository.save_workflow(session_id, result)
    else:
        request.app.state.repository.create_workflow(session_id, result)
    audit_step = uploads[0][0].value if len(uploads) == 1 else "documents"
    request.app.state.repository.add_audit(session_id, result["analysis_id"], "ai" if mode == "openai" else "system", "document_analyzed", audit_step, None, None, analyzed_names)
    return result


@router.post("/workflows", response_model=WorkflowResponse, status_code=201, tags=["workflow"])
def create_workflow(payload: CreateWorkflowRequest, request: Request, session_id: SessionId):
    data = from_request(payload)
    request.app.state.repository.create_workflow(session_id, data)
    request.app.state.repository.add_audit(session_id, data["analysis_id"], "user", "workflow_created", "workflow", None, None, data["analysis_id"])
    return data


def _get(request: Request, session_id: str, analysis_id: str) -> dict:
    try:
        return request.app.state.repository.get_workflow(session_id, analysis_id)
    except NotFound as exc:
        raise HTTPException(404, {"code": "WORKFLOW_NOT_FOUND", "message": "Анализ не найден."}) from exc


@router.get("/workflows/{analysis_id}", response_model=WorkflowResponse, tags=["workflow"])
def get_workflow(analysis_id: str, request: Request, session_id: SessionId):
    return _get(request, session_id, analysis_id)


@router.delete("/workflows/{analysis_id}/documents/{document_type}", response_model=WorkflowResponse, tags=["workflow"])
def delete_document(document_type: DocumentType, analysis_id: str, request: Request, session_id: SessionId):
    if document_type not in {DocumentType.CONTRACT, DocumentType.INVOICE}:
        raise HTTPException(422, {"code": "DOCUMENT_TYPE_INVALID", "message": "Можно удалить только договор или инвойс."})
    data = _get(request, session_id, analysis_id)
    stage = document_type.value
    previous = data[stage].get("filename")
    data[stage].update({"document_id": None, "filename": None, "fields": {}})
    if document_type == DocumentType.INVOICE:
        data["payment"]["underlying"].update({"invoice_amount": None, "invoice_currency": None})
        supporting = data["application"]["fields"].get("supporting_documents")
        if supporting:
            supporting.update(value=[], status="confirmed", confirmed_by_user=True, source_document="api-input")
    result = canonicalize(data)
    request.app.state.repository.save_workflow(session_id, result)
    request.app.state.repository.add_audit(session_id, analysis_id, "user", "document_removed", stage, None, previous, None)
    return result


@router.patch("/workflows/{analysis_id}", response_model=WorkflowResponse, tags=["workflow"])
def update_workflow(analysis_id: str, payload: WorkflowPatchRequest, request: Request, session_id: SessionId):
    data = _get(request, session_id, analysis_id)
    try:
        return patch_workflow(request.app.state.repository, session_id, data, payload)
    except ConfirmedFieldConflict as exc:
        raise HTTPException(409, {"code": "CONFIRMED_FIELD_IMMUTABLE", "message": "Подтверждённое значение нельзя заменить. Сначала создайте новый анализ.", "field": str(exc)}) from exc
    except ValueError as exc:
        raise HTTPException(422, {"code": "FIELD_NOT_FOUND", "message": "Нельзя подтвердить отсутствующее поле.", "field": str(exc)}) from exc


def _stage_patch(stage: str, analysis_id: str, payload: WorkflowPatchRequest, request: Request, session_id: str):
    payload.step = stage
    return update_workflow(analysis_id, payload, request, session_id)


@router.patch("/workflows/{analysis_id}/contract", response_model=WorkflowResponse, tags=["workflow"])
def update_contract(analysis_id: str, payload: WorkflowPatchRequest, request: Request, session_id: SessionId):
    return _stage_patch("contract", analysis_id, payload, request, session_id)


@router.patch("/workflows/{analysis_id}/application", response_model=WorkflowResponse, tags=["workflow"])
def update_application(analysis_id: str, payload: WorkflowPatchRequest, request: Request, session_id: SessionId):
    return _stage_patch("application", analysis_id, payload, request, session_id)


@router.patch("/workflows/{analysis_id}/payment", response_model=WorkflowResponse, tags=["workflow"])
def update_payment(analysis_id: str, payload: WorkflowPatchRequest, request: Request, session_id: SessionId):
    return _stage_patch("payment", analysis_id, payload, request, session_id)


@router.post("/workflows/{analysis_id}/validate", response_model=WorkflowResponse, tags=["workflow"])
def validate_workflow(analysis_id: str, request: Request, session_id: SessionId):
    data = canonicalize(_get(request, session_id, analysis_id))
    request.app.state.repository.save_workflow(session_id, data)
    request.app.state.repository.add_audit(session_id, analysis_id, "user", "validation_requested", "workflow", None, None, {"ready_for_review": data["ready_for_review"]})
    return data


@router.post("/workflows/{analysis_id}/draft", response_model=WorkflowResponse, tags=["workflow"])
def save_draft(analysis_id: str, request: Request, session_id: SessionId):
    data = canonicalize(_get(request, session_id, analysis_id))
    request.app.state.repository.save_workflow(session_id, data)
    request.app.state.repository.add_audit(session_id, analysis_id, "user", "draft_saved", "workflow", None, None, "saved")
    return data


@router.get("/workflows/{analysis_id}/status", response_model=StatusResponse, tags=["workflow"])
def workflow_status(analysis_id: str, request: Request, session_id: SessionId):
    data = _get(request, session_id, analysis_id)
    events = request.app.state.repository.audit(session_id, analysis_id)
    blockers = data["workflow"]["blocking_issues"]
    confirmed = data["payment"].get("confirmed_fields", [])
    return StatusResponse(
        analysis_id=analysis_id, status="requires_correction" if blockers else "draft_prepared" if data["ready_for_review"] else "waiting_for_user_confirmation",
        message="Демонстрационный статус. Данные не отправлены в банк.", current_step=data["workflow"]["current_step"],
        ready_for_review=data["ready_for_review"], blocking_issues=blockers,
        prepared_summary=["Договор и заявление сохранены.", "Платёжный черновик подготовлен."],
        requires_review=[issue["message"] for issue in data["issues"]],
        ai_suggestions=["AI-значения требуют проверки пользователем."] if data["mode"] == "openai" else [],
        user_confirmations=[f"Подтверждено поле: {field}" for field in confirmed], next_action=data["workflow"]["next_action"],
        audit=events, updated_at=request.app.state.repository.updated_at(session_id, analysis_id),
    )


@router.get("/workflows/{analysis_id}/audit", response_model=AuditResponse, tags=["workflow"])
def workflow_audit(analysis_id: str, request: Request, session_id: SessionId):
    try:
        events = request.app.state.repository.audit(session_id, analysis_id)
    except NotFound as exc:
        raise HTTPException(404, {"code": "WORKFLOW_NOT_FOUND", "message": "Анализ не найден."}) from exc
    return AuditResponse(analysis_id=analysis_id, events=events)


@router.post("/demo/run/{scenario_id}", response_model=WorkflowResponse, status_code=201, tags=["demo"])
def run_demo(scenario_id: str, request: Request, session_id: SessionId):
    data = demo_scenario(scenario_id)
    if not data:
        raise HTTPException(404, {"code": "SCENARIO_NOT_FOUND", "message": "Сценарий должен быть от A до F."})
    request.app.state.repository.create_workflow(session_id, data)
    request.app.state.repository.add_audit(session_id, data["analysis_id"], "system", "demo_started", "workflow", None, None, scenario_id.upper())
    return data


@router.get("/contracts", tags=["contract"])
def list_contracts(session_id: SessionId):
    return [{"id": "demo-contract-001", "contract_number": "VED-DEMO-2026-041", "seller_name": "Demo Atlas Equipment Ltd.", "contract_amount": "51000.00", "contract_currency": "USD", "synthetic": True}]


@router.get("/demo/scenarios", tags=["demo"])
def list_demo_scenarios(session_id: SessionId):
    import json
    from app.services.workflows import FIXTURES
    scenarios = json.loads(FIXTURES.read_text(encoding="utf-8"))["scenarios"]
    return [{"id": key, "title": value["title"], "description": value.get("description", ""), "primary": value.get("primary", False), "synthetic": True} for key, value in scenarios.items()]
