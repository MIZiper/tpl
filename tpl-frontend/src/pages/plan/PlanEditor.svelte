<script lang="ts">
  import { onMount } from "svelte";
  import { p, route } from "../../router";
  import {
    planState,
    selectedNode,
    loadDoc,
    saveDoc,
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
  import { getFieldTypes, getFieldType } from "../../lib/fieldtypes";
  import { getStructTypes, getStructType } from "../../lib/structs";
  import { getTransforms, getTransform, type PortSpec } from "../../lib/transforms";
  import { generateId } from "../../lib/plan-utils";
  import type {
    PlanNode,
    PlanDocument,
    PlanFieldDef,
    PlanDefinitions,
    TransformDef,
    TransformInputBinding,
  } from "../../types/plan";
  import PlanCanvas from "./PlanCanvas.svelte";
  import PlanStepEditor from "./PlanStepEditor.svelte";

  let id: string = $derived(route.params.id ?? "");

  let leftTab = $state<"tree" | "definitions" | "templates" | "transforms">("tree");
  let contextMenu = $state<{ x: number; y: number; nodeId: string | null; parentId: string | null; index: number } | null>(null);
  let showDefForm = $state(false);
  let defCategory: keyof PlanDefinitions = $state<keyof PlanDefinitions>("input_conditions");
  let newDef = $state({ name: "", typeId: "text" as string, unit: null as string | null, optionsText: "" });
  let structTypeId = $state("");
  let structParamValues = $state<Record<string, unknown>>({});
  let newTemplateName = $state("");

  let showTransformForm = $state(false);
  let editingTransformId = $state<string | null>(null);
  let newTransform = $state({
    name: "",
    typeId: "linear",
    inputs: [] as TransformInputBinding[],
    derivedDefId: "",
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
        const doc = $planState.document; if (doc) { addTemplate(find(doc.root, payload.nodeId)?.title || "Template", payload.nodeId); }
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

  function resetDefForm() {
    newDef = { name: "", typeId: "text", unit: null, optionsText: "" };
    structTypeId = ""; structParamValues = {};
  }

  function addNewDef() {
    if (!newDef.name) return;
    const params: Record<string, unknown> = {};
    if (newDef.typeId === "select" && newDef.optionsText.trim()) {
      params.options = newDef.optionsText.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
    }
    if (newDef.typeId === "struct" && structTypeId) {
      params.structTypeId = structTypeId;
      for (const [k, v] of Object.entries(structParamValues)) {
        if (v !== undefined && v !== "") params[k] = v;
      }
    }
    addDef(defCategory, { typeId: newDef.typeId, name: newDef.name, unit: newDef.unit, params });
    resetDefForm();
    showDefForm = false;
  }

  function resetTransformForm() {
    newTransform = { name: "", typeId: "linear", inputs: [], derivedDefId: "", params: {} };
    newTargetMode = "new"; newTargetName = ""; newTargetUnit = "";
  }

  function onTransformTypeChange(tid: string) {
    const cls = getTransform(tid);
    const ports = cls ? cls.inputs() : [];
    let inputs = newTransform.inputs;
    if (cls && !ports.some(p => p.variadic)) {
      inputs = ports.map(p => ({ role: p.role, definitionId: newTransform.inputs.find(i => i.role === p.role)?.definitionId ?? "" }));
    }
    newTransform = { ...newTransform, typeId: tid, inputs, params: {} };
  }

  function updateInput(idx: number, patch: Partial<TransformInputBinding>) {
    const inputs = [...newTransform.inputs];
    if (idx >= 0 && idx < inputs.length) inputs[idx] = { ...inputs[idx], ...patch };
    newTransform = { ...newTransform, inputs };
  }

  function addInput(role: string) {
    newTransform = { ...newTransform, inputs: [...newTransform.inputs, { role, definitionId: "" }] };
  }

  function removeInput(idx: number) {
    newTransform = { ...newTransform, inputs: newTransform.inputs.filter((_, i) => i !== idx) };
  }

  function addTransform() {
    if (!newTransform.name && !newTargetName) return;
    const doc = $planState.document;
    if (!doc) return;

    let targetDefId = newTransform.derivedDefId;
    if (newTargetMode === "new" && newTargetName) {
      targetDefId = generateId();
      doc.definitions.input_conditions.push({
        id: targetDefId, typeId: "number", name: newTargetName,
        unit: newTargetUnit || null, params: {}, derived: true,
      });
    }
    if (!targetDefId) return;

    const t: TransformDef = {
      id: generateId(),
      name: newTransform.name || newTargetName,
      typeId: newTransform.typeId,
      inputs: newTransform.inputs,
      derivedDefId: targetDefId,
      derived: { name: newTargetName || "", unit: newTargetUnit || null },
      params: newTransform.params,
    };
    planState.update((s) => {
      if (!s.document) return s;
      return { ...s, document: { ...s.document, transforms: [...s.document.transforms, t] }, dirty: true };
    });
    resetTransformForm();
    showTransformForm = false;
  }

  function removeTransform(tId: string) {
    planState.update((s) => {
      if (!s.document) return s;
      return { ...s, document: { ...s.document, transforms: s.document.transforms.filter(t => t.id !== tId) }, dirty: true };
    });
    if (editingTransformId === tId) editingTransformId = null;
  }

  function updateTransform(tId: string, patch: Partial<TransformDef>) {
    planState.update((s) => {
      if (!s.document) return s;
      return { ...s, document: { ...s.document, transforms: s.document.transforms.map(t => t.id === tId ? { ...t, ...patch } : t) }, dirty: true };
    });
  }

  function updateTInput(tId: string, role: string, patch: Partial<TransformInputBinding>) {
    planState.update((s) => {
      if (!s.document) return s;
      return { ...s, document: { ...s.document, transforms: s.document.transforms.map(t => t.id === tId ? { ...t, inputs: t.inputs.map(i => i.role === role ? { ...i, ...patch } : i) } : t) }, dirty: true };
    });
  }

  function addTInput(tId: string, role: string) {
    planState.update((s) => {
      if (!s.document) return s;
      return { ...s, document: { ...s.document, transforms: s.document.transforms.map(t => t.id === tId ? { ...t, inputs: [...t.inputs, { role, definitionId: "" }] } : t) }, dirty: true };
    });
  }

  function removeTInput(tId: string, role: string) {
    planState.update((s) => {
      if (!s.document) return s;
      return { ...s, document: { ...s.document, transforms: s.document.transforms.map(t => t.id === tId ? { ...t, inputs: t.inputs.filter(i => i.role !== role) } : t) }, dirty: true };
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== "Delete" || !$planState.selectedNodeId) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    delNode($planState.selectedNodeId); saveDoc(id, planApi.saveDocument);
  }

  function catLab(c: keyof PlanDefinitions) { return { input_conditions: "Input Conditions", collection_items: "Measurement Items", completion_criteria: "Completion Criteria", custom: "Custom" }[c]; }
  function tLab(tid: string): string { return getFieldType(tid)?.displayName ?? tid; }

  function isDerivedDef(doc: PlanDocument | null, defId: string): boolean {
    if (!doc) return false;
    const all = [...doc.definitions.input_conditions, ...doc.definitions.collection_items, ...doc.definitions.completion_criteria, ...doc.definitions.custom];
    return all.find(d => d.id === defId)?.derived === true;
  }

  function allInputDefs(doc: PlanDocument): PlanFieldDef[] {
    return [...doc.definitions.input_conditions, ...doc.definitions.custom];
  }

  function defsForPort(defs: PlanFieldDef[], port: PortSpec): PlanFieldDef[] {
    if (port.kind === "struct") {
      return defs.filter(d => d.typeId === "struct" && (d.params.structTypeId === port.structType || !port.structType));
    }
    return defs.filter(d => d.typeId === port.fieldType || !port.fieldType);
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="plan-editor">
  <div class="plan-toolbar">
    <a href={p("/documents/:id", { params: { id } })} class="btn btn-sm btn-outline-secondary">Back</a>
    <span class="flex-grow-1"></span>
    {#if $planState.dirty}
      <button class="btn btn-sm btn-success" onclick={() => saveDoc(id, planApi.saveDocument)}>Save *</button>
    {/if}
    {#if $planState.document}
      <button class="btn btn-sm btn-outline-success ms-1" onclick={exportJSON}>Export</button>
    {/if}
    <label class="btn btn-sm btn-outline-info ms-1">Import<input type="file" accept=".json" class="d-none" onchange={handleImport} /></label>
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
                  <div class="d-flex justify-content-between align-items-center mb-1"><small class="fw-bold text-muted">{catLab(cat)}</small><button class="btn btn-sm btn-link" onclick={() => { defCategory = cat; showDefForm = true; }}>+</button></div>
                  {#each doc.definitions[cat] as f (f.id)}
                    <div class="def-item">
                      <div class="flex-grow-1">
                        <span class="me-1">{f.name}</span>
                        <small class="text-muted">({tLab(f.typeId)}{f.typeId === "struct" ? ` · ${String(f.params.structTypeId ?? "?")}` : ""}{f.unit ? `, ${f.unit}` : ""}{f.typeId === "select" ? `, ${(f.params.options as string[] | undefined)?.length ?? 0}opts` : ""})</small>
                        {#if f.typeId === "struct" && f.params.structTypeId}
                          <br /><small class="text-muted">{JSON.stringify(Object.fromEntries(Object.entries(f.params).filter(([k]) => k !== "structTypeId")))}</small>
                        {/if}
                        {#if isDerivedDef(doc, f.id)}<br /><span class="badge bg-secondary">Computed</span>{/if}
                      </div>
                      <button class="btn btn-sm btn-close-sm" onclick={() => removeDef(cat, f.id)}>&times;</button>
                    </div>
                  {/each}
                  {#if doc.definitions[cat].length === 0}<div class="text-muted" style="font-size:0.8rem">None</div>{/if}

                  {#if showDefForm && defCategory === cat}
                    <div class="card card-body mb-2 bg-light">
                      <div class="mb-2"><input class="form-control form-control-sm" placeholder="Name" bind:value={newDef.name} /></div>
                      <div class="mb-2">
                        <select class="form-select form-select-sm" bind:value={newDef.typeId}>
                          {#each getFieldTypes() as ft (ft.typeId)}
                            <option value={ft.typeId}>{ft.displayName}</option>
                          {/each}
                        </select>
                      </div>
                      <div class="mb-2"><input class="form-control form-control-sm" placeholder="Unit" bind:value={newDef.unit} /></div>

                      {#if newDef.typeId === "select"}
                        <div class="mb-2"><textarea class="form-control form-control-sm" rows="2" placeholder="Options (one per line or comma-separated)" bind:value={newDef.optionsText}></textarea></div>
                      {/if}

                      {#if newDef.typeId === "struct"}
                        {@const structTypes = getStructTypes()}
                        <div class="mb-2">
                          <select class="form-select form-select-sm" bind:value={structTypeId} onchange={() => { structParamValues = {}; }}>
                            <option value="">-- select struct type --</option>
                            {#each structTypes as st (st.typeId)}
                              <option value={st.typeId}>{st.displayName}</option>
                            {/each}
                          </select>
                        </div>
                        {#if structTypeId}
                          {@const st = getStructType(structTypeId)}
                          {#if st?.fieldsSchema?.length}
                            <div class="mb-2">
                              <small class="fw-bold text-muted d-block">{st.displayName} fields</small>
                              {#each st.fieldsSchema as f (f.key)}
                                <div class="mb-1">
                                  <label class="form-label small mb-0">{f.label}</label>
                                  {#if f.dataType === "number"}
                                    <input type="number" class="form-control form-control-sm" value={structParamValues[f.key] ?? ""} oninput={(e) => { const v = (e.target as HTMLInputElement).value; structParamValues = { ...structParamValues, [f.key]: v !== "" ? Number(v) : undefined }; }} step="any" />
                                  {:else if f.dataType === "select" && f.options}
                                    <select class="form-select form-select-sm" value={String(structParamValues[f.key] ?? "")} onchange={(e) => { structParamValues = { ...structParamValues, [f.key]: (e.target as HTMLSelectElement).value }; }}>
                                      <option value="">--</option>
                                      {#each f.options as opt}<option value={opt}>{opt}</option>{/each}
                                    </select>
                                  {:else}
                                    <input type="text" class="form-control form-control-sm" value={structParamValues[f.key] ?? ""} oninput={(e) => { structParamValues = { ...structParamValues, [f.key]: (e.target as HTMLInputElement).value }; }} />
                                  {/if}
                                </div>
                              {/each}
                            </div>
                          {/if}
                        {/if}
                      {/if}

                      <div><button class="btn btn-sm btn-primary me-1" onclick={addNewDef}>Add</button><button class="btn btn-sm btn-secondary" onclick={() => { showDefForm = false; resetDefForm(); }}>Cancel</button></div>
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
            </div>
          {:else if leftTab === "transforms"}
            {@const inputDefs = allInputDefs(doc)}
            {@const transforms = getTransforms()}
            <div class="p-2">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <small class="fw-bold text-muted">TRANSFORMS</small>
                <button class="btn btn-sm btn-link" onclick={() => { showTransformForm = true; }}>+</button>
              </div>

              {#if showTransformForm}
                {@const selTransform = getTransform(newTransform.typeId)}
                {@const ports = selTransform?.inputs() ?? []}
                {@const variadic = ports.some(p => p.variadic)}
                <div class="card card-body mb-2 bg-light">
                  <div class="mb-2"><input class="form-control form-control-sm" placeholder="Name" bind:value={newTransform.name} /></div>
                  <div class="mb-2">
                    <select class="form-select form-select-sm" value={newTransform.typeId} onchange={(e) => onTransformTypeChange((e.target as HTMLSelectElement).value)}>
                      {#each transforms as tf (tf.typeId)}
                        <option value={tf.typeId}>{tf.displayName}</option>
                      {/each}
                    </select>
                  </div>

                  <div class="mb-2">
                    <small class="text-muted d-block mb-1">Inputs</small>
                    {#if variadic}
                      {#each newTransform.inputs as inp, i (i)}
                        <div class="d-flex gap-1 mb-1">
                          <input class="form-control form-control-sm" style="max-width:90px" placeholder="var" value={inp.role} oninput={(e) => { const v = (e.target as HTMLInputElement).value; updateInput(i, { role: v || `v${i+1}` }); }} />
                          <select class="form-select form-select-sm" value={inp.definitionId} onchange={(e) => updateInput(i, { definitionId: (e.target as HTMLSelectElement).value })}>
                            <option value="">-- select definition --</option>
                            {#each inputDefs as d (d.id)}
                              <option value={d.id}>{d.name}{isDerivedDef(doc, d.id) ? " [computed]" : ""}</option>
                            {/each}
                          </select>
                          <button class="btn btn-sm btn-close-sm" onclick={() => removeInput(i)}>&times;</button>
                        </div>
                      {/each}
                      <button class="btn btn-sm btn-outline-secondary" onclick={() => addInput(`v${newTransform.inputs.length + 1}`)}>+ variable</button>
                    {:else}
                      {#each ports as port (port.role)}
                        {@const candidates = defsForPort(inputDefs, port)}
                        {@const inp = newTransform.inputs.find(i => i.role === port.role)}
                        <div class="mb-1">
                          <label class="form-label small mb-0">{port.label} <small class="text-muted">({port.kind}{port.fieldType ? ` ${port.fieldType}` : ""}{port.structType ? `:${port.structType}` : ""})</small></label>
                          <select class="form-select form-select-sm" value={inp?.definitionId ?? ""} onchange={(e) => updateInput(newTransform.inputs.findIndex(i => i.role === port.role), { definitionId: (e.target as HTMLSelectElement).value })}>
                            <option value="">-- select --</option>
                            {#each candidates as d (d.id)}
                              <option value={d.id}>{d.name}{d.unit ? ` (${d.unit})` : ""}{isDerivedDef(doc, d.id) ? " [computed]" : ""}</option>
                            {/each}
                          </select>
                          {#if candidates.length === 0}
                            <small class="text-muted d-block mt-1">No matching definitions. Add a matching field in the Defs tab.</small>
                          {/if}
                        </div>
                      {/each}
                    {/if}
                  </div>

                  <div class="mb-2">
                    <small class="text-muted d-block mb-1">Output</small>
                    <div class="d-flex gap-1 mb-1">
                      <input class="form-control form-control-sm" placeholder="Derived name" bind:value={newTargetName} />
                      <input class="form-control form-control-sm" placeholder="Unit" style="max-width:80px" bind:value={newTargetUnit} />
                    </div>
                    <div class="form-check form-check-inline mb-1">
                      <input class="form-check-input" type="radio" name="targetMode" id="targetNew" checked={newTargetMode === "new"} onchange={() => newTargetMode = "new"} />
                      <label class="form-check-label small" for="targetNew">Bind to new field</label>
                    </div>
                    <div class="form-check form-check-inline mb-1">
                      <input class="form-check-input" type="radio" name="targetMode" id="targetExist" checked={newTargetMode === "existing"} onchange={() => newTargetMode = "existing"} />
                      <label class="form-check-label small" for="targetExist">Bind to existing</label>
                    </div>
                    {#if newTargetMode === "existing"}
                      <select class="form-select form-select-sm mt-1" bind:value={newTransform.derivedDefId}>
                        <option value="">-- select field --</option>
                        {#each inputDefs as d (d.id)}
                          <option value={d.id}>{d.name}{d.derived ? " [computed]" : ""}</option>
                        {/each}
                      </select>
                    {/if}
                  </div>

                  {#if selTransform}
                    <div class="mb-2"><small class="fw-bold text-muted">{selTransform.displayName} Parameters</small></div>
                    {#each selTransform.paramsSchema as p (p.key)}
                      <div class="mb-2">
                        <label class="form-label small mb-0">{p.label}</label>
                        {#if p.type === "text"}
                          <textarea class="form-control form-control-sm" rows="2" style="font-family:monospace;font-size:0.75rem" value={String(newTransform.params[p.key] ?? "")} oninput={(e) => { newTransform.params = { ...newTransform.params, [p.key]: (e.target as HTMLTextAreaElement).value }; }}></textarea>
                        {:else if p.type === "select" && p.options}
                          <select class="form-select form-select-sm" value={String(newTransform.params[p.key] ?? p.default ?? "")} onchange={(e) => { newTransform.params = { ...newTransform.params, [p.key]: (e.target as HTMLSelectElement).value }; }}>
                            {#each p.options as opt}<option value={opt}>{opt}</option>{/each}
                          </select>
                        {:else}
                          <input type="number" class="form-control form-control-sm" value={newTransform.params[p.key] ?? p.default ?? ""} oninput={(e) => { const v = (e.target as HTMLInputElement).value; newTransform.params = { ...newTransform.params, [p.key]: v !== "" ? Number(v) : null }; }} step="any" />
                        {/if}
                      </div>
                    {/each}
                  {/if}

                  <div><button class="btn btn-sm btn-primary me-1" onclick={addTransform} disabled={!newTransform.name || (newTargetMode === "existing" && !newTransform.derivedDefId) || (newTargetMode === "new" && !newTargetName)}>Add</button><button class="btn btn-sm btn-secondary" onclick={() => { showTransformForm = false; resetTransformForm(); }}>Cancel</button></div>
                </div>
              {/if}

              {#each doc.transforms as t (t.id)}
                {@const cls = getTransform(t.typeId)}
                {@const ports = cls?.inputs() ?? []}
                {@const variadic = ports.some(p => p.variadic)}
                {@const bindDef = inputDefs.find(d => d.id === t.derivedDefId)}
                {@const isEditing = editingTransformId === t.id}
                {@const sourceNames = t.inputs.map(inp => { const d = inputDefs.find(x => x.id === inp.definitionId); return d ? d.name : inp.role; }).join(", ") || "?"}
                {@const outputName = t.derived.name || bindDef?.name || "?"}
                <div class="def-item" onclick={() => editingTransformId = isEditing ? null : t.id} style="cursor:pointer">
                  <div class="flex-grow-1">
                    <div class="d-flex justify-content-between align-items-start">
                      <div>
                        <span>{t.name}</span>
                        <small class="text-muted d-block">{sourceNames} → {outputName}{t.derived.unit ? ` (${t.derived.unit})` : ""}</small>
                        <small class="text-muted d-block">on: {bindDef?.name || "?"} · method: {cls?.displayName ?? t.typeId}</small>
                      </div>
                      <button class="btn btn-sm btn-close-sm" onclick={(e) => { e.stopPropagation(); removeTransform(t.id); }}>&times;</button>
                    </div>
                  </div>
                </div>
                {#if isEditing}
                  <div class="card card-body mb-2 bg-light" style="font-size:0.8rem">
                    <div class="mb-2"><input class="form-control form-control-sm" value={t.name} oninput={(e) => updateTransform(t.id, { name: (e.target as HTMLInputElement).value })} /></div>
                    <div class="mb-2">
                      <select class="form-select form-select-sm" value={t.typeId} onchange={(e) => { const tid = (e.target as HTMLSelectElement).value; const c2 = getTransform(tid); const ps = c2 ? c2.inputs() : []; updateTransform(t.id, { typeId: tid, inputs: c2 && !ps.some(p => p.variadic) ? ps.map(p => ({ role: p.role, definitionId: t.inputs.find(i => i.role === p.role)?.definitionId ?? "" })) : t.inputs }); }}>
                        {#each transforms as m (m.typeId)}
                          <option value={m.typeId}>{m.displayName}</option>
                        {/each}
                      </select>
                    </div>
                    <div class="mb-2">
                      <small class="text-muted d-block mb-1">Inputs</small>
                      {#if variadic}
                        {#each t.inputs as inp, i (inp.role + i)}
                          <div class="d-flex gap-1 mb-1">
                            <input class="form-control form-control-sm" style="max-width:90px" value={inp.role} oninput={(e) => updateTInput(t.id, inp.role, { role: (e.target as HTMLInputElement).value || inp.role })} />
                            <select class="form-select form-select-sm" value={inp.definitionId} onchange={(e) => updateTInput(t.id, inp.role, { definitionId: (e.target as HTMLSelectElement).value })}>
                              <option value="">-- select definition --</option>
                              {#each inputDefs as d (d.id)}
                                <option value={d.id}>{d.name}{isDerivedDef(doc, d.id) ? " [computed]" : ""}</option>
                              {/each}
                            </select>
                            <button class="btn btn-sm btn-close-sm" onclick={() => removeTInput(t.id, inp.role)}>&times;</button>
                          </div>
                        {/each}
                        <button class="btn btn-sm btn-outline-secondary" onclick={() => addTInput(t.id, `v${t.inputs.length + 1}`)}>+ variable</button>
                      {:else}
                        {#each ports as port (port.role)}
                          {@const candidates = defsForPort(inputDefs, port)}
                          {@const inp = t.inputs.find(i => i.role === port.role)}
                          <div class="d-flex gap-1 mb-1 align-items-center">
                            <small class="text-muted" style="min-width:90px">{port.label}</small>
                            <select class="form-select form-select-sm" value={inp?.definitionId ?? ""} onchange={(e) => updateTInput(t.id, port.role, { definitionId: (e.target as HTMLSelectElement).value })}>
                              <option value="">-- select --</option>
                              {#each candidates as d (d.id)}
                                <option value={d.id}>{d.name}{isDerivedDef(doc, d.id) ? " [computed]" : ""}</option>
                              {/each}
                            </select>
                          </div>
                        {/each}
                      {/if}
                    </div>
                    <div class="mb-2">
                      <small class="text-muted d-block">Output: {t.derived.name} · on: {bindDef?.name || t.derivedDefId.slice(0,8)}</small>
                    </div>
                    {#if cls}
                      {#each cls.paramsSchema as p (p.key)}
                        <div class="mb-2">
                          <label class="form-label small mb-0">{p.label}</label>
                          {#if p.type === "text"}
                            <textarea class="form-control form-control-sm" rows="2" style="font-family:monospace;font-size:0.7rem" value={String(t.params[p.key] ?? "")} oninput={(e) => { const newParams = { ...t.params, [p.key]: (e.target as HTMLTextAreaElement).value }; updateTransform(t.id, { params: newParams }); }}></textarea>
                          {:else if p.type === "select" && p.options}
                            <select class="form-select form-select-sm" value={String(t.params[p.key] ?? p.default ?? "")} onchange={(e) => { const newParams = { ...t.params, [p.key]: (e.target as HTMLSelectElement).value }; updateTransform(t.id, { params: newParams }); }}>
                              {#each p.options as opt}<option value={opt}>{opt}</option>{/each}
                            </select>
                          {:else}
                            <input type="number" class="form-control form-control-sm" value={t.params[p.key] ?? p.default ?? ""} oninput={(e) => { const v = (e.target as HTMLInputElement).value; const newParams = { ...t.params, [p.key]: v !== "" ? Number(v) : null }; updateTransform(t.id, { params: newParams }); }} step="any" />
                          {/if}
                        </div>
                      {/each}
                    {/if}
                  </div>
                {/if}
              {/each}
              {#if doc.transforms.length === 0 && !showTransformForm}
                <div class="text-muted" style="font-size:0.8rem">
                  <p>Transforms compute derived values from source inputs during logging.</p>
                  <ol class="small ps-3">
                    <li>Pick a transform method (e.g. Linear, Gearbox output speed)</li>
                    <li>Bind its typed inputs to definitions</li>
                    <li>Create a new derived output field or pick an existing one</li>
                  </ol>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>

      <!-- Center -->
      <div class="plan-center" oncontextmenu={(e) => { e.preventDefault(); ctxMenu(e, null, null, 0); }} onclick={closeCtx} role="presentation">
        {#if !$planState.document || ($planState.document.root.length === 0 && $planState.document.definitions.input_conditions.length === 0 && $planState.document.definitions.collection_items.length === 0 && $planState.document.definitions.completion_criteria.length === 0)}
          <div class="plan-empty"><div class="mb-3 text-muted">Plan is empty</div><button class="btn btn-outline-primary me-2" onclick={() => addStep(null, 0)}>+ Step</button><button class="btn btn-outline-secondary me-2" onclick={() => addGroup(null, 0)}>+ Group</button></div>
        {:else}
          <PlanCanvas nodes={doc.root} selectedNodeId={selId} parentId={null} definitions={doc.definitions} onContextMenu={ctxMenu} onselect={selectNode} />
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
          <PlanStepEditor node={selNode} definitions={doc.definitions} transforms={doc.transforms} onupdate={(p) => updateSelected(p)} />
        {:else}
          <div class="p-3 text-center" style="margin-top:3rem"><div style="font-size:3rem;opacity:0.3">{"\u2699"}</div><div class="text-muted">Select a step to edit</div></div>
        {/if}
      </div>
    </div>
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
</style>
