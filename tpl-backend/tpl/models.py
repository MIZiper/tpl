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
# ---------------------------------------------------------------------------
class PlanFieldDef(BaseModel):
    id: str
    name: str
    data_type: str
    unit: str | None = None
    meta: dict[str, Any] | None = None
    derived: bool = False


class PlanDefinitions(BaseModel):
    input_conditions: list[PlanFieldDef] = Field(default_factory=list)
    collection_items: list[PlanFieldDef] = Field(default_factory=list)
    completion_criteria: list[PlanFieldDef] = Field(default_factory=list)
    custom: list[PlanFieldDef] = Field(default_factory=list)


class FieldBinding(BaseModel):
    definition_id: str
    value: Any | None = None
    dynamic_type: str | None = None
    dynamic_params: dict[str, Any] | None = None


class PlanNode(BaseModel):
    id: str
    type: str
    title: str
    children: list["PlanNode"] = Field(default_factory=list)
    description: str | None = None
    duration_minutes: int = 60
    changeover_minutes: int = 0
    input_conditions: list[FieldBinding] = Field(default_factory=list)
    collection_items: list[FieldBinding] = Field(default_factory=list)
    completion_criteria: list[FieldBinding] = Field(default_factory=list)
    system_config: dict[str, Any] | None = None
    required_executions: int = 1
    step_template_id: str | None = None
    solution_step_id: str | None = None


class PlanTemplate(BaseModel):
    id: str
    name: str
    step: PlanNode


class TransformParamDef(BaseModel):
    key: str
    label: str
    type: str
    default: Any | None = None
    options: list[str] | None = None
    required: bool = False


class TransformMethodDef(BaseModel):
    id: str
    name: str
    description: str | None = None
    category: str | None = None
    params_schema: list[TransformParamDef] = Field(default_factory=list)


class TransformDef(BaseModel):
    id: str
    name: str
    method_id: str
    source_definition_ids: list[str] = Field(default_factory=list)
    derived_definition_id: str
    derived_name: str = ""
    derived_unit: str | None = None
    params: dict[str, Any] = Field(default_factory=dict)


class DynamicTypeDef(BaseModel):
    id: str
    name: str
    description: str | None = None
    params_schema: list[TransformParamDef] = Field(default_factory=list)


class StructParamDef(BaseModel):
    key: str
    label: str
    type: str
    default: Any | None = None
    options: list[str] | None = None
    required: bool = False


class StructTypeDef(BaseModel):
    id: str
    name: str
    description: str | None = None
    category: str | None = None
    params_schema: list[StructParamDef] = Field(default_factory=list)


class PlanDocument(BaseModel):
    version: int = 1
    definitions: PlanDefinitions = Field(default_factory=PlanDefinitions)
    root: list[PlanNode] = Field(default_factory=list)
    templates: list[PlanTemplate] = Field(default_factory=list)
    transforms: list[TransformDef] = Field(default_factory=list)
    dynamic_types: list[DynamicTypeDef] = Field(default_factory=list)
    transform_methods: list[TransformMethodDef] = Field(default_factory=list)
    struct_types: list[StructTypeDef] = Field(default_factory=list)


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
