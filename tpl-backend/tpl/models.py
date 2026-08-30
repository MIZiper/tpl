from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Document entity (lightweight project for the document app)
# ---------------------------------------------------------------------------
class DocumentBase(BaseModel):
    name: str
    description: str | None = None


class DocumentCreate(DocumentBase):
    pass


class DocumentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class Document(DocumentBase):
    id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Plan Document model
#
# The plan document is fully generic: behavior lives in frontend code classes
# (field types, value types, struct types, transforms); the JSONB stores only
# instance data referencing those classes by id. The backend is pass-through.
# ---------------------------------------------------------------------------
class PlanDocument(BaseModel):
    version: int = 1
    definitions: dict[str, Any] = Field(
        default_factory=lambda: {
            "input_conditions": [],
            "collection_items": [],
            "completion_criteria": [],
            "custom": [],
        }
    )
    root: list[Any] = Field(default_factory=list)
    templates: list[Any] = Field(default_factory=list)
    transforms: list[Any] = Field(default_factory=list)


class PlanDocumentUpdate(BaseModel):
    document: PlanDocument


# ---------------------------------------------------------------------------
# Execution Document model
# ---------------------------------------------------------------------------
class ExecutionReading(BaseModel):
    definition_id: str
    definition_name: str = ""
    value: Any | None = None


class ExecutionResult(BaseModel):
    definition_id: str
    definition_name: str = ""
    result: str | None = None
    notes: str | None = None


class ExecutionCriteriaResult(BaseModel):
    definition_id: str
    definition_name: str = ""
    passed: bool | None = None
    notes: str | None = None


class ExecutionRun(BaseModel):
    id: str
    status: str = "pending"
    started_at: str | None = None
    completed_at: str | None = None
    input_readings: list[ExecutionReading] = Field(default_factory=list)
    collection_results: list[ExecutionResult] = Field(default_factory=list)
    criteria_results: list[ExecutionCriteriaResult] = Field(default_factory=list)
    notes: str | None = None


class ExecutionEntry(BaseModel):
    id: str
    plan_step_id: str | None = None
    step_title: str = ""
    type: str = "planned"
    required_executions: int = 1
    executions: list[ExecutionRun] = Field(default_factory=list)
    selected_bindings: dict[str, list[str] | dict[str, Any]] | None = None


class ExecutionDoc(BaseModel):
    version: int = 1
    status: str = "idle"
    entries: list[ExecutionEntry] = Field(default_factory=list)
    pause_history: list[dict[str, Any]] = Field(default_factory=list)


class ExecutionDocUpdate(BaseModel):
    document: ExecutionDoc
