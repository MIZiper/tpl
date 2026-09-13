from asyncpg import Connection

from rsp_backend.models import (
    AppliedSolution,
    AppliedSolutionWithDetails,
    DesignPhase,
    DesignPhaseCreate,
    Effectiveness,
    LessonsLearned,
    ProductModel,
    ProductModelCreate,
    ProductModelUpdate,
    Project,
    ProjectCreate,
    ProjectRisk,
    ProjectRiskCreate,
    ProjectRiskUpdate,
    ProjectRiskWithDetails,
    ProjectUpdate,
    ProjectWithDetails,
    Risk,
    Solution,
)


def _risk_from_row(row, prefix: str = "risk_") -> Risk:
    return Risk(
        id=row[f"{prefix}id"],
        category_id=row[f"{prefix}category_id"],
        code=row[f"{prefix}code"],
        title=row[f"{prefix}title"],
        description=row[f"{prefix}description"],
        scope=row[f"{prefix}scope"],
        default_severity=row[f"{prefix}default_severity"],
        default_occurrence=row[f"{prefix}default_occurrence"],
        default_detection=row[f"{prefix}default_detection"],
        created_at=row[f"{prefix}created_at"],
        updated_at=row[f"{prefix}updated_at"],
    )


async def list_projects(db: Connection) -> list[Project]:
    rows = await db.fetch("SELECT * FROM projects ORDER BY created_at DESC")
    return [Project.model_validate(dict(r)) for r in rows]


async def get_project(db: Connection, project_id: str) -> ProjectWithDetails | None:
    row = await db.fetchrow("SELECT * FROM projects WHERE id = $1", project_id)
    if row is None:
        return None
    project = Project.model_validate(dict(row))

    model_rows = await db.fetch(
        "SELECT * FROM product_models WHERE project_id = $1 ORDER BY created_at",
        project_id,
    )
    models = [ProductModel.model_validate(dict(m)) for m in model_rows]

    pr_rows = await db.fetch(
        """SELECT pr.*,
                  r.id as risk_id, r.category_id as risk_category_id, r.code as risk_code,
                  r.title as risk_title, r.description as risk_description, r.scope as risk_scope,
                  r.default_severity as risk_default_severity, r.default_occurrence as risk_default_occurrence,
                  r.default_detection as risk_default_detection,
                  r.created_at as risk_created_at, r.updated_at as risk_updated_at
           FROM project_risks pr
           JOIN risks r ON pr.risk_id = r.id
           WHERE pr.project_id = $1""",
        project_id,
    )

    risks_with_details: list[ProjectRiskWithDetails] = []
    for pr in pr_rows:
        pr_dict = dict(pr)
        risk = _risk_from_row(pr, "risk_")

        model = None
        if pr["model_id"]:
            model = next((m for m in models if m.id == pr["model_id"]), None)

        phase = None
        if pr["phase_id"]:
            phase_row = await db.fetchrow(
                "SELECT * FROM design_phases WHERE id = $1", pr["phase_id"],
            )
            if phase_row:
                phase = DesignPhase.model_validate(dict(phase_row))

        covering_solution = None
        if pr["covering_solution_id"]:
            sol_row = await db.fetchrow(
                "SELECT * FROM solutions WHERE id = $1", pr["covering_solution_id"],
            )
            if sol_row:
                covering_solution = Solution.model_validate(dict(sol_row))

        pr_model = ProjectRisk(
            id=pr_dict["id"],
            project_id=pr_dict["project_id"],
            risk_id=pr_dict["risk_id"],
            model_id=pr_dict["model_id"],
            phase_id=pr_dict["phase_id"],
            discovery_date=pr_dict["discovery_date"],
            status=pr_dict["status"],
            owner_name=pr_dict["owner_name"],
            severity=pr_dict["severity"],
            occurrence=pr_dict["occurrence"],
            detection=pr_dict["detection"],
            rpn=pr_dict["rpn"],
            description=pr_dict["description"],
            covered_by_previous=pr_dict["covered_by_previous"],
            covering_solution_id=pr_dict["covering_solution_id"],
            created_at=pr_dict["created_at"],
            updated_at=pr_dict["updated_at"],
        )

        applied = await _load_applied_solutions(db, pr_dict["id"])

        lesson_rows = await db.fetch(
            "SELECT * FROM lessons_learned WHERE project_risk_id = $1 ORDER BY created_at DESC",
            pr_dict["id"],
        )
        lessons = [LessonsLearned.model_validate(dict(r)) for r in lesson_rows]

        risks_with_details.append(ProjectRiskWithDetails(
            **pr_model.model_dump(),
            risk=risk,
            model=model,
            phase=phase,
            covering_solution=covering_solution,
            applied_solutions=applied,
            lessons=lessons,
        ))

    sol_rows = await db.fetch(
        """SELECT s.* FROM solutions s
           JOIN project_solutions ps ON s.id = ps.solution_id
           WHERE ps.project_id = $1""",
        project_id,
    )
    solutions = [Solution.model_validate(dict(s)) for s in sol_rows]

    total = len(risks_with_details)
    covered = sum(
        1 for pr in risks_with_details
        if pr.covered_by_previous or pr.covering_solution_id is not None
    )
    coverage_rate = covered / total if total > 0 else 0.0

    return ProjectWithDetails(
        **project.model_dump(),
        risks=risks_with_details,
        solutions=solutions,
        models=models,
        coverage_rate=coverage_rate,
    )


async def _load_applied_solutions(
    db: Connection,
    project_risk_id: str,
) -> list[AppliedSolutionWithDetails]:
    rows = await db.fetch(
        """SELECT a.*, s.id as sol_id, s.code as sol_code, s.title as sol_title,
                  s.description as sol_description, s.test_method as sol_test_method,
                  s.equipment as sol_equipment, s.cost_impact as sol_cost_impact,
                  s.weight_impact as sol_weight_impact, s.complexity_level as sol_complexity_level,
                  s.verified as sol_verified, s.created_at as sol_created_at, s.updated_at as sol_updated_at
           FROM applied_solutions a
           LEFT JOIN solutions s ON a.solution_id = s.id
           WHERE a.project_risk_id = $1
           ORDER BY a.created_at""",
        project_risk_id,
    )
    result: list[AppliedSolutionWithDetails] = []
    for r in rows:
        rd = dict(r)
        solution = None
        if rd["sol_id"]:
            solution = Solution(
                id=rd["sol_id"], code=rd["sol_code"], title=rd["sol_title"],
                description=rd["sol_description"], test_method=rd["sol_test_method"],
                equipment=rd["sol_equipment"] or [], cost_impact=rd["sol_cost_impact"],
                weight_impact=rd["sol_weight_impact"], complexity_level=rd["sol_complexity_level"],
                verified=rd["sol_verified"], created_at=rd["sol_created_at"],
                updated_at=rd["sol_updated_at"],
            )
        applied = AppliedSolution(
            id=rd["id"], project_risk_id=rd["project_risk_id"],
            solution_id=rd["solution_id"], implementation_date=rd["implementation_date"],
            responsible_engineer=rd["responsible_engineer"], status=rd["status"],
            created_at=rd["created_at"], updated_at=rd["updated_at"],
        )
        eff_rows = await db.fetch(
            "SELECT * FROM solution_effectiveness WHERE applied_id = $1 ORDER BY created_at",
            rd["id"],
        )
        effectiveness = [Effectiveness.model_validate(dict(e)) for e in eff_rows]
        result.append(AppliedSolutionWithDetails(
            **applied.model_dump(), solution=solution, effectiveness=effectiveness,
        ))
    return result


async def create_project(db: Connection, data: ProjectCreate) -> Project:
    row = await db.fetchrow(
        """INSERT INTO projects
           (code, name, description, customer_name, platform, start_date, end_date,
            project_manager, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *""",
        data.code, data.name, data.description, data.customer_name, data.platform,
        data.start_date, data.end_date, data.project_manager, data.status,
    )
    return Project.model_validate(dict(row))


async def update_project(db: Connection, project_id: str, data: ProjectUpdate) -> Project | None:
    existing_row = await db.fetchrow("SELECT * FROM projects WHERE id = $1", project_id)
    if existing_row is None:
        return None
    existing = Project.model_validate(dict(existing_row))

    code = data.code if data.code is not None else existing.code
    name = data.name if data.name is not None else existing.name
    description = data.description if data.description is not None else existing.description
    customer_name = data.customer_name if data.customer_name is not None else existing.customer_name
    platform = data.platform if data.platform is not None else existing.platform
    start_date = data.start_date if data.start_date is not None else existing.start_date
    end_date = data.end_date if data.end_date is not None else existing.end_date
    project_manager = data.project_manager if data.project_manager is not None else existing.project_manager
    status = data.status if data.status is not None else existing.status

    row = await db.fetchrow(
        """UPDATE projects SET code=$1, name=$2, description=$3, customer_name=$4,
           platform=$5, start_date=$6, end_date=$7, project_manager=$8, status=$9,
           updated_at=NOW() WHERE id=$10 RETURNING *""",
        code, name, description, customer_name, platform, start_date, end_date,
        project_manager, status, project_id,
    )
    return Project.model_validate(dict(row))


async def delete_project(db: Connection, project_id: str) -> bool:
    result = await db.execute("DELETE FROM projects WHERE id = $1", project_id)
    return result != "DELETE 0"


# ---------------------------------------------------------------------------
# Project risks
# ---------------------------------------------------------------------------
async def add_project_risk(db: Connection, project_id: str, data: ProjectRiskCreate) -> ProjectRisk:
    row = await db.fetchrow(
        """INSERT INTO project_risks
           (project_id, risk_id, model_id, phase_id, discovery_date, status, owner_name,
            severity, occurrence, detection, description, covered_by_previous, covering_solution_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *""",
        project_id, data.risk_id, data.model_id, data.phase_id, data.discovery_date,
        data.status, data.owner_name, data.severity, data.occurrence, data.detection,
        data.description, data.covered_by_previous, data.covering_solution_id,
    )
    return ProjectRisk.model_validate(dict(row))


async def update_project_risk(
    db: Connection,
    project_risk_id: str,
    data: ProjectRiskUpdate,
) -> ProjectRisk | None:
    existing_row = await db.fetchrow("SELECT * FROM project_risks WHERE id = $1", project_risk_id)
    if existing_row is None:
        return None
    existing = ProjectRisk.model_validate(dict(existing_row))

    model_id = data.model_id if data.model_id is not None else existing.model_id
    phase_id = data.phase_id if data.phase_id is not None else existing.phase_id
    discovery_date = data.discovery_date if data.discovery_date is not None else existing.discovery_date
    status = data.status if data.status is not None else existing.status
    owner_name = data.owner_name if data.owner_name is not None else existing.owner_name
    severity = data.severity if data.severity is not None else existing.severity
    occurrence = data.occurrence if data.occurrence is not None else existing.occurrence
    detection = data.detection if data.detection is not None else existing.detection
    description = data.description if data.description is not None else existing.description
    covered_by_previous = data.covered_by_previous if data.covered_by_previous is not None else existing.covered_by_previous
    covering_solution_id = data.covering_solution_id if data.covering_solution_id is not None else existing.covering_solution_id

    row = await db.fetchrow(
        """UPDATE project_risks SET model_id=$1, phase_id=$2, discovery_date=$3, status=$4,
           owner_name=$5, severity=$6, occurrence=$7, detection=$8, description=$9,
           covered_by_previous=$10, covering_solution_id=$11, updated_at=NOW()
           WHERE id=$12 RETURNING *""",
        model_id, phase_id, discovery_date, status, owner_name, severity,
        occurrence, detection, description, covered_by_previous,
        covering_solution_id, project_risk_id,
    )
    return ProjectRisk.model_validate(dict(row))


async def remove_project_risk(db: Connection, project_id: str, risk_id: str) -> bool:
    result = await db.execute(
        "DELETE FROM project_risks WHERE project_id = $1 AND risk_id = $2",
        project_id, risk_id,
    )
    return result != "DELETE 0"


# ---------------------------------------------------------------------------
# Project <-> Solution links
# ---------------------------------------------------------------------------
async def list_solutions_for_project(db: Connection, project_id: str) -> list[Solution]:
    rows = await db.fetch(
        """SELECT s.* FROM solutions s
           JOIN project_solutions ps ON s.id = ps.solution_id
           WHERE ps.project_id = $1""",
        project_id,
    )
    return [Solution.model_validate(dict(r)) for r in rows]


async def add_project_solution(db: Connection, project_id: str, solution_id: str) -> bool:
    try:
        await db.execute(
            "INSERT INTO project_solutions (project_id, solution_id) VALUES ($1, $2)",
            project_id, solution_id,
        )
        return True
    except Exception:
        return False


async def remove_project_solution(db: Connection, project_id: str, solution_id: str) -> bool:
    result = await db.execute(
        "DELETE FROM project_solutions WHERE project_id = $1 AND solution_id = $2",
        project_id, solution_id,
    )
    return result != "DELETE 0"


async def get_recommendations(db: Connection, risk_ids: list[str]) -> list[Solution]:
    if not risk_ids:
        return []
    placeholders = ",".join(f"${i + 1}" for i in range(len(risk_ids)))
    rows = await db.fetch(
        f"""SELECT DISTINCT s.* FROM solutions s
            JOIN solution_risks sr ON s.id = sr.solution_id
            WHERE sr.risk_id IN ({placeholders})""",
        *risk_ids,
    )
    return [Solution.model_validate(dict(r)) for r in rows]


# ---------------------------------------------------------------------------
# Product models
# ---------------------------------------------------------------------------
async def list_product_models(db: Connection, project_id: str) -> list[ProductModel]:
    rows = await db.fetch(
        "SELECT * FROM product_models WHERE project_id = $1 ORDER BY created_at",
        project_id,
    )
    return [ProductModel.model_validate(dict(r)) for r in rows]


async def create_product_model(db: Connection, project_id: str, data: ProductModelCreate) -> ProductModel:
    row = await db.fetchrow(
        """INSERT INTO product_models (project_id, code, name, revision, product_family)
           VALUES ($1, $2, $3, $4, $5) RETURNING *""",
        project_id, data.code, data.name, data.revision, data.product_family,
    )
    return ProductModel.model_validate(dict(row))


async def update_product_model(db: Connection, model_id: str, data: ProductModelUpdate) -> ProductModel | None:
    existing_row = await db.fetchrow("SELECT * FROM product_models WHERE id = $1", model_id)
    if existing_row is None:
        return None
    existing = ProductModel.model_validate(dict(existing_row))

    code = data.code if data.code is not None else existing.code
    name = data.name if data.name is not None else existing.name
    revision = data.revision if data.revision is not None else existing.revision
    product_family = data.product_family if data.product_family is not None else existing.product_family

    row = await db.fetchrow(
        """UPDATE product_models SET code=$1, name=$2, revision=$3, product_family=$4
           WHERE id=$5 RETURNING *""",
        code, name, revision, product_family, model_id,
    )
    return ProductModel.model_validate(dict(row))


async def delete_product_model(db: Connection, model_id: str) -> bool:
    result = await db.execute("DELETE FROM product_models WHERE id = $1", model_id)
    return result != "DELETE 0"


# ---------------------------------------------------------------------------
# Design phases
# ---------------------------------------------------------------------------
async def list_design_phases(db: Connection) -> list[DesignPhase]:
    rows = await db.fetch("SELECT * FROM design_phases ORDER BY sequence_no NULLS LAST, name")
    return [DesignPhase.model_validate(dict(r)) for r in rows]


async def create_design_phase(db: Connection, data: DesignPhaseCreate) -> DesignPhase:
    row = await db.fetchrow(
        "INSERT INTO design_phases (name, sequence_no) VALUES ($1, $2) RETURNING *",
        data.name, data.sequence_no,
    )
    return DesignPhase.model_validate(dict(row))
