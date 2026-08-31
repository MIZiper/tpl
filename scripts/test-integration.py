"""Integration test for the TPL document app (8000) and RSP risk app (8001).

Prerequisites:
  - databases `tpl` and `rsp` exist (run ./scripts/setup-db.sh)
  - tpl-backend running on 8000:  uv run uvicorn tpl.main:app --port 8000
  - rsp-backend running on 8001:  uv run uvicorn rsp_backend.main:app --port 8001

Run:  python3 scripts/test-integration.py
"""
import json
import sys
import urllib.request
import urllib.error

TPL = "http://127.0.0.1:8000/api"
RSP = "http://127.0.0.1:8001/api"


def call(method, url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url, data=data, method=method, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req) as r:
            return (json.loads(r.read()) if r.status != 204 else None), r.status
    except urllib.error.HTTPError as e:
        return {"error": e.read().decode()[:200]}, e.code


failures = 0


def check(name, cond):
    global failures
    print(("PASS" if cond else "FAIL"), "-", name)
    if not cond:
        failures += 1


def main():
    # ---------------- TPL document app ----------------
    doc, s = call("POST", f"{TPL}/documents", {"name": "Engine Test Plan", "description": "doc"})
    check("tpl: create document", s == 201 and doc and doc["id"])
    did = doc["id"]

    plan, s = call("GET", f"{TPL}/documents/{did}/plan-document")
    check("tpl: get empty plan document", s == 200 and plan["version"] == 1 and plan["root"] == [])

    def_id = "def-input-1"
    plan["definitions"]["input_conditions"].append(
        {"id": def_id, "name": "Ambient Temp", "typeId": "number", "params": {"unit": "C"}}
    )
    plan["root"] = [{
        "id": "group-1", "type": "group", "title": "Drivetrain", "children": [{
            "id": "step-1", "type": "step", "title": "Measure torque", "children": [],
            "description": None, "duration_minutes": 30, "changeover_minutes": 5,
            "input_conditions": [{"definition_id": def_id}], "collection_items": [],
            "completion_criteria": [], "system_config": None, "required_executions": 2,
            "step_template_id": None, "solution_step_id": None,
        }], "description": None, "duration_minutes": 60, "changeover_minutes": 0,
        "input_conditions": [], "collection_items": [], "completion_criteria": [],
        "system_config": None, "required_executions": 1, "step_template_id": None,
        "solution_step_id": None,
    }]
    call("PUT", f"{TPL}/documents/{did}/plan-document", {"document": plan})
    plan2, _ = call("GET", f"{TPL}/documents/{did}/plan-document")
    check("tpl: save+get plan document", plan2["root"][0]["children"][0]["required_executions"] == 2)

    # value type + typed transform round-trip
    plan2["root"][0]["children"][0]["input_conditions"][0] = {
        "definition_id": def_id, "value": None,
        "valueTypeId": "ramp", "params": {"start_value": 0, "end_value": 100, "duration_seconds": 60},
    }
    plan2["transforms"] = [{
        "id": "tf-1", "name": "Half", "typeId": "linear",
        "inputs": [{"role": "value", "definitionId": def_id}],
        "derivedDefId": "def-derived-1", "derived": {"name": "Half", "unit": "rpm"},
        "params": {"factor": 0.5, "offset": 0},
    }]
    call("PUT", f"{TPL}/documents/{did}/plan-document", {"document": plan2})
    plan3, _ = call("GET", f"{TPL}/documents/{did}/plan-document")
    b = plan3["root"][0]["children"][0]["input_conditions"][0]
    check("tpl: value type round-trip",
          b["valueTypeId"] == "ramp" and b["params"]["end_value"] == 100)
    check("tpl: typed transform round-trip",
          plan3["transforms"][0]["inputs"][0]["definitionId"] == def_id
          and plan3["transforms"][0]["derived"]["unit"] == "rpm")

    edoc, s = call("POST", f"{TPL}/documents/{did}/execution-document/initialize")
    check("tpl: init execution doc from plan",
          s == 200 and len(edoc["entries"]) == 1 and edoc["entries"][0]["step_title"] == "Measure torque")

    edoc["entries"][0]["executions"].append({
        "id": "run-1", "status": "in_progress", "started_at": "2026-08-30T00:00:00Z",
        "completed_at": None,
        "input_readings": [{"definition_id": def_id, "definition_name": "Ambient Temp", "value": 25}],
        "collection_results": [], "criteria_results": [], "notes": None,
    })
    call("PUT", f"{TPL}/documents/{did}/execution-document", {"document": edoc})
    edoc2, _ = call("GET", f"{TPL}/documents/{did}/execution-document")
    check("tpl: save+get execution doc",
          edoc2["entries"][0]["executions"][0]["input_readings"][0]["value"] == 25)

    adoc, _ = call("POST", f"{TPL}/documents/{did}/execution-document/adhoc",
                   {"title": "Extra run", "notes": "note"})
    check("tpl: add adhoc entry", any(e["type"] == "adhoc" for e in adoc["entries"]))

    _, s = call("DELETE", f"{TPL}/documents/{did}")
    check("tpl: delete document", s == 204)

    # ---------------- RSP risk app ----------------
    cat, s = call("POST", f"{RSP}/risk-categories", {"name": "Electrical"})
    check("rsp: create risk category", s == 201)

    risk, s = call("POST", f"{RSP}/risks", {
        "title": "Battery overheat", "category_id": cat["id"], "code": "RISK-001",
        "default_severity": 8, "default_occurrence": 4, "default_detection": 6,
        "scope": "Battery pack",
    })
    check("rsp: create risk", s == 201 and risk["id"])
    rid = risk["id"]

    call("POST", f"{RSP}/risks/{rid}/causes", {"description": "High ambient temp"})
    tag, _ = call("POST", f"{RSP}/risk-tags", {"name": "thermal"})
    call("POST", f"{RSP}/risks/{rid}/tags", {"tag_id": tag["id"]})
    riskd, _ = call("GET", f"{RSP}/risks/{rid}")
    check("rsp: risk details", len(riskd["causes"]) == 1 and len(riskd["tags"]) == 1)

    sol, s = call("POST", f"{RSP}/solutions", {
        "title": "Thermal cutoff relay", "code": "SOL-001", "test_method": "Load test",
        "cost_impact": "Low", "weight_impact": "+20g", "complexity_level": 2,
    })
    check("rsp: create solution", s == 201)
    sid = sol["id"]

    call("POST", f"{RSP}/solutions/{sid}/steps", {
        "title": "Run 30min load", "order_index": 0,
        "duration_estimate_minutes": 30, "completion_criteria": "Temp < 60C",
    })
    call("POST", f"{RSP}/solutions/{sid}/risks", {"risk_id": rid, "recommendation_level": 5})

    proj, s = call("POST", f"{RSP}/projects", {
        "name": "EV-2026", "code": "PRJ-001", "customer_name": "ACME",
        "platform": "Model X", "project_manager": "Alice", "status": "active",
    })
    check("rsp: create project", s == 201)
    pid = proj["id"]

    pr, s = call("POST", f"{RSP}/projects/{pid}/risks", {
        "risk_id": rid, "severity": 8, "occurrence": 4, "detection": 6,
        "status": "open", "owner_name": "Bob",
    })
    check("rsp: add project risk with computed RPN", s == 201 and pr["rpn"] == 192)
    prid = pr["id"]

    recs, _ = call("GET", f"{RSP}/recommendations?risk_ids={rid}")
    check("rsp: recommendations", any(x["id"] == sid for x in recs))

    call("POST", f"{RSP}/projects/{pid}/solutions", {"solution_id": sid})
    applied, _ = call("POST", f"{RSP}/projects/{pid}/risks/{prid}/applied-solutions",
                      {"project_risk_id": prid, "solution_id": sid,
                       "responsible_engineer": "Bob", "status": "implemented"})
    eff, _ = call("POST", f"{RSP}/applied-solutions/{applied['id']}/effectiveness",
                  {"result_summary": "Temp reduced", "risk_reduction_percent": 60.0,
                   "actual_cost": 120.50})
    check("rsp: add effectiveness", eff["risk_reduction_percent"] == 60.0)
    call("POST", f"{RSP}/projects/{pid}/risks/{prid}/lessons",
         {"what_happened": "Overheat", "root_cause": "Ambient", "recommendation": "Add relay"})

    pdetail, _ = call("GET", f"{RSP}/projects/{pid}")
    check("rsp: project detail includes applied+lesson",
          len(pdetail["risks"][0]["applied_solutions"]) == 1 and len(pdetail["risks"][0]["lessons"]) == 1)
    check("rsp: coverage 0 before covering", pdetail["coverage_rate"] == 0.0)

    call("PUT", f"{RSP}/projects/{pid}/risks/{prid}",
         {"covering_solution_id": sid, "severity": 8, "occurrence": 4, "detection": 6})
    pdetail2, _ = call("GET", f"{RSP}/projects/{pid}")
    check("rsp: coverage 1.0 after covering", pdetail2["coverage_rate"] == 1.0)

    call("POST", f"{RSP}/projects/{pid}/models", {"code": "MX-1", "name": "Model X rev1"})
    call("POST", f"{RSP}/design-phases", {"name": "DVT", "sequence_no": 2})

    _, s = call("DELETE", f"{RSP}/projects/{pid}")
    check("rsp: delete project (cascade)", s == 204)

    print("=" * 40)
    print("ALL PASS" if failures == 0 else f"{failures} FAILURES")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
