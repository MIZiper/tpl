import json
from asyncpg import Connection

from tpl.models import (
    Project,
    ProjectCreate,
    ProjectUpdate,
    ProjectWithDetails,
    ProjectRisk,
    ProjectRiskCreate,
    ProjectRiskWithRisk,
    Solution,
    Risk,
)


async def list_projects(db: Connection) -> list[Project]:
    rows = await db.fetch("SELECT * FROM projects ORDER BY created_at DESC")
    return [Project.model_validate(dict(r)) for r in rows]


async def get_project(db: Connection, project_id: str) -> ProjectWithDetails | None:
    row = await db.fetchrow("SELECT * FROM projects WHERE id = $1", project_id)
    if row is None:
        return None

    project = Project.model_validate(dict(row))

    pr_rows = await db.fetch(
        """SELECT pr.*, r.title as risk_title, r.description as risk_description,
                  r.scope as risk_scope, r.created_at as risk_created_at, r.updated_at as risk_updated_at
           FROM project_risks pr
           JOIN risks r ON pr.risk_id = r.id
           WHERE pr.project_id = $1""",
        project_id,
    )
    risks_with_details: list[ProjectRiskWithRisk] = []
    for pr in pr_rows:
        pr_dict = dict(pr)
        risk = Risk(
            id=pr_dict["risk_id"],
            title=pr_dict["risk_title"],
            description=pr_dict.get("risk_description"),
            scope=pr_dict.get("risk_scope"),
            created_at=pr_dict["risk_created_at"],
            updated_at=pr_dict["risk_updated_at"],
        )
        pr_model = ProjectRisk(
            id=pr_dict["id"],
            project_id=pr_dict["project_id"],
            risk_id=pr_dict["risk_id"],
            covered_by_previous=pr_dict["covered_by_previous"],
            covering_solution_id=pr_dict.get("covering_solution_id"),
        )
        risks_with_details.append(ProjectRiskWithRisk(**pr_model.model_dump(), risk=risk))

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
        coverage_rate=coverage_rate,
    )


async def create_project(db: Connection, data: ProjectCreate) -> Project:
    row = await db.fetchrow(
        "INSERT INTO projects (name, description) VALUES ($1, $2) RETURNING *",
        data.name, data.description,
    )
    return Project.model_validate(dict(row))


async def update_project(db: Connection, project_id: str, data: ProjectUpdate) -> Project | None:
    existing_row = await db.fetchrow("SELECT * FROM projects WHERE id = $1", project_id)
    if existing_row is None:
        return None
    existing = Project.model_validate(dict(existing_row))

    name = data.name if data.name is not None else existing.name
    description = data.description if data.description is not None else existing.description

    row = await db.fetchrow(
        "UPDATE projects SET name=$1, description=$2, updated_at=NOW() WHERE id=$3 RETURNING *",
        name, description, project_id,
    )
    return Project.model_validate(dict(row))


async def delete_project(db: Connection, project_id: str) -> bool:
    result = await db.execute("DELETE FROM projects WHERE id = $1", project_id)
    return result != "DELETE 0"


async def list_project_risks(db: Connection, project_id: str) -> list[ProjectRisk]:
    rows = await db.fetch("SELECT * FROM project_risks WHERE project_id = $1", project_id)
    return [ProjectRisk.model_validate(dict(r)) for r in rows]


async def add_project_risk(db: Connection, project_id: str, data: ProjectRiskCreate) -> ProjectRisk:
    row = await db.fetchrow(
        """INSERT INTO project_risks (project_id, risk_id, covered_by_previous, covering_solution_id)
           VALUES ($1, $2, $3, $4) RETURNING *""",
        project_id, data.risk_id, data.covered_by_previous, data.covering_solution_id,
    )
    return ProjectRisk.model_validate(dict(row))


async def remove_project_risk(db: Connection, project_id: str, risk_id: str) -> bool:
    result = await db.execute(
        "DELETE FROM project_risks WHERE project_id = $1 AND risk_id = $2",
        project_id, risk_id,
    )
    return result != "DELETE 0"


async def list_project_solutions(db: Connection, project_id: str) -> list[Solution]:
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
