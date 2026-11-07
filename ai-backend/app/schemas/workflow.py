from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class DocumentType(StrEnum):
    CONTRACT = "contract"
    INVOICE = "invoice"
    OTHER = "other"


class ExtractedField(BaseModel):
    value: Any = None
    source_document: str | None = None
    source_section: str | None = None
    source_excerpt: str | None = None
    confidence: Literal["high", "medium", "low", "unknown"] = "unknown"
    status: Literal["extracted", "suggested", "missing", "user_required", "needs_verification", "confirmed", "not_applicable"] = "missing"
    confirmed_by_user: bool = False


class DocumentRecord(BaseModel):
    document_id: str | None = None
    document_type: DocumentType
    filename: str | None = None
    fields: dict[str, ExtractedField] = Field(default_factory=dict)


class ApplicationRecord(DocumentRecord):
    document_type: DocumentType = DocumentType.OTHER
    linked_to_contract: bool = True
    registration_review_required: bool = False
    registration_review_reason: str | None = None


class PaymentRecord(BaseModel):
    fields: dict[str, Any] = Field(default_factory=dict)
    underlying: dict[str, Any] = Field(default_factory=dict)
    confirmed_fields: list[str] = Field(default_factory=list)


class Issue(BaseModel):
    id: str
    code: str
    severity: Literal["blocking", "warning", "info"]
    title: str
    message: str
    field_ids: list[str] = Field(default_factory=list)
    recommended_action: str
    blocking_step: Literal["contract", "application", "payment", "status"]


class WorkflowStep(BaseModel):
    id: Literal["contract", "application", "payment", "status"]
    label: str
    status: Literal["not_started", "in_progress", "needs_attention", "completed"]


class WorkflowState(BaseModel):
    current_step: Literal["contract", "application", "payment", "status"]
    steps: list[WorkflowStep]
    completed_steps: list[str]
    blocking_issues: list[str]
    next_action: str


class WorkflowResponse(BaseModel):
    analysis_id: str
    mode: Literal["deterministic", "openai", "demo"]
    workflow: WorkflowState
    contract: DocumentRecord
    application: ApplicationRecord
    invoice: DocumentRecord
    payment: PaymentRecord
    issues: list[Issue]
    missing_fields: list[str]
    next_actions: list[str]
    ready_for_review: bool


class FieldDefinition(BaseModel):
    id: str
    label: str
    type: Literal["text", "decimal", "date", "boolean", "select", "account"]
    required: bool
    source: Literal["user", "contract", "invoice", "system"]
    editable: bool
    visible: bool
    dependencies: list[str]
    help_text: str


class CreateWorkflowRequest(BaseModel):
    mode: Literal["deterministic", "openai", "demo"] = "deterministic"
    contract: dict[str, Any] = Field(default_factory=dict)
    application: dict[str, Any] = Field(default_factory=dict)
    invoice: dict[str, Any] = Field(default_factory=dict)
    payment: dict[str, Any] = Field(default_factory=dict)


class WorkflowPatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    step: Literal["contract", "application", "invoice", "payment"] = "payment"
    fields: dict[str, Any] = Field(default_factory=dict)
    confirm_fields: list[str] = Field(default_factory=list)
    actor: Literal["user"] = "user"


class AuditEvent(BaseModel):
    event_id: str
    analysis_id: str
    timestamp: datetime
    actor: Literal["ai", "user", "system"]
    action: str
    step: str
    field_id: str | None = None
    previous_value: Any = None
    new_value: Any = None
    description: str


class AuditResponse(BaseModel):
    analysis_id: str
    events: list[AuditEvent]


class SessionResponse(BaseModel):
    session_token: str
    expires_at: datetime


class ApiError(BaseModel):
    code: str
    message: str
    field: str | None = None


class ErrorResponse(BaseModel):
    request_id: str
    errors: list[ApiError]


class StatusResponse(BaseModel):
    analysis_id: str
    status: Literal["draft_prepared", "waiting_for_user_confirmation", "simulated_bank_review", "requires_correction"]
    message: str
    current_step: str
    ready_for_review: bool
    blocking_issues: list[str]
    prepared_summary: list[str]
    requires_review: list[str]
    ai_suggestions: list[str]
    user_confirmations: list[str]
    next_action: str
    audit: list[AuditEvent]
    updated_at: datetime
