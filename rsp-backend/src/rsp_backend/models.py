from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Risks
# ---------------------------------------------------------------------------
class RiskCategoryBase(BaseModel):
    name: str
    description: str | None = None


class RiskCategoryCreate(RiskCategoryBase):
    pass


class RiskCategory(RiskCategoryBase):
    id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RiskBase(BaseModel):
    category_id: str | None = None
    code: str | None = None
    title: str
    description: str | None = None
    scope: str | None = None
    default_severity: int | None = None
    default_occurrence: int | None = None
    default_detection: int | None = None


class RiskCreate(RiskBase):
    pass


class RiskUpdate(BaseModel):
    category_id: str | None = None
    code: str | None = None
    title: str | None = None
    description: str | None = None
    scope: str | None = None
    default_severity: int | None = None
    default_occurrence: int | None = None
    default_detection: int | None = None


class Risk(RiskBase):
    id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RiskCauseBase(BaseModel):
    description: str


class RiskCauseCreate(RiskCauseBase):
    pass


class RiskCause(RiskCauseBase):
    id: str
    risk_id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class RiskTagBase(BaseModel):
    name: str


class RiskTagCreate(RiskTagBase):
    pass


class RiskTag(RiskTagBase):
    id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class RiskWithDetails(Risk):
    category: RiskCategory | None = None
    causes: list[RiskCause] = Field(default_factory=list)
    tags: list[RiskTag] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Solutions
# ---------------------------------------------------------------------------
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
    code: str | None = None
    title: str
    description: str | None = None
    test_method: str | None = None
    equipment: list[dict[str, Any]] = Field(default_factory=list)
    cost_impact: str | None = None
    weight_impact: str | None = None
    complexity_level: int | None = None
    verified: bool = False


class SolutionCreate(SolutionBase):
    pass


class SolutionUpdate(BaseModel):
    code: str | None = None
    title: str | None = None
    description: str | None = None
    test_method: str | None = None
    equipment: list[dict[str, Any]] | None = None
    cost_impact: str | None = None
    weight_impact: str | None = None
    complexity_level: int | None = None
    verified: bool | None = None


class Solution(SolutionBase):
    id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SolutionWithDetails(Solution):
    steps: list[SolutionStep] = Field(default_factory=list)
    risks: list[Risk] = Field(default_factory=list)


class LinkRiskRequest(BaseModel):
    risk_id: str
    recommendation_level: int | None = None


class ReorderRequest(BaseModel):
    items: list[dict[str, Any]]


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------
class ProjectBase(BaseModel):
    code: str | None = None
    name: str
    description: str | None = None
    customer_name: str | None = None
    platform: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    project_manager: str | None = None
    status: str | None = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    description: str | None = None
    customer_name: str | None = None
    platform: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    project_manager: str | None = None
    status: str | None = None


class Project(BaseModel):
    id: str
    code: str | None = None
    name: str
    description: str | None = None
    customer_name: str | None = None
    platform: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    project_manager: str | None = None
    status: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProductModelBase(BaseModel):
    code: str | None = None
    name: str | None = None
    revision: str | None = None
    product_family: str | None = None


class ProductModelCreate(ProductModelBase):
    pass


class ProductModelUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    revision: str | None = None
    product_family: str | None = None


class ProductModel(ProductModelBase):
    id: str
    project_id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class DesignPhaseBase(BaseModel):
    name: str
    sequence_no: int | None = None


class DesignPhaseCreate(DesignPhaseBase):
    pass


class DesignPhase(DesignPhaseBase):
    id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ProjectRiskBase(BaseModel):
    risk_id: str
    model_id: str | None = None
    phase_id: str | None = None
    discovery_date: date | None = None
    status: str | None = None
    owner_name: str | None = None
    severity: int | None = None
    occurrence: int | None = None
    detection: int | None = None
    description: str | None = None
    covered_by_previous: bool = False
    covering_solution_id: str | None = None


class ProjectRiskCreate(ProjectRiskBase):
    pass


class ProjectRiskUpdate(BaseModel):
    model_id: str | None = None
    phase_id: str | None = None
    discovery_date: date | None = None
    status: str | None = None
    owner_name: str | None = None
    severity: int | None = None
    occurrence: int | None = None
    detection: int | None = None
    description: str | None = None
    covered_by_previous: bool | None = None
    covering_solution_id: str | None = None


class ProjectRisk(ProjectRiskBase):
    id: str
    project_id: str
    rpn: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# FMEA: applied solutions / effectiveness
# ---------------------------------------------------------------------------
class AppliedSolutionBase(BaseModel):
    project_risk_id: str
    solution_id: str
    implementation_date: date | None = None
    responsible_engineer: str | None = None
    status: str | None = None


class AppliedSolutionCreate(AppliedSolutionBase):
    pass


class AppliedSolutionUpdate(BaseModel):
    implementation_date: date | None = None
    responsible_engineer: str | None = None
    status: str | None = None


class AppliedSolution(AppliedSolutionBase):
    id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EffectivenessBase(BaseModel):
    result_summary: str | None = None
    risk_reduction_percent: float | None = None
    actual_cost: float | None = None
    comments: str | None = None


class EffectivenessCreate(EffectivenessBase):
    pass


class Effectiveness(EffectivenessBase):
    id: str
    applied_id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class AppliedSolutionWithDetails(AppliedSolution):
    solution: Solution | None = None
    effectiveness: list[Effectiveness] = Field(default_factory=list)


class LessonsLearnedBase(BaseModel):
    what_happened: str | None = None
    root_cause: str | None = None
    what_worked: str | None = None
    what_failed: str | None = None
    recommendation: str | None = None


class LessonsLearnedCreate(LessonsLearnedBase):
    pass


class LessonsLearnedUpdate(BaseModel):
    what_happened: str | None = None
    root_cause: str | None = None
    what_worked: str | None = None
    what_failed: str | None = None
    recommendation: str | None = None


class LessonsLearned(LessonsLearnedBase):
    id: str
    project_risk_id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ProjectRiskWithDetails(ProjectRisk):
    risk: Risk | None = None
    model: ProductModel | None = None
    phase: DesignPhase | None = None
    covering_solution: Solution | None = None
    applied_solutions: list[AppliedSolutionWithDetails] = Field(default_factory=list)
    lessons: list[LessonsLearned] = Field(default_factory=list)


class ProjectWithDetails(Project):
    risks: list[ProjectRiskWithDetails] = Field(default_factory=list)
    solutions: list[Solution] = Field(default_factory=list)
    models: list[ProductModel] = Field(default_factory=list)
    coverage_rate: float = 0.0


class LessonsLearnedUpdate(BaseModel):
    what_happened: str | None = None
    root_cause: str | None = None
    what_worked: str | None = None
    what_failed: str | None = None
    recommendation: str | None = None


# ---------------------------------------------------------------------------
# Sync
# ---------------------------------------------------------------------------
class SyncPayload(BaseModel):
    risks: list[dict[str, Any]] = Field(default_factory=list)
    solutions: list[dict[str, Any]] = Field(default_factory=list)
    solution_steps: list[dict[str, Any]] = Field(default_factory=list)
    solution_risks: list[dict[str, Any]] = Field(default_factory=list)
    projects: list[dict[str, Any]] = Field(default_factory=list)
    project_risks: list[dict[str, Any]] = Field(default_factory=list)
    project_solutions: list[dict[str, Any]] = Field(default_factory=list)
    applied_solutions: list[dict[str, Any]] = Field(default_factory=list)
    solution_effectiveness: list[dict[str, Any]] = Field(default_factory=list)
    lessons_learned: list[dict[str, Any]] = Field(default_factory=list)
