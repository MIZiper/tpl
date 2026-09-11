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
    updateDef,
    removeDef,
    updateInputLayout,
    addTemplate,
    applyTemplate,
    delTemplate,
    exportJSON,
    importJSON,
  } from "../../stores/plan";
  import { planApi } from "../../lib/api";
  import { getFieldTypes, getFieldType, defUnit } from "../../lib/fieldtypes";
  import { getStructTypes, getStructType } from "../../lib/structs";
  import { getTransforms, getTransform, type PortSpec } from "../../lib/transforms";
  import { generateId, outputsOf, orderedInputDefs } from "../../lib/plan-utils";
  import { positionMenu } from "../../lib/flip-menu";
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
  import ComputedFlyout from "./ComputedFlyout.svelte";
  import InputLayoutModal from "./InputLayoutModal.svelte";

  let id: string = $derived(route.params.id ?? "");

  let leftTab = $state<"tree" | "definitions" | "templates" | "transforms">("tree");
  let contextMenu = $state<{ x: number; y: number; nodeId: string | null; parentId: string | null; index: number } | null>(null);
  let showDefForm = $state(false);
  let defCategory: keyof PlanDefinitions = $state<keyof PlanDefinitions>("input_conditions");
  let editingDef = $state<PlanFieldDef | null>(null);
  let newDef = $state({ name: "", typeId: "text" as string });
  let newDefParams = $state<Record<string, unknown>>({});
  let structTypeId = $state("");
  let structParamValues = $state<Record<string, unknown>>({});
  let newTemplateName = $state("");
  let showInputLayout = $state(false);

  let showTransformForm = $state(false);
  let editingTransformId = $state<string | null>(null);
  let newTransform = $state({
    name: "",
    typeId: "linear",
    inputs: [] as TransformInputBinding[],
    params: {} as Record<string, unknown>,
  });
  let newOutputs = $state<{ role: string; label: string; name: string; unit: string }[]>([]);

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
    editingDef = null;
    newDef = { name: "", typeId: "text" };
    newDefParams = {};
    structTypeId = ""; structParamValues = {};
  }

  function openNewDef(cat: keyof PlanDefinitions) {
    resetDefForm();
    defCategory = cat;
    showDefForm = true;
  }

  function prefillDefForm(field: PlanFieldDef) {
    newDef = { name: field.name, typeId: field.typeId };
    const params: Record<string, unknown> = {};
    const ft = getFieldType(field.typeId);
    for (const p of ft?.paramsSchema ?? []) {
      const v = field.params[p.key];
      if (v == null) {
        params[p.key] = p.default ?? "";
        continue;
      }
      if (p.type === "textlist") params[p.key] = Array.isArray(v) ? v.join("\n") : String(v);
      else if (p.type === "number") params[p.key] = v;
      else params[p.key] = v;
    }
    newDefParams = params;
    structTypeId = field.typeId === "struct" ? String(field.params.structTypeId ?? "") : "";
    structParamValues = {};
    if (field.typeId === "struct" && structTypeId) {
      const vals: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(field.params)) {
        if (k !== "structTypeId") vals[k] = v;
      }
      structParamValues = vals;
    }
  }

  function openDefForm(cat: keyof PlanDefinitions, field: PlanFieldDef) {
    resetDefForm();
    defCategory = cat;
    prefillDefForm(field);
    editingDef = { ...field };
    showDefForm = true;
  }

  function buildFieldParams(): Record<string, unknown> {
    const ft = getFieldType(newDef.typeId);
    const params: Record<string, unknown> = {};
    if (ft?.paramsSchema?.length) {
      for (const p of ft.paramsSchema) {
        const v = newDefParams[p.key];
        if (v == null || v === "") continue;
        if (p.type === "number") params[p.key] = Number(v);
        else if (p.type === "textlist") {
          const items = String(v).split(/[\n,]/).map(s => s.trim()).filter(Boolean);
          if (items.length) params[p.key] = items;
        } else params[p.key] = v;
      }
    }
    if (newDef.typeId === "struct" && structTypeId) {
      params.structTypeId = structTypeId;
      for (const [k, v] of Object.entries(structParamValues)) {
        if (v !== undefined && v !== "") params[k] = v;
      }
    }
    return params;
  }

  function submitDef() {
    if (!newDef.name) return;
    const params = buildFieldParams();
    if (editingDef) {
      updateDef(defCategory, {
        id: editingDef.id,
        typeId: newDef.typeId,
        name: newDef.name,
        params,
        derived: editingDef.derived,
      });
    } else {
      addDef(defCategory, { typeId: newDef.typeId, name: newDef.name, params });
    }
    resetDefForm();
    showDefForm = false;
  }

  function defaultInputsFor(typeId: string): TransformInputBinding[] {
    const cls = getTransform(typeId);
    const ports = cls ? cls.inputs() : [];
    if (ports.some(p => p.variadic)) return [];
    return ports.map(p => ({ role: p.role, definitionId: "" }));
  }

  function defaultOutputsFor(typeId: string) {
    const cls = getTransform(typeId);
    return (cls?.outputs() ?? []).map((o) => ({
      role: o.role, label: o.label, name: "", unit: "",
    }));
  }

  function resetTransformForm() {
    const typeId = "linear";
    newTransform = { name: "", typeId, inputs: defaultInputsFor(typeId), params: {} };
    newOutputs = defaultOutputsFor(typeId);
  }

  function openTransformForm() {
    resetTransformForm();
    showTransformForm = true;
  }

  function onTransformTypeChange(tid: string) {
    const cls = getTransform(tid);
    const ports = cls ? cls.inputs() : [];
    let inputs: TransformInputBinding[] = [];
    if (cls && !ports.some(p => p.variadic)) {
      inputs = ports.map(p => ({ role: p.role, definitionId: newTransform.inputs.find(i => i.role === p.role)?.definitionId ?? "" }));
    }
    const defaults = defaultOutputsFor(tid);
    newOutputs = defaults.map(o => newOutputs.find(x => x.role === o.role) ?? o);
    newTransform = { ...newTransform, typeId: tid, inputs, params: {} };
  }

  function updateInput(idx: number, patch: Partial<TransformInputBinding>) {
    const inputs = [...newTransform.inputs];
    if (idx >= 0 && idx < inputs.length) inputs[idx] = { ...inputs[idx], ...patch };
    newTransform = { ...newTransform, inputs };
  }

  function upsertInput(role: string, patch: Partial<TransformInputBinding>) {
    const inputs = [...newTransform.inputs];
    const idx = inputs.findIndex(i => i.role === role);
    if (idx >= 0) inputs[idx] = { ...inputs[idx], ...patch };
    else inputs.push({ role, definitionId: "", ...patch });
    newTransform = { ...newTransform, inputs };
  }

  function addInput(role: string) {
    newTransform = { ...newTransform, inputs: [...newTransform.inputs, { role, definitionId: "" }] };
  }

  function removeInput(idx: number) {
    newTransform = { ...newTransform, inputs: newTransform.inputs.filter((_, i) => i !== idx) };
  }

  function addTransform() {
    if (!newTransform.name) return;
    const doc = $planState.document;
    if (!doc) return;

    const outputs: { role: string; definitionId: string }[] = [];
    for (const o of newOutputs) {
      if (!o.name) return;
      const defId = generateId();
      doc.definitions.input_conditions.push({
        id: defId, typeId: "number", name: o.name,
        params: o.unit ? { unit: o.unit } : {}, derived: true,
      });
      outputs.push({ role: o.role, definitionId: defId });
    }
    if (!outputs.length) return;

    const t: TransformDef = {
      id: generateId(),
      name: newTransform.name,
      typeId: newTransform.typeId,
      inputs: newTransform.inputs,
      outputs,
      derivedDefId: outputs[0].definitionId,
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
      return { ...s, document: { ...s.document, transforms: s.document.transforms.map(t => t.id === tId ? { ...t, inputs: t.inputs.some(i => i.role === role) ? t.inputs.map(i => i.role === role ? { ...i, ...patch } : i) : [...t.inputs, { role, definitionId: "", ...patch }] } : t) }, dirty: true };
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
    <button
      class="btn btn-sm btn-outline-primary ms-1"
      onclick={() => (showInputLayout = true)}
      disabled={!$planState.document || $planState.document.definitions.input_conditions.length === 0}
      title="Edit the global Input order and width with a live preview"
    >Input layout</button>
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
                {@const catDefs = cat === "input_conditions" ? orderedInputDefs(doc.definitions.input_conditions, doc.input_layout) : doc.definitions[cat]}
                <div class="mb-2">
                  <div class="d-flex justify-content-between align-items-center mb-1">
                    <small class="fw-bold text-muted">{catLab(cat)}</small>
                    <button class="btn btn-sm btn-link" onclick={() => openNewDef(cat)}>+</button>
                  </div>
                  {#each catDefs as f (f.id)}
                    <div class="def-item" class:editing={editingDef?.id === f.id}>
                      <button type="button" class="flex-grow-1 def-item-edit" onclick={() => openDefForm(cat, f)} title="Edit field">
                        <span class="me-1">{f.name}</span>
                        <small class="text-muted">({getFieldType(f.typeId)?.describe(f.params) ?? f.typeId})</small>
                        {#if f.typeId === "struct" && f.params.structTypeId}
                          <br /><small class="text-muted">{JSON.stringify(Object.fromEntries(Object.entries(f.params).filter(([k]) => k !== "structTypeId")))}</small>
                        {/if}
                        {#if isDerivedDef(doc, f.id)}<br /><span class="badge bg-secondary">Computed</span>{/if}
                      </button>
                      <button class="btn btn-sm btn-close-sm" onclick={() => removeDef(cat, f.id)}>&times;</button>
                    </div>
                  {/each}
                  {#if doc.definitions[cat].length === 0}<div class="text-muted" style="font-size:0.8rem">None</div>{/if}

                  {#if showDefForm && defCategory === cat}
                    {@const ft = getFieldType(newDef.typeId)}
                    <div class="card card-body mb-2 bg-light">
                      {#if editingDef}
                        <div class="mb-1"><small class="text-muted">Editing field</small></div>
                      {/if}
                      <div class="mb-2"><input class="form-control form-control-sm" placeholder="Name" bind:value={newDef.name} /></div>
                      <div class="mb-2">
                        {#if editingDef}
                          <input class="form-control form-control-sm" value={getFieldType(newDef.typeId)?.displayName ?? newDef.typeId} disabled />
                        {:else}
                          <select class="form-select form-select-sm" bind:value={newDef.typeId}>
                            {#each getFieldTypes() as f2 (f2.typeId)}
                              <option value={f2.typeId}>{f2.displayName}</option>
                            {/each}
                          </select>
                        {/if}
                      </div>

                      {#each (ft?.paramsSchema ?? []) as p (p.key)}
                        <div class="mb-2">
                          <label class="form-label small mb-0">{p.label}</label>
                          {#if p.type === "number"}
                            <input type="number" class="form-control form-control-sm" step="any" value={String(newDefParams[p.key] ?? p.default ?? "")} oninput={(e) => { const v = (e.target as HTMLInputElement).value; newDefParams = { ...newDefParams, [p.key]: v }; }} />
                          {:else if p.type === "select" && p.options}
                            <select class="form-select form-select-sm" value={String(newDefParams[p.key] ?? p.default ?? "")} onchange={(e) => { newDefParams = { ...newDefParams, [p.key]: (e.target as HTMLSelectElement).value }; }}>
                              {#each p.options as opt}<option value={opt}>{opt}</option>{/each}
                            </select>
                          {:else if p.type === "textlist"}
                            <textarea class="form-control form-control-sm" rows="2" placeholder="{p.label} (one per line or comma-separated)" value={String(newDefParams[p.key] ?? "")} oninput={(e) => { newDefParams = { ...newDefParams, [p.key]: (e.target as HTMLTextAreaElement).value }; }}></textarea>
                          {:else}
                            <input type="text" class="form-control form-control-sm" value={String(newDefParams[p.key] ?? "")} oninput={(e) => { newDefParams = { ...newDefParams, [p.key]: (e.target as HTMLInputElement).value }; }} />
                          {/if}
                        </div>
                      {/each}

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

                      <div><button class="btn btn-sm btn-primary me-1" onclick={submitDef}>{editingDef ? "Save" : "Add"}</button><button class="btn btn-sm btn-secondary" onclick={() => { showDefForm = false; resetDefForm(); }}>Cancel</button></div>
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
                <button class="btn btn-sm btn-link" onclick={openTransformForm}>+</button>
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
                          <select class="form-select form-select-sm" value={inp?.definitionId ?? ""} onchange={(e) => upsertInput(port.role, { definitionId: (e.target as HTMLSelectElement).value })}>
                            <option value="">-- select --</option>
                            {#each candidates as d (d.id)}
                              <option value={d.id}>{d.name}{defUnit(d) ? ` (${defUnit(d)})` : ""}{isDerivedDef(doc, d.id) ? " [computed]" : ""}</option>
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
                    <small class="text-muted d-block mb-1">Outputs</small>
                    {#each newOutputs as o (o.role)}
                      <div class="mb-2">
                        <small class="text-muted d-block mb-1 fw-bold">{o.label}</small>
                        <div class="d-flex gap-1 mb-1">
                          <input class="form-control form-control-sm" placeholder="Derived name" bind:value={o.name} />
                          <input class="form-control form-control-sm" placeholder="Unit" style="max-width:80px" bind:value={o.unit} />
                        </div>
                      </div>
                    {/each}
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

                  <div><button class="btn btn-sm btn-primary me-1" onclick={addTransform} disabled={!newTransform.name || newOutputs.some(o => !o.name)}>Add</button><button class="btn btn-sm btn-secondary" onclick={() => { showTransformForm = false; resetTransformForm(); }}>Cancel</button></div>
                </div>
              {/if}

              {#each doc.transforms as t (t.id)}
                {@const cls = getTransform(t.typeId)}
                {@const ports = cls?.inputs() ?? []}
                {@const variadic = ports.some(p => p.variadic)}
                {@const isEditing = editingTransformId === t.id}
                {@const sourceNames = t.inputs.map(inp => { const d = inputDefs.find(x => x.id === inp.definitionId); return d ? d.name : inp.role; }).join(", ") || "?"}
                {@const outNames = outputsOf(t).map(o => inputDefs.find(d => d.id === o.definitionId)?.name).filter(Boolean).join(" + ") || "?"}
                {@const multiOutput = outputsOf(t).length > 1}
                <div class="def-item" onclick={() => editingTransformId = isEditing ? null : t.id} style="cursor:pointer">
                  <div class="flex-grow-1">
                    <div class="d-flex justify-content-between align-items-start">
                      <div>
                        <span>{t.name}</span>
                        <small class="text-muted d-block">{sourceNames} → {outNames}</small>
                        <small class="text-muted d-block">method: {cls?.displayName ?? t.typeId}</small>
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
                      <small class="text-muted d-block mb-1">Outputs</small>
                      {#each outputsOf(t) as ob (ob.role)}
                        {@const od = inputDefs.find(d => d.id === ob.definitionId)}
                        <div class="d-flex gap-1 mb-1 align-items-center">
                          {#if multiOutput}<small class="text-muted" style="min-width:90px">{ob.role}</small>{/if}
                          <small>{od ? `${od.name}${defUnit(od) ? ` (${defUnit(od)})` : ""}` : "(missing)"}</small>
                        </div>
                      {/each}
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
                    <li>Pick a transform method (e.g. Linear, Gearbox conversion)</li>
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
          <div class="context-menu" style="position:fixed;left:0;top:0" use:positionMenu={{ x: contextMenu.x, y: contextMenu.y }} onclick={(e) => e.stopPropagation()}>
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
          <PlanStepEditor node={selNode} definitions={doc.definitions} inputLayout={doc.input_layout ?? []} onupdate={(p) => updateSelected(p)} />
        {:else}
          <div class="p-3 text-center" style="margin-top:3rem"><div style="font-size:3rem;opacity:0.3">{"\u2699"}</div><div class="text-muted">Select a step to edit</div></div>
        {/if}
      </div>

      <ComputedFlyout node={selNode} definitions={doc.definitions} transforms={doc.transforms} />
    </div>

    {#if showInputLayout}
      <InputLayoutModal
        definitions={doc.definitions}
        layout={doc.input_layout ?? []}
        onapply={(l) => { updateInputLayout(l); showInputLayout = false; }}
        onclose={() => (showInputLayout = false)}
      />
    {/if}
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
  .def-item.editing{border-left-color:#6f42c1;background:#f8f6ff}
  .def-item-edit{cursor:pointer;min-width:0;display:block;text-align:left;border:none;background:none;padding:0;font-size:inherit;color:inherit}
  .def-item-edit:hover .me-1{text-decoration:underline}
  .btn-close-sm{font-size:.7rem;padding:0;border:none;background:none;color:#999;cursor:pointer;margin-left:auto}
  .context-menu{background:#fff;border:1px solid #dee2e6;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.15);padding:4px 0;min-width:160px;z-index:1000}
  .context-item{display:block;width:100%;text-align:left;padding:6px 14px;border:none;background:none;font-size:.85rem;cursor:pointer}
  .context-item:hover{background:#e9ecef}
  .flex-grow-1{flex:1}
</style>
