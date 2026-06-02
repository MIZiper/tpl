<script lang="ts">
  import { onMount } from "svelte";
  import { p, route } from "../../router";
  import {
    planState,
    selectedNode,
    loadDoc,
    saveDoc,
    initDoc,
    selectNode,
    addStep,
    addGroup,
    dupNode,
    delNode,
    updateSelected,
    moveUp,
    moveDown,
    addDef,
    removeDef,
    addTemplate,
    applyTemplate,
    delTemplate,
    exportJSON,
    importJSON,
  } from "../../stores/plan";
  import { planApi } from "../../lib/api";
  import { getTransformMethods } from "../../lib/transform-registry";
  import { getDynamicTypes } from "../../lib/dynamic-registry";
  import { generateId } from "../../lib/plan-utils";
  import type { PlanNode, PlanFieldDef, PlanDefinitions, PlanFieldDefMeta, TransformDef } from "../../types/plan";
  import PlanCanvas from "./PlanCanvas.svelte";
  import PlanStepEditor from "./PlanStepEditor.svelte";

  let id: string = $derived(route.params.id ?? "");

  let leftTab = $state<"tree" | "definitions" | "templates" | "transforms">("tree");
  let contextMenu = $state<{ x: number; y: number; nodeId: string | null; parentId: string | null; index: number } | null>(null);
  let showInitModal = $state(false);
  let showDefForm = $state(false);
  let defCategory: keyof PlanDefinitions = $state<keyof PlanDefinitions>("input_conditions");
  let newDef = $state({ name: "", field_type: "text", unit: null as string | null, default_value: null as any, optionsText: "" });
  let newDefMeta = $state<PlanFieldDefMeta>({});
  let defTabExpanded: Record<string, boolean> = $state({});
  let newTemplateName = $state("");

  let showTransformForm = $state(false);
  let newTransform = $state({
    name: "",
    method_id: "formula",
    source_definition_ids: [] as string[],
    derived_definition_id: "",
    params: {} as Record<string, unknown>,
  });
  let newTargetMode = $state<"new" | "existing">("new");
  let newTargetName = $state("");
  let newTargetUnit = $state("");

  onMount(() => { loadDoc(id, planApi.getDocument); });

  function ctxMenu(e: MouseEvent, nodeId: string | null, parentId: string | null, index: number) { e.preventDefault(); contextMenu = { x: e.clientX, y: e.clientY, nodeId, parentId, index }; }
  function closeCtx() { contextMenu = null; }

  function handleCanvasAction(action: string, payload: { nodeId: string }) {
    switch (action) {
      case "add-step": addStep(payload.nodeId || null); break;
      case "add-group": addGroup(payload.nodeId || null); break;
      case "delete": delNode(payload.nodeId); break;
      case "duplicate": dupNode(payload.nodeId); break;
      case "move-up": moveUp(payload.nodeId); break;
      case "move-down": moveDown(payload.nodeId); break;
      case "save-as-template": {
        const doc = $planState.document; if (doc) { const n = find(doc.root, payload.nodeId); addTemplate(n?.title || "Template", payload.nodeId); }
      } break;
    }
    if ($planState.dirty) saveDoc(id, planApi.saveDocument);
  }

  function find(root: PlanNode[], nodeId: string): PlanNode | null {
    for (const n of root) { if (n.id === nodeId) return n; if (n.type === "group") { const f = find(n.children, nodeId); if (f) return f; } }
    return null;
  }

  async function handleImport(e: Event) {
    const input = e.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { if (importJSON(reader.result as string)) saveDoc(id, planApi.saveDocument); };
    reader.readAsText(file); input.value = "";
  }

  function addNewDef() {
    if (!newDef.name) return;
    const isSelect = newDef.field_type === "select";
    const options = isSelect && newDef.optionsText.trim()
      ? newDef.optionsText.split(/[\n,]/).map(s => s.trim()).filter(Boolean)
      : null;
    const meta = buildMeta();
    addDef(defCategory, { name: newDef.name, field_type: newDef.field_type, unit: newDef.unit, default_value: newDef.default_value, options, meta });
    newDef = { name: "", field_type: "text", unit: null, default_value: null, optionsText: "" };
    newDefMeta = {};
    showDefForm = false;
  }

  function addTransform() {
    if (!newTransform.name) return;
    const doc = $planState.document;
    if (!doc) return;

    let targetDefId = newTransform.derived_definition_id;
    let targetDefName = "";

    if (newTargetMode === "new" && newTargetName) {
      targetDefId = generateId();
      targetDefName = newTargetName;
      const derivedDef: PlanFieldDef = {
        id: targetDefId,
        name: newTargetName,
        field_type: "derived",
        unit: newTargetUnit || null,
        default_value: null,
        options: null,
        meta: { derived: true, source_definition_ids: [...newTransform.source_definition_ids] },
      };
      doc.definitions.input_conditions.push(derivedDef);
    } else if (newTargetMode === "existing" && targetDefId) {
      const d = [...doc.definitions.input_conditions, ...doc.definitions.custom].find(f => f.id === targetDefId);
      if (d) targetDefName = d.name;
    }

    if (!targetDefId) return;

    const t: TransformDef = {
      id: generateId(),
      name: newTransform.name,
      method_id: newTransform.method_id,
      source_definition_ids: newTransform.source_definition_ids,
      derived_definition_id: targetDefId,
      params: newTransform.params,
    };
    planState.update((s) => {
      if (!s.document) return s;
      return { ...s, document: { ...s.document, transforms: [...s.document.transforms, t] }, dirty: true };
    });
    newTransform = { name: "", method_id: "formula", source_definition_ids: [], derived_definition_id: "", params: {} };
    newTargetMode = "new";
    newTargetName = "";
    newTargetUnit = "";
    showTransformForm = false;
  }

  function removeTransform(tId: string) {
    planState.update((s) => {
      if (!s.document) return s;
      return { ...s, document: { ...s.document, transforms: s.document.transforms.filter(t => t.id !== tId) }, dirty: true };
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== "Delete" || !$planState.selectedNodeId) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    delNode($planState.selectedNodeId); saveDoc(id, planApi.saveDocument);
  }

  function catLab(c: keyof PlanDefinitions) { return { input_conditions: "Input Conditions", collection_items: "Measurement Items", completion_criteria: "Completion Criteria", custom: "Custom" }[c]; }
  function tLab(t: string) { return { text: "Text", number: "Number", numeric_tolerance: "Numeric ±Tol", percentage: "Percentage", range: "Range", boolean: "Boolean", pass_fail: "Pass/Fail", threshold: "Threshold", measurement: "Measurement", reference_compare: "Ref. Compare", select: "Select", dynamic: "Dynamic", derived: "Derived" }[t] || t; }
  function hasC(d: PlanDocument | null) { return !!(d && (d.root.length > 0 || d.definitions.input_conditions.length > 0 || d.templates.length > 0 || d.transforms.length > 0)); }
  function metaHas(m: PlanFieldDefMeta | null | undefined): boolean { return !!(m && Object.keys(m).length > 0); }

  function buildMeta(): PlanFieldDefMeta | null {
    const m: PlanFieldDefMeta = {};
    if (newDef.field_type === "derived") m.derived = true;
    if (newDef.field_type === "dynamic") m.dynamic = true;
    if (newDefMeta.tolerance_plus != null) m.tolerance_plus = newDefMeta.tolerance_plus;
    if (newDefMeta.tolerance_minus != null) m.tolerance_minus = newDefMeta.tolerance_minus;
    if (newDefMeta.reference_value != null) m.reference_value = newDefMeta.reference_value;
    if (newDefMeta.range_min != null) m.range_min = newDefMeta.range_min;
    if (newDefMeta.range_max != null) m.range_max = newDefMeta.range_max;
    if (newDefMeta.range_step != null) m.range_step = newDefMeta.range_step;
    if (newDefMeta.dynamic_type) { m.dynamic_type = newDefMeta.dynamic_type; m.dynamic = true; }
    if (newDefMeta.dynamic_params && Object.keys(newDefMeta.dynamic_params).length > 0) m.dynamic_params = newDefMeta.dynamic_params;
    if (newDefMeta.source_definition_ids?.length) m.source_definition_ids = newDefMeta.source_definition_ids;
    if (newDefMeta.derived) m.derived = true;
    return Object.keys(m).length > 0 ? m : null;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="plan-editor">
  <div class="plan-toolbar">
    <a href={p("/projects/:id", { params: { id } })} class="btn btn-sm btn-outline-secondary">Back</a>
    <span class="flex-grow-1"></span>
    {#if $planState.dirty}
      <button class="btn btn-sm btn-success" onclick={() => saveDoc(id, planApi.saveDocument)}>Save *</button>
    {/if}
    {#if $planState.document}
      <button class="btn btn-sm btn-outline-success ms-1" onclick={exportJSON}>Export</button>
    {/if}
    <label class="btn btn-sm btn-outline-info ms-1">Import<input type="file" accept=".json" class="d-none" onchange={handleImport} /></label>
    {#if !hasC($planState.document)}
      <button class="btn btn-sm btn-primary ms-1" onclick={() => (showInitModal = true)}>Init</button>
    {/if}
  </div>

  {#if $planState.loading}
    <div class="p-3">Loading...</div>
  {:else if $planState.error}
    <div class="alert alert-danger m-2">{$planState.error}</div>
  {:else if $planState.document}
    {@const doc = $planState.document}
    {@const selId = $planState.selectedNodeId}
    {@const selNode = $selectedNode}

    <div class="plan-body">
      <!-- Left -->
      <div class="plan-left">
        <ul class="nav nav-tabs nav-sm">
          <li class="nav-item"><button class="nav-link" class:active={leftTab === "tree"} onclick={() => (leftTab = "tree")}>Tree</button></li>
          <li class="nav-item"><button class="nav-link" class:active={leftTab === "definitions"} onclick={() => (leftTab = "definitions")}>Defs</button></li>
          <li class="nav-item"><button class="nav-link" class:active={leftTab === "templates"} onclick={() => (leftTab = "templates")}>Templates</button></li>
          <li class="nav-item"><button class="nav-link" class:active={leftTab === "transforms"} onclick={() => (leftTab = "transforms")}>XForms</button></li>
        </ul>
        <div class="plan-left-content">
          {#if leftTab === "tree"}
            <div class="d-flex justify-content-between align-items-center p-2 border-bottom">
              <small class="fw-bold text-muted">TREE</small>
              <div>
                <button class="btn btn-sm btn-outline-primary" onclick={() => addStep(null, doc.root.length)}>+S</button>
                <button class="btn btn-sm btn-outline-secondary ms-1" onclick={() => addGroup(null, doc.root.length)}>+G</button>
              </div>
            </div>
            {#each doc.root as node}
              <div class="plan-tree-item" class:selected={selId === node.id} class:is-group={node.type === "group"} onclick={() => selectNode(node.id)}>
                <span class="plan-tree-icon">{node.type === "group" ? "\u25A0" : "\u25CF"}</span>
                <span class="plan-tree-title">{node.title}</span>
                {#if node.type === "step" && node.required_executions > 1}<span class="badge bg-info ms-1">x{node.required_executions}</span>{/if}
              </div>
              {#if node.type === "group"}
                {#each node.children as child}
                  <div class="plan-tree-item child" class:selected={selId === child.id} class:is-group={child.type === "group"} onclick={() => selectNode(child.id)}>
                    <span class="plan-tree-icon">{child.type === "group" ? "■" : "∴"}</span>
                    <span class="plan-tree-title">{child.title}</span>
                  </div>
                {/each}
              {/if}
            {/each}
          {:else if leftTab === "definitions"}
            <div class="p-2">
              {#each (["input_conditions", "collection_items", "completion_criteria", "custom"] as const) as cat}
                <div class="mb-2">
                  <div class="d-flex justify-content-between align-items-center mb-1"><small class="fw-bold text-muted">{catLab(cat)}</small><button class="btn btn-sm btn-link" onclick={() => { defCategory = cat; showDefForm = true; defTabExpanded[cat] = true; }}>+</button></div>
                  {#each doc.definitions[cat] as f (f.id)}
                    <div class="def-item"><div class="flex-grow-1"><span class="me-1">{f.name}</span><small class="text-muted">({tLab(f.field_type)}{f.unit ? `, ${f.unit}` : ""}{f.options?.length ? `, ${f.options.length}opts` : ""})</small>{#if f.meta?.tolerance_plus != null}<br /><small class="text-muted">±{f.meta.tolerance_plus}{f.meta.tolerance_minus != null ? `/+${f.meta.tolerance_minus}` : ""}</small>{/if}{#if f.meta?.reference_value != null}<br /><small class="text-muted">ref: {f.meta.reference_value}</small>{/if}{#if f.meta?.range_min != null}<br /><small class="text-muted">{f.meta.range_min}→{f.meta.range_max} step {f.meta.range_step}</small>{/if}{#if f.meta?.dynamic}<br /><span class="badge bg-info">Dynamic</span>{/if}{#if f.meta?.derived}<br /><span class="badge bg-secondary">Computed</span>{/if}</div><button class="btn btn-sm btn-close-sm" onclick={() => removeDef(cat, f.id)}>&times;</button></div>
                  {/each}
                  {#if doc.definitions[cat].length === 0}<div class="text-muted" style="font-size:0.8rem">None</div>{/if}

                  {#if showDefForm && defCategory === cat}
                    <div class="card card-body mb-2 bg-light">
                      <div class="mb-2"><input class="form-control form-control-sm" placeholder="Name" bind:value={newDef.name} /></div>
                      <div class="mb-2">
                        <select class="form-select form-select-sm" bind:value={newDef.field_type}>
                          {#if cat === "input_conditions"}
                            <option value="text">Text</option><option value="number">Number</option><option value="numeric_tolerance">Numeric ±Tolerance</option><option value="percentage">Percentage</option><option value="range">Range</option><option value="select">Select</option><option value="boolean">Boolean</option><option value="dynamic">Dynamic</option><option value="derived">Derived</option>
                           {:else if cat === "collection_items"}
                             <option value="text">Text</option><option value="number">Number</option><option value="pass_fail">Pass/Fail</option>
                          {:else if cat === "completion_criteria"}
                            <option value="pass_fail">Pass/Fail</option><option value="threshold">Threshold</option><option value="reference_compare">Reference Compare</option>
                          {:else if cat === "custom"}
                            <option value="text">Text</option><option value="number">Number</option><option value="boolean">Boolean</option><option value="pass_fail">Pass/Fail</option>
                          {/if}
                        </select>
                      </div>

                      {#if ["number", "numeric_tolerance", "percentage", "range"].includes(newDef.field_type)}
                        <div class="mb-2"><input class="form-control form-control-sm" placeholder="Unit" bind:value={newDef.unit} /></div>
                      {/if}

                      {#if newDef.field_type === "numeric_tolerance"}
                        <div class="row mb-2">
                          <div class="col-6"><input type="number" class="form-control form-control-sm" placeholder="Tolerance +" value={newDefMeta.tolerance_plus ?? ""} oninput={(e) => newDefMeta = { ...newDefMeta, tolerance_plus: parseFloat((e.target as HTMLInputElement).value) || undefined }} /></div>
                          <div class="col-6"><input type="number" class="form-control form-control-sm" placeholder="Tolerance -" value={newDefMeta.tolerance_minus ?? ""} oninput={(e) => newDefMeta = { ...newDefMeta, tolerance_minus: parseFloat((e.target as HTMLInputElement).value) || undefined }} /></div>
                        </div>
                      {/if}

                      {#if newDef.field_type === "percentage"}
                        <div class="mb-2"><input type="number" class="form-control form-control-sm" placeholder="Reference Value" value={newDefMeta.reference_value ?? ""} oninput={(e) => newDefMeta = { ...newDefMeta, reference_value: parseFloat((e.target as HTMLInputElement).value) || undefined }} /></div>
                      {/if}

                      {#if newDef.field_type === "range"}
                        <div class="row mb-2">
                          <div class="col-4"><input type="number" class="form-control form-control-sm" placeholder="Min" value={newDefMeta.range_min ?? ""} oninput={(e) => newDefMeta = { ...newDefMeta, range_min: parseFloat((e.target as HTMLInputElement).value) || undefined }} /></div>
                          <div class="col-4"><input type="number" class="form-control form-control-sm" placeholder="Max" value={newDefMeta.range_max ?? ""} oninput={(e) => newDefMeta = { ...newDefMeta, range_max: parseFloat((e.target as HTMLInputElement).value) || undefined }} /></div>
                          <div class="col-4"><input type="number" class="form-control form-control-sm" placeholder="Step" value={newDefMeta.range_step ?? ""} oninput={(e) => newDefMeta = { ...newDefMeta, range_step: parseFloat((e.target as HTMLInputElement).value) || undefined }} /></div>
                        </div>
                      {/if}

                      {#if newDef.field_type === "dynamic"}
                        {@const dynTypes = getDynamicTypes()}
                        <div class="mb-2">
                          <select class="form-select form-select-sm" value={newDefMeta.dynamic_type ?? ""} onchange={(e) => newDefMeta = { ...newDefMeta, dynamic: true, dynamic_type: (e.target as HTMLSelectElement).value }}>
                            <option value="">Constant</option>
                            {#each dynTypes as dt}
                              <option value={dt.id}>{dt.name}</option>
                            {/each}
                          </select>
                        </div>
                      {/if}

                      {#if newDef.field_type === "derived"}
                        <div class="mb-2"><small class="text-muted">Will auto-compute from transform rules</small></div>
                      {/if}

                      {#if newDef.field_type === "reference_compare"}
                        <div class="mb-2"><input type="text" class="form-control form-control-sm" placeholder="Reference Standard Value" value={newDefMeta.reference_value ?? ""} oninput={(e) => newDefMeta = { ...newDefMeta, reference_value: (e.target as HTMLInputElement).value || undefined }} /></div>
                      {/if}

                      {#if newDef.field_type === "select"}
                        <div class="mb-2"><textarea class="form-control form-control-sm" rows="2" placeholder="Options (one per line or comma-separated)" bind:value={newDef.optionsText}></textarea></div>
                      {/if}

                      {#if defCategory === "input_conditions" || defCategory === "custom"}
                      <div class="mb-2">
                        <small class="text-muted">Default Value</small>
                        <input type={newDef.field_type === "number" || newDef.field_type === "range" || newDef.field_type === "numeric_tolerance" || newDef.field_type === "percentage" ? "number" : "text"} class="form-control form-control-sm" placeholder="Default value" value={newDef.default_value ?? ""} oninput={(e) => newDef.default_value = (e.target as HTMLInputElement).value || null} />
                      </div>
                      {/if}

                      <div><button class="btn btn-sm btn-primary me-1" onclick={addNewDef}>Add</button><button class="btn btn-sm btn-secondary" onclick={() => { showDefForm = false; newDefMeta = {}; }}>Cancel</button></div>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {:else if leftTab === "templates"}
            <div class="p-2">
              <small class="fw-bold text-muted d-block mb-2">TEMPLATES</small>
              {#if selId && selNode?.type === "step"}
                <div class="mb-2"><div class="input-group input-group-sm"><input class="form-control" placeholder="Name" bind:value={newTemplateName} /><button class="btn btn-outline-primary" onclick={() => { if (newTemplateName) { addTemplate(newTemplateName, selId); newTemplateName = ""; } }} disabled={!newTemplateName}>Save</button></div></div>
              {/if}
              {#each doc.templates as t (t.id)}
                <div class="def-item d-flex justify-content-between align-items-start"><div><span>{t.name}</span><small class="text-muted d-block">{t.step.title}</small></div><div><button class="btn btn-sm btn-link p-0" onclick={() => applyTemplate(t.id, selId)} title="Apply">{"\u21E2"}</button><button class="btn btn-sm btn-close-sm ms-1" onclick={() => delTemplate(t.id)}>&times;</button></div></div>
              {/each}
              {#if doc.templates.length === 0}
                <div class="text-muted" style="font-size:0.8rem">Select a step then save as template.</div>
              {/if}
              {#if !selId || selNode?.type === "step"}
                <div class="text-muted mt-1" style="font-size:0.75rem">Select a group to apply templates.</div>
              {/if}
            </div>
          {:else if leftTab === "transforms"}
            <div class="p-2">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <small class="fw-bold text-muted">TRANSFORMS</small>
                <button class="btn btn-sm btn-link" onclick={() => { showTransformForm = true; }}>+</button>
              </div>

              {#if showTransformForm}
                {@const allInputDefs = [...doc.definitions.input_conditions, ...doc.definitions.custom]}
                {@const allDerivedDefs = [...doc.definitions.input_conditions, ...doc.definitions.custom].filter(d => d.meta?.derived === true)}
                {@const xformMethods = getTransformMethods()}
                <div class="card card-body mb-2 bg-light">
                  <div class="mb-2"><input class="form-control form-control-sm" placeholder="Name" bind:value={newTransform.name} /></div>
                  <div class="mb-2">
                    <select class="form-select form-select-sm" bind:value={newTransform.method_id}>
                      {#each xformMethods as m}
                        <option value={m.id}>{m.name}</option>
                      {/each}
                    </select>
                  </div>
                  <div class="mb-2">
                    <small class="text-muted d-block">Sources (input definitions to read from)</small>
                    {#if allInputDefs.length > 0}
                      <select class="form-select form-select-sm" multiple size={Math.min(allInputDefs.length, 5)} value={newTransform.source_definition_ids} onchange={(e) => { const sel = (e.target as HTMLSelectElement); newTransform.source_definition_ids = Array.from(sel.selectedOptions).map(o => o.value); }}>
                        {#each allInputDefs as d (d.id)}
                          <option value={d.id}>{d.name}{d.unit ? ` (${d.unit})` : ""}{d.meta?.derived ? " [computed]" : ""}</option>
                        {/each}
                      </select>
                    {:else}
                      <small class="text-muted d-block mt-1">No input definitions available. Add some in the Defs tab first.</small>
                    {/if}
                  </div>
                  <div class="mb-2">
                    <small class="text-muted d-block mb-1">Target (Derived Output)</small>
                    <div class="form-check form-check-inline mb-1">
                      <input class="form-check-input" type="radio" name="targetMode" id="targetNew" checked={newTargetMode === "new"} onchange={() => newTargetMode = "new"} />
                      <label class="form-check-label small" for="targetNew">Create new</label>
                    </div>
                    <div class="form-check form-check-inline mb-1">
                      <input class="form-check-input" type="radio" name="targetMode" id="targetExist" checked={newTargetMode === "existing"} onchange={() => newTargetMode = "existing"} />
                      <label class="form-check-label small" for="targetExist">Use existing</label>
                    </div>
                    {#if newTargetMode === "new"}
                      <div class="d-flex gap-1 mt-1">
                        <input class="form-control form-control-sm" placeholder="Derived name" bind:value={newTargetName} />
                        <input class="form-control form-control-sm" placeholder="Unit" style="max-width:80px" bind:value={newTargetUnit} />
                      </div>
                    {:else}
                      <select class="form-select form-select-sm" bind:value={newTransform.derived_definition_id}>
                        <option value="">-- select derived def --</option>
                        {#each allDerivedDefs as d (d.id)}
                          <option value={d.id}>{d.name}{d.unit ? ` (${d.unit})` : ""}</option>
                        {/each}
                      </select>
                      {#if allDerivedDefs.length === 0}
                        <small class="text-muted">No derived definitions yet. Switch to "Create new" or add one in Defs tab.</small>
                      {/if}
                    {/if}
                  </div>

                  {#each xformMethods.filter(m => m.id === newTransform.method_id) as selMethod}
                    <div class="mb-2"><small class="fw-bold text-muted">{selMethod.name} Parameters</small></div>
                    {#each selMethod.params_schema as p (p.key)}
                      <div class="mb-2">
                        <label class="form-label small mb-0">{p.label}</label>
                        {#if p.type === "text"}
                            <textarea class="form-control form-control-sm" rows="3" style="font-family:monospace;font-size:0.75rem" value={String(newTransform.params[p.key] ?? "")} oninput={(e) => { newTransform.params = { ...newTransform.params, [p.key]: (e.target as HTMLTextAreaElement).value }; }} placeholder={'e.g. expression: V * I / 1000, variables: {V: def_id}'}></textarea>
                        {:else if p.type === "number"}
                          <input type="number" class="form-control form-control-sm" value={newTransform.params[p.key] ?? ""} oninput={(e) => { newTransform.params = { ...newTransform.params, [p.key]: (e.target as HTMLInputElement).value }; }} />
                        {:else if p.type === "select" && p.options}
                          <select class="form-select form-select-sm" value={String(newTransform.params[p.key] ?? "")} onchange={(e) => { newTransform.params = { ...newTransform.params, [p.key]: (e.target as HTMLSelectElement).value }; }}>
                            {#each p.options as opt}<option value={opt}>{opt}</option>{/each}
                          </select>
                        {:else}
                          <input type="text" class="form-control form-control-sm" value={String(newTransform.params[p.key] ?? "")} oninput={(e) => { newTransform.params = { ...newTransform.params, [p.key]: (e.target as HTMLInputElement).value }; }} />
                        {/if}
                      </div>
                    {/each}
                  {/each}

                  <div><button class="btn btn-sm btn-primary me-1" onclick={addTransform} disabled={!newTransform.name || (newTargetMode === "existing" && !newTransform.derived_definition_id) || (newTargetMode === "new" && !newTargetName)}>Add</button><button class="btn btn-sm btn-secondary" onclick={() => { showTransformForm = false; newTransform = { name: "", method_id: "formula", source_definition_ids: [], derived_definition_id: "", params: {} }; newTargetMode = "new"; newTargetName = ""; newTargetUnit = ""; }}>Cancel</button></div>
                </div>
              {/if}

              {#each doc.transforms as t (t.id)}
                {@const sourceDefs = [...doc.definitions.input_conditions, ...doc.definitions.custom].filter(d => t.source_definition_ids.includes(d.id))}
                {@const targetDef = [...doc.definitions.input_conditions, ...doc.definitions.custom].find(d => d.id === t.derived_definition_id)}
                <div class="def-item d-flex justify-content-between align-items-start">
                  <div>
                    <span>{t.name}</span>
                    <small class="text-muted d-block">{sourceDefs.map(d => d.name).join(", ") || "?"} → {targetDef?.name || t.derived_definition_id.slice(0,8)}</small>
                    <small class="text-muted">method: {t.method_id}</small>
                  </div>
                  <button class="btn btn-sm btn-close-sm" onclick={() => removeTransform(t.id)}>&times;</button>
                </div>
              {/each}
              {#if doc.transforms.length === 0 && !showTransformForm}
                <div class="text-muted" style="font-size:0.8rem">
                  <p>Transforms compute derived values from source inputs during logging.</p>
                  <ol class="small ps-3">
                    <li>Select source definitions (must exist in Input Conditions)</li>
                    <li>Choose "Create new" to auto-create a derived output, or pick an existing one</li>
                    <li>Pick a method (formula, linear, lookup) and fill its params</li>
                  </ol>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>

      <!-- Center -->
      <div class="plan-center" oncontextmenu={(e) => { e.preventDefault(); ctxMenu(e, null, null, 0); }} onclick={closeCtx} role="presentation">
        {#if !hasC(doc)}
          <div class="plan-empty"><div class="mb-3 text-muted">Plan is empty</div><button class="btn btn-outline-primary me-2" onclick={() => addStep(null, 0)}>+ Step</button><button class="btn btn-outline-secondary me-2" onclick={() => addGroup(null, 0)}>+ Group</button><br /><button class="btn btn-primary mt-2" onclick={() => (showInitModal = true)}>Initialize from Solutions</button></div>
        {:else}
          <PlanCanvas nodes={doc.root} selectedNodeId={selId} definitions={doc.definitions} onContextMenu={ctxMenu} onselect={selectNode} />
        {/if}
        {#if contextMenu}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="context-menu" style="position:fixed;left:{contextMenu.x}px;top:{contextMenu.y}px" onclick={(e) => e.stopPropagation()}>
            <button class="context-item" onclick={() => { handleCanvasAction("add-step", { nodeId: contextMenu!.nodeId ?? contextMenu!.parentId ?? "" }); closeCtx(); }}>+ Add Step</button>
            <button class="context-item" onclick={() => { handleCanvasAction("add-group", { nodeId: contextMenu!.nodeId ?? contextMenu!.parentId ?? "" }); closeCtx(); }}>+ Add Group</button>
            {#if contextMenu?.nodeId}
              <hr class="my-1" />
              <button class="context-item" onclick={() => { handleCanvasAction("duplicate", { nodeId: contextMenu!.nodeId! }); closeCtx(); }}>Duplicate</button>
              <button class="context-item" onclick={() => { handleCanvasAction("move-up", { nodeId: contextMenu!.nodeId! }); closeCtx(); }}>Move Up</button>
              <button class="context-item" onclick={() => { handleCanvasAction("move-down", { nodeId: contextMenu!.nodeId! }); closeCtx(); }}>Move Down</button>
              <button class="context-item" onclick={() => { handleCanvasAction("save-as-template", { nodeId: contextMenu!.nodeId! }); closeCtx(); }}>Save as Template</button>
              <hr class="my-1" />
              <button class="context-item text-danger" onclick={() => { handleCanvasAction("delete", { nodeId: contextMenu!.nodeId! }); closeCtx(); }}>Delete</button>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Right -->
      <div class="plan-right">
        {#if selNode}
          <PlanStepEditor node={selNode} definitions={doc.definitions} onupdate={(p) => updateSelected(p)} />
        {:else}
            <div class="p-3 text-center" style="margin-top:3rem"><div style="font-size:3rem;opacity:0.3">{"\u2699"}</div><div class="text-muted">Select a step to edit</div></div>
        {/if}
      </div>
    </div>
  {/if}

  {#if showInitModal}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-backdrop" onclick={() => (showInitModal = false)}></div>
    <div class="modal d-block" tabindex="-1"><div class="modal-dialog"><div class="modal-content">
      <div class="modal-header"><h5 class="modal-title">Initialize Plan</h5><button class="btn-close" onclick={() => (showInitModal = false)}></button></div>
      <div class="modal-body"><p>Convert all project solutions and their steps into the plan document.</p></div>
      <div class="modal-footer"><button class="btn btn-secondary" onclick={() => (showInitModal = false)}>Cancel</button><button class="btn btn-primary" onclick={() => { showInitModal = false; initDoc(id, planApi.initialize); }}>Initialize</button></div>
    </div></div></div>
  {/if}
</div>

<style>
  .plan-editor{display:flex;flex-direction:column;height:calc(100vh - 70px);overflow:hidden}
  .plan-toolbar{display:flex;align-items:center;padding:6px 12px;border-bottom:1px solid #dee2e6;background:#f8f9fa;flex-shrink:0;gap:4px}
  .plan-body{display:flex;flex:1;overflow:hidden}
  .plan-left{width:250px;min-width:200px;border-right:1px solid #dee2e6;display:flex;flex-direction:column;overflow:hidden}
  .plan-left-content{flex:1;overflow-y:auto}
  .plan-tree-item{display:flex;align-items:center;padding:4px 8px;cursor:pointer;font-size:.85rem}
  .plan-tree-item:hover{background:#e9ecef}
  .plan-tree-item.selected{background:#cfe2ff}
  .plan-tree-item.child{padding-left:24px}
  .plan-tree-item.is-group{font-weight:600}
  .plan-tree-icon{margin-right:4px;font-size:.7rem}
  .plan-tree-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .plan-center{flex:1;overflow-y:auto;padding:12px;position:relative}
  .plan-right{width:350px;min-width:280px;border-left:1px solid #dee2e6;overflow-y:auto;background:#fafafa}
  .plan-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%}
  .nav-sm .nav-link{padding:4px 10px;font-size:.8rem}
  .def-item{display:flex;align-items:center;padding:2px 8px;font-size:.8rem;border-left:2px solid #dee2e6;margin:2px 0}
  .btn-close-sm{font-size:.7rem;padding:0;border:none;background:none;color:#999;cursor:pointer;margin-left:auto}
  .context-menu{background:#fff;border:1px solid #dee2e6;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.15);padding:4px 0;min-width:160px;z-index:1000}
  .context-item{display:block;width:100%;text-align:left;padding:6px 14px;border:none;background:none;font-size:.85rem;cursor:pointer}
  .context-item:hover{background:#e9ecef}
  .flex-grow-1{flex:1}
  .modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.3);z-index:1040}
  .modal{z-index:1050}
</style>
