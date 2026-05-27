from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class RiskBase(BaseModel):
    title: str
    description: str | None = None
    scope: str | None = None


class RiskCreate(RiskBase):
    pass


class RiskUpdate(RiskBase):
    title: str | None = None


class Risk(RiskBase):
    id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SolutionStepBase(BaseModel):
    order_index: int = 0
    title: str
    description: str | None = None
    input_params_template: list[dict[str, Any]] = Field(default_factory=list)
    duration_estimate_minutes: int = 60
    data_to_collect: list[dict[str, Any]] = Field(default_factory=list)
    completion_criteria: str | None = None
    equipment_needed: list[dict[str, Any]] = Field(default_factory=list)


class SolutionStepCreate(SolutionStepBase):
    pass


class SolutionStepUpdate(BaseModel):
    order_index: int | None = None
    title: str | None = None
    description: str | None = None
    input_params_template: list[dict[str, Any]] | None = None
    duration_estimate_minutes: int | None = None
    data_to_collect: list[dict[str, Any]] | None = None
    completion_criteria: str | None = None
    equipment_needed: list[dict[str, Any]] | None = None


class SolutionStep(SolutionStepBase):
    id: str
    solution_id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SolutionBase(BaseModel):
    title: str
    description: str | None = None
    test_method: str | None = None
    equipment: list[dict[str, Any]] = Field(default_factory=list)


class SolutionCreate(SolutionBase):
    pass


class SolutionUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    test_method: str | None = None
    equipment: list[dict[str, Any]] | None = None


class Solution(SolutionBase):
    id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SolutionWithDetails(Solution):
    steps: list[SolutionStep] = Field(default_factory=list)
    risks: list[Risk] = Field(default_factory=list)


class ProjectBase(BaseModel):
    name: str
    description: str | None = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class ProjectRiskBase(BaseModel):
    risk_id: str
    covered_by_previous: bool = False
    covering_solution_id: str | None = None


class ProjectRiskCreate(ProjectRiskBase):
    pass


class ProjectRiskUpdate(BaseModel):
    covered_by_previous: bool | None = None
    covering_solution_id: str | None = None


class ProjectRisk(ProjectRiskBase):
    id: str
    project_id: str

    model_config = {"from_attributes": True}


class ProjectRiskWithRisk(ProjectRisk):
    risk: Risk


class Project(BaseModel):
    id: str
    name: str
    description: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectWithDetails(Project):
    risks: list[ProjectRiskWithRisk] = Field(default_factory=list)
    solutions: list[Solution] = Field(default_factory=list)
    coverage_rate: float = 0.0


class PlanGroupBase(BaseModel):
    title: str
    parent_group_id: str | None = None
    order_index: int = 0


class PlanGroupCreate(PlanGroupBase):
    pass


class PlanGroupUpdate(BaseModel):
    title: str | None = None
    parent_group_id: str | None = None
    order_index: int | None = None


class PlanGroup(PlanGroupBase):
    id: str
    project_id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PlanGroupWithChildren(PlanGroup):
    children: list["PlanGroupWithChildren"] = Field(default_factory=list)
    steps: list["PlanStep"] = Field(default_factory=list)


class PlanStepBase(BaseModel):
    group_id: str | None = None
    order_index: int = 0
    title: str
    description: str | None = None
    input_params: list[dict[str, Any]] = Field(default_factory=list)
    duration_estimate_minutes: int = 60
    data_to_collect: list[dict[str, Any]] = Field(default_factory=list)
    completion_criteria: str | None = None
    required_executions: int = 1


class PlanStepCreate(PlanStepBase):
    pass


class PlanStepUpdate(BaseModel):
    group_id: str | None = None
    order_index: int | None = None
    title: str | None = None
    description: str | None = None
    input_params: list[dict[str, Any]] | None = None
    duration_estimate_minutes: int | None = None
    data_to_collect: list[dict[str, Any]] | None = None
    completion_criteria: str | None = None
    required_executions: int | None = None


class PlanStep(PlanStepBase):
    id: str
    project_id: str
    solution_id: str | None = None
    solution_step_id: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PlanTree(BaseModel):
    groups: list[PlanGroupWithChildren] = Field(default_factory=list)
    ungrouped_steps: list[PlanStep] = Field(default_factory=list)


class ReorderRequest(BaseModel):
    items: list[dict[str, Any]]


class LinkRiskRequest(BaseModel):
    risk_id: str


class ExecutionBase(BaseModel):
    plan_step_id: str | None = None
    type: str = "planned"
    execution_number: int = 1


class ExecutionCreate(ExecutionBase):
    pass


class ExecutionComplete(BaseModel):
    completion_check: str | None = None
    notes: str | None = None


class ExecutionUpdate(BaseModel):
    status: str | None = None
    completion_check: str | None = None
    notes: str | None = None
    input_params: list[dict[str, Any]] | None = None


class IncidentCreate(BaseModel):
    plan_step_id: str | None = None
    notes: str | None = None


class IncidentResolve(BaseModel):
    reason: str
    category: str | None = None
    notes: str | None = None


class AdhocCreate(BaseModel):
    title: str
    description: str | None = None
    notes: str | None = None


class StepExecution(BaseModel):
    id: str
    project_id: str
    plan_step_id: str | None = None
    parent_execution_id: str | None = None
    type: str
    execution_number: int
    status: str
    started_at: datetime
    completed_at: datetime | None = None
    input_params: list[dict[str, Any]] | None = None
    completion_check: str | None = None
    notes: str | None = None
    incident_reason: str | None = None
    incident_category: str | None = None
    created_at: datetime
    updated_at: datetime
    step_title: str | None = None

    model_config = {"from_attributes": True}


class ExecutionStats(BaseModel):
    total_duration_minutes: float = 0.0
    step_breakdown: list[dict[str, Any]] = Field(default_factory=list)


class SyncPayload(BaseModel):
    risks: list[dict[str, Any]] = Field(default_factory=list)
    solutions: list[dict[str, Any]] = Field(default_factory=list)
    solution_steps: list[dict[str, Any]] = Field(default_factory=list)
    solution_risks: list[dict[str, Any]] = Field(default_factory=list)
    projects: list[dict[str, Any]] = Field(default_factory=list)
    project_risks: list[dict[str, Any]] = Field(default_factory=list)
    project_solutions: list[dict[str, Any]] = Field(default_factory=list)
    plan_groups: list[dict[str, Any]] = Field(default_factory=list)
    plan_steps: list[dict[str, Any]] = Field(default_factory=list)
    step_executions: list[dict[str, Any]] = Field(default_factory=list)
