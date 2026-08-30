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
  import { getTransformMethods, getTransformMethod } from "../../lib/transform-registry";
  import { getAllStructTypes } from "../../lib/struct-registry";
  import { getAllOutputKeys } from "../../lib/value-type-registry";
  import { generateId, parseNum } from "../../lib/plan-utils";
  import type { PlanNode, PlanDocument, PlanFieldDef, PlanDefinitions, TransformDef, StructTypeDef, TransformPortBinding } from "../../types/plan";
  import PlanCanvas from "./PlanCanvas.svelte";
  import PlanStepEditor from "./PlanStepEditor.svelte";

  let id: string = $derived(route.params.id ?? "");

  let leftTab = $state<"tree" | "definitions" | "templates" | "transforms">("tree");
  let contextMenu = $state<{ x: number; y: number; nodeId: string | null; parentId: string | null; index: number } | null>(null);
  let showDefForm = $state(false);
  let defCategory: keyof PlanDefinitions = $state<keyof PlanDefinitions>("input_conditions");
  let newDef = $state({ name: "", data_type: "text" as PlanFieldDef["data_type"], unit: null as string | null, optionsText: "" });
  let structTypeId = $state("");
  let structParamValues = $state<Record<string, unknown>>({});
  let defTabExpanded: Record<string, boolean> = $state({});
  let newTemplateName = $state("");

  let showTransformForm = $state(false);
  let editingTransformId = $state<string | null>(null);
  let newTransform = $state({
    name: "",
    method_id: "formula",
    source_ports: [] as TransformPortBinding[],
    derived_definition_id: "",
    params: {} as Record<string, unknown>,
  });
  let newTargetMode = $state<"new" | "existing">("new");
  let newTargetName = $state("");
  let newTargetUnit = $state("");
  const outputKeys = $derived(getAllOutputKeys());

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
    const meta = buildMeta();
    addDef(defCategory, { name: newDef.name, data_type: newDef.data_type, unit: newDef.unit, meta });
    newDef = { name: "", data_type: "text", unit: null, optionsText: "" };
    structTypeId = "";
    structParamValues = {};
    showDefForm = false;
  }

  function addTransform() {
    if (!newTransform.name && !newTargetName) return;
    const doc = $planState.document;
    if (!doc) return;

    let targetDefId = newTransform.derived_definition_id;

    if (newTargetMode === "new" && newTargetName) {
      targetDefId = generateId();
      const derivedDef: PlanFieldDef = {
        id: targetDefId,
        name: newTargetName,
        data_type: "number",
        unit: newTargetUnit || null,
        meta: null,
        derived: true,
      };
      doc.definitions.input_conditions.push(derivedDef);
    }

    if (!targetDefId) return;

    const xformName = newTransform.name || newTargetName;
    const t: TransformDef = {
      id: generateId(),
      name: xformName,
      method_id: newTransform.method_id,
      source_ports: newTransform.source_ports,
      derived_definition_id: targetDefId,
      derived_name: newTargetName || "",
      derived_unit: newTargetUnit || undefined,
      params: newTransform.params,
    };
    planState.update((s) => {
      if (!s.document) return s;
      return { ...s, document: { ...s.document, transforms: [...s.document.transforms, t] }, dirty: true };
    });
    newTransform = { name: "", method_id: "formula", source_ports: [], derived_definition_id: "", params: {} };
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
    if (editingTransformId === tId) editingTransformId = null;
  }

  function updateTransform(tId: string, patch: Partial<TransformDef>) {
    planState.update((s) => {
      if (!s.document) return s;
      return { ...s, document: { ...s.document, transforms: s.document.transforms.map(t => t.id === tId ? { ...t, ...patch } : t) }, dirty: true };
    });
  }

  function updatePort(idx: number, patch: Partial<TransformPortBinding>) {
    const ports = [...newTransform.source_ports];
    if (idx >= 0 && idx < ports.length) ports[idx] = { ...ports[idx], ...patch };
    newTransform = { ...newTransform, source_ports: ports };
  }

  function addPort() {
    const n = newTransform.source_ports.length + 1;
    newTransform = { ...newTransform, source_ports: [...newTransform.source_ports, { port_key: `v${n}`, definition_id: "" }] };
  }

  function removePort(idx: number) {
    newTransform = { ...newTransform, source_ports: newTransform.source_ports.filter((_, i) => i !== idx) };
  }

  function updateTPort(tId: string, portKey: string, patch: Partial<TransformPortBinding>) {
    planState.update((s) => {
      if (!s.document) return s;
      return { ...s, document: { ...s.document, transforms: s.document.transforms.map(t => t.id === tId ? { ...t, source_ports: t.source_ports.map(p => p.port_key === portKey ? { ...p, ...patch } : p) } : t) }, dirty: true };
    });
  }

  function addTPort(tId: string) {
    planState.update((s) => {
      if (!s.document) return s;
      return { ...s, document: { ...s.document, transforms: s.document.transforms.map(t => t.id === tId ? { ...t, source_ports: [...t.source_ports, { port_key: `v${t.source_ports.length + 1}`, definition_id: "" }] } : t) }, dirty: true };
    });
  }

  function removeTPort(tId: string, portKey: string) {
    planState.update((s) => {
      if (!s.document) return s;
      return { ...s, document: { ...s.document, transforms: s.document.transforms.map(t => t.id === tId ? { ...t, source_ports: t.source_ports.filter(p => p.port_key !== portKey) } : t) }, dirty: true };
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== "Delete" || !$planState.selectedNodeId) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    delNode($planState.selectedNodeId); saveDoc(id, planApi.saveDocument);
  }

  function catLab(c: keyof PlanDefinitions) { return { input_conditions: "Input Conditions", collection_items: "Measurement Items", completion_criteria: "Completion Criteria", custom: "Custom" }[c]; }
  function tLab(t: string) { return { text: "Text", number: "Number", select: "Select", bool: "True/False", struct: "Struct" }[t] || t; }
  function metaHas(m: PlanFieldDef["meta"]): boolean { return !!(m && (m.options?.length || m.struct_type_id)); }

  function isDerivedDef(doc: PlanDocument | null, defId: string): boolean {
    if (!doc) return false;
    const all = [...doc.definitions.input_conditions, ...doc.definitions.collection_items, ...doc.definitions.completion_criteria, ...doc.definitions.custom];
    return all.find(d => d.id === defId)?.derived === true;
  }

  function buildMeta(): PlanFieldDef["meta"] {
    const meta: NonNullable<PlanFieldDef["meta"]> = {};
    let has = false;
    const isSelect = newDef.data_type === "select";
    if (isSelect && newDef.optionsText.trim()) {
      meta.options = newDef.optionsText.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
      has = true;
    }
    if (newDef.data_type === "struct" && structTypeId) {
      meta.struct_type_id = structTypeId;
      meta.struct_params = Object.keys(structParamValues).length > 0 ? { ...structParamValues } : {};
      has = true;
    }
    return has ? meta : null;
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
                  <div class="d-flex justify-content-between align-items-center mb-1"><small class="fw-bold text-muted">{catLab(cat)}</small><button class="btn btn-sm btn-link" onclick={() => { defCategory = cat; showDefForm = true; defTabExpanded[cat] = true; }}>+</button></div>
                  {#each doc.definitions[cat] as f (f.id)}
                    <div class="def-item"><div class="flex-grow-1"><span class="me-1">{f.name}</span><small class="text-muted">({tLab(f.data_type)}{f.meta?.struct_type_id ? ` · ${f.meta.struct_type_id}` : ""}{f.unit ? `, ${f.unit}` : ""}{f.meta?.options?.length ? `, ${f.meta.options.length}opts` : ""})</small>{#if f.meta?.struct_type_id}<br /><small class="text-muted">{JSON.stringify(f.meta.struct_params ?? {})}</small>{/if}{#if isDerivedDef(doc, f.id)}<br /><span class="badge bg-secondary">Computed</span>{/if}</div><button class="btn btn-sm btn-close-sm" onclick={() => removeDef(cat, f.id)}>&times;</button></div>
                  {/each}
                  {#if doc.definitions[cat].length === 0}<div class="text-muted" style="font-size:0.8rem">None</div>{/if}

                  {#if showDefForm && defCategory === cat}
                    <div class="card card-body mb-2 bg-light">
                      <div class="mb-2"><input class="form-control form-control-sm" placeholder="Name" bind:value={newDef.name} /></div>
                      <div class="mb-2">
                        <select class="form-select form-select-sm" bind:value={newDef.data_type}>
                          <option value="text">Text</option>
                          <option value="number">Number</option>
                          <option value="select">Select</option>
                          <option value="bool">True/False</option>
                          {#if cat === "custom"}
                            <option value="struct">Struct</option>
                          {/if}
                        </select>
                      </div>

                      {#if newDef.data_type === "struct" && cat === "custom"}
                        {@const allStructTypes = getAllStructTypes()}
                        <div class="mb-2">
                          <select class="form-select form-select-sm" bind:value={structTypeId} onchange={(e) => { structTypeId = (e.target as HTMLSelectElement).value; structParamValues = {}; }}>
                            <option value="">-- select struct type --</option>
                            {#each allStructTypes as st}
                              <option value={st.id}>{st.name}</option>
                            {/each}
                          </select>
                        </div>
                        {#if structTypeId}
                          {@const selStruct = allStructTypes.find(st => st.id === structTypeId)}
                          {#if selStruct?.params_schema}
                            <div class="mb-2">
                              <small class="fw-bold text-muted d-block">{selStruct.name} parameters</small>
                              {#each selStruct.params_schema as p (p.key)}
                                <div class="mb-1">
                                  <label class="form-label small mb-0">{p.label}</label>
                                  {#if p.type === "number"}
                                    <input type="number" class="form-control form-control-sm" value={structParamValues[p.key] ?? p.default ?? ""} oninput={(e) => { const v = (e.target as HTMLInputElement).value; structParamValues = { ...structParamValues, [p.key]: v !== "" ? parseNum(v) : undefined }; }} step="any" />
                                  {:else if p.type === "select" && p.options}
                                    <select class="form-select form-select-sm" value={String(structParamValues[p.key] ?? p.default ?? "")} onchange={(e) => { structParamValues = { ...structParamValues, [p.key]: (e.target as HTMLSelectElement).value }; }}>
                                      <option value="">--</option>
                                      {#each p.options as opt}<option value={opt}>{opt}</option>{/each}
                                    </select>
                                  {:else}
                                    <input type="text" class="form-control form-control-sm" value={structParamValues[p.key] ?? p.default ?? ""} oninput={(e) => { structParamValues = { ...structParamValues, [p.key]: (e.target as HTMLInputElement).value }; }} />
                                  {/if}
                                </div>
                              {/each}
                            </div>
                          {/if}
                        {/if}
                      {/if}

                      {#if newDef.data_type === "number"}
                        <div class="mb-2"><input class="form-control form-control-sm" placeholder="Unit" bind:value={newDef.unit} /></div>
                        <small class="text-muted d-block mb-2">Numeric shape (range / deviation / percentage / waveform) is set per binding, not on the definition.</small>
                      {/if}

                      {#if newDef.data_type === "select"}
                        <div class="mb-2"><textarea class="form-control form-control-sm" rows="2" placeholder="Options (one per line or comma-separated)" bind:value={newDef.optionsText}></textarea></div>
                      {/if}

                      <div><button class="btn btn-sm btn-primary me-1" onclick={addNewDef}>Add</button><button class="btn btn-sm btn-secondary" onclick={() => { showDefForm = false; structTypeId = ""; structParamValues = {}; }}>Cancel</button></div>
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
            {@const allInputDefs = [...doc.definitions.input_conditions, ...doc.definitions.custom]}
            {@const xformMethods = getTransformMethods()}
            <div class="p-2">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <small class="fw-bold text-muted">TRANSFORMS</small>
                <button class="btn btn-sm btn-link" onclick={() => { showTransformForm = true; }}>+</button>
              </div>

              {#if showTransformForm}
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
                    <small class="text-muted d-block mb-1">Inputs</small>
                    {#each xformMethods.filter(m => m.id === newTransform.method_id) as selMethod}
                      {#if selMethod.variadic}
                        {#each newTransform.source_ports as port, i (port.port_key)}
                          <div class="d-flex gap-1 mb-1">
                            <input class="form-control form-control-sm" style="max-width:90px" placeholder="var" value={port.port_key} oninput={(e) => { const v = (e.target as HTMLInputElement).value; updatePort(i, { port_key: v || `v${i+1}` }); }} />
                            <select class="form-select form-select-sm" value={port.definition_id} onchange={(e) => updatePort(i, { definition_id: (e.target as HTMLSelectElement).value })}>
                              <option value="">-- select definition --</option>
                              {#each allInputDefs as d (d.id)}
                                <option value={d.id}>{d.name}{d.unit ? ` (${d.unit})` : ""}{isDerivedDef(doc, d.id) ? " [computed]" : ""}</option>
                              {/each}
                            </select>
                            <button class="btn btn-sm btn-close-sm" onclick={() => removePort(i)}>&times;</button>
                          </div>
                        {/each}
                        <button class="btn btn-sm btn-outline-secondary" onclick={addPort}>+ variable</button>
                      {:else}
                        {#each selMethod.inputs as inp (inp.key)}
                          {@const port = newTransform.source_ports.find(p => p.port_key === inp.key)}
                          {@const idx = newTransform.source_ports.findIndex(p => p.port_key === inp.key)}
                          {@const bindDef = allInputDefs.find(d => d.id === port?.definition_id)}
                          <div class="mb-1">
                            <label class="form-label small mb-0">{inp.label} <small class="text-muted">({inp.kind}{inp.data_type ? ` ${inp.data_type}` : ""}{inp.struct_type_id ? `:${inp.struct_type_id}` : ""})</small></label>
                            {#if allInputDefs.length > 0}
                              <div class="d-flex gap-1">
                                <select class="form-select form-select-sm" value={port?.definition_id ?? ""} onchange={(e) => { const v = (e.target as HTMLSelectElement).value; if (idx >= 0) updatePort(idx, { definition_id: v }); else newTransform = { ...newTransform, source_ports: [...newTransform.source_ports, { port_key: inp.key, definition_id: v }] }; }}>
                                  <option value="">-- select --</option>
                                  {#each allInputDefs as d (d.id)}
                                    <option value={d.id}>{d.name}{d.unit ? ` (${d.unit})` : ""}{d.data_type === "struct" ? ` [${d.meta?.struct_type_id ?? "struct"}]` : ""}{isDerivedDef(doc, d.id) ? " [computed]" : ""}</option>
                                  {/each}
                                </select>
                                {#if inp.data_type === "number" && bindDef}
                                  <select class="form-select form-select-sm" style="max-width:130px" value={port?.sub_key ?? "value"} onchange={(e) => { const v = (e.target as HTMLSelectElement).value; if (idx >= 0) updatePort(idx, { sub_key: v }); }}>
                                    {#each outputKeys as ok (ok)}
                                      <option value={ok}>{ok}</option>
                                    {/each}
                                  </select>
                                {/if}
                              </div>
                            {:else}
                              <small class="text-muted d-block mt-1">No input definitions available. Add some in the Defs tab first.</small>
                            {/if}
                          </div>
                        {/each}
                      {/if}
                    {/each}
                  </div>
                  <div class="mb-2">
                    <small class="text-muted d-block mb-1">Output label &amp; bind</small>
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
                      <select class="form-select form-select-sm mt-1" bind:value={newTransform.derived_definition_id}>
                        <option value="">-- select field --</option>
                        {#each allInputDefs as d (d.id)}
                          <option value={d.id}>{d.name}{d.unit ? ` (${d.unit})` : ""}{d.derived ? " [computed]" : ""}</option>
                        {/each}
                      </select>
                    {/if}
                  </div>

                  {#each xformMethods.filter(m => m.id === newTransform.method_id) as selMethod}
                    <div class="mb-2"><small class="fw-bold text-muted">{selMethod.name} Parameters</small></div>
                    {#each selMethod.params_schema as p (p.key)}
                      <div class="mb-2">
                        <label class="form-label small mb-0">{p.label}</label>
                        {#if p.type === "text"}
                            <textarea class="form-control form-control-sm" rows="3" style="font-family:monospace;font-size:0.75rem" value={String(newTransform.params[p.key] ?? "")} oninput={(e) => { newTransform.params = { ...newTransform.params, [p.key]: (e.target as HTMLTextAreaElement).value }; }} placeholder={''}></textarea>
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

                  <div><button class="btn btn-sm btn-primary me-1" onclick={addTransform} disabled={!newTransform.name || (newTargetMode === "existing" && !newTransform.derived_definition_id) || (newTargetMode === "new" && !newTargetName)}>Add</button><button class="btn btn-sm btn-secondary" onclick={() => { showTransformForm = false; newTransform = { name: "", method_id: "formula", source_ports: [], derived_definition_id: "", params: {} }; newTargetMode = "new"; newTargetName = ""; newTargetUnit = ""; }}>Cancel</button></div>
                </div>
              {/if}

              {#each doc.transforms as t (t.id)}
                {@const bindDef = [...doc.definitions.input_conditions, ...doc.definitions.custom].find(d => d.id === t.derived_definition_id)}
                {@const isEditing = editingTransformId === t.id}
                {@const sourceNames = t.source_ports.map(p => { const d = allInputDefs.find(x => x.id === p.definition_id); return d ? `${d.name}${p.sub_key && p.sub_key !== "value" ? `.${p.sub_key}` : ""}` : p.port_key; }).join(", ") || "?"}
                {@const outputName = t.derived_name || bindDef?.name || "?"}
                <div class="def-item" onclick={() => editingTransformId = isEditing ? null : t.id} style="cursor:pointer">
                  <div class="flex-grow-1">
                    <div class="d-flex justify-content-between align-items-start">
                      <div>
                        <span>{t.name}</span>
                        <small class="text-muted d-block">{sourceNames} → {outputName}{t.derived_unit ? ` (${t.derived_unit})` : ""}</small>
                        <small class="text-muted d-block">on: {bindDef?.name || "?"} · method: {t.method_id}</small>
                      </div>
                      <button class="btn btn-sm btn-close-sm" onclick={(e) => { e.stopPropagation(); removeTransform(t.id); }}>&times;</button>
                    </div>
                  </div>
                </div>
                {#if isEditing}
                  {@const xformMethods = getTransformMethods()}
                  {@const selMethod = getTransformMethod(t.method_id)}
                  <div class="card card-body mb-2 bg-light" style="font-size:0.8rem">
                    <div class="mb-2"><input class="form-control form-control-sm" value={t.name} oninput={(e) => updateTransform(t.id, { name: (e.target as HTMLInputElement).value })} /></div>
                    <div class="mb-2">
                      <select class="form-select form-select-sm" value={t.method_id} onchange={(e) => updateTransform(t.id, { method_id: (e.target as HTMLSelectElement).value })}>
                        {#each xformMethods as m}
                          <option value={m.id}>{m.name}</option>
                        {/each}
                      </select>
                    </div>
                    <div class="mb-2">
                      <small class="text-muted d-block mb-1">Inputs</small>
                      {#if selMethod?.variadic}
                        {#each t.source_ports as port (port.port_key)}
                          <div class="d-flex gap-1 mb-1">
                            <input class="form-control form-control-sm" style="max-width:90px" value={port.port_key} oninput={(e) => updateTPort(t.id, port.port_key, { port_key: (e.target as HTMLInputElement).value || port.port_key })} />
                            <select class="form-select form-select-sm" value={port.definition_id} onchange={(e) => updateTPort(t.id, port.port_key, { definition_id: (e.target as HTMLSelectElement).value })}>
                              <option value="">-- select definition --</option>
                              {#each allInputDefs as d (d.id)}
                                <option value={d.id}>{d.name}{d.unit ? ` (${d.unit})` : ""}{isDerivedDef(doc, d.id) ? " [computed]" : ""}</option>
                              {/each}
                            </select>
                            <button class="btn btn-sm btn-close-sm" onclick={() => removeTPort(t.id, port.port_key)}>&times;</button>
                          </div>
                        {/each}
                        <button class="btn btn-sm btn-outline-secondary" onclick={() => addTPort(t.id)}>+ variable</button>
                      {:else}
                        {#each (selMethod?.inputs ?? []) as inp (inp.key)}
                          {@const port = t.source_ports.find(p => p.port_key === inp.key)}
                          {@const bindDef2 = allInputDefs.find(d => d.id === port?.definition_id)}
                          <div class="d-flex gap-1 mb-1 align-items-center">
                            <small class="text-muted" style="min-width:90px">{inp.label}</small>
                            <select class="form-select form-select-sm" value={port?.definition_id ?? ""} onchange={(e) => updateTPort(t.id, inp.key, { definition_id: (e.target as HTMLSelectElement).value })}>
                              <option value="">-- select --</option>
                              {#each allInputDefs as d (d.id)}
                                <option value={d.id}>{d.name}{d.data_type === "struct" ? ` [${d.meta?.struct_type_id ?? "struct"}]` : ""}{isDerivedDef(doc, d.id) ? " [computed]" : ""}</option>
                              {/each}
                            </select>
                            {#if inp.data_type === "number" && bindDef2}
                              <select class="form-select form-select-sm" style="max-width:130px" value={port?.sub_key ?? "value"} onchange={(e) => updateTPort(t.id, inp.key, { sub_key: (e.target as HTMLSelectElement).value })}>
                                {#each outputKeys as ok (ok)}
                                  <option value={ok}>{ok}</option>
                                {/each}
                              </select>
                            {/if}
                          </div>
                        {/each}
                      {/if}
                    </div>
                    <div class="mb-2">
                      <small class="text-muted d-block">Output: {t.derived_name} · on: {bindDef?.name || t.derived_definition_id.slice(0,8)}</small>
                    </div>
                    {#each xformMethods.filter(m => m.id === t.method_id) as selMethod}
                      <div class="mb-2"><small class="fw-bold text-muted">{selMethod.name} params</small></div>
                      {#each selMethod.params_schema as p (p.key)}
                        <div class="mb-2">
                          <label class="form-label small mb-0">{p.label}</label>
                          {#if p.type === "text"}
                            <textarea class="form-control form-control-sm" rows="2" style="font-family:monospace;font-size:0.7rem" value={String(t.params[p.key] ?? "")} oninput={(e) => { const newParams = { ...t.params, [p.key]: (e.target as HTMLTextAreaElement).value }; updateTransform(t.id, { params: newParams }); }}></textarea>
                          {:else if p.type === "number"}
                            <input type="number" class="form-control form-control-sm" value={t.params[p.key] ?? ""} oninput={(e) => { const v = (e.target as HTMLInputElement).value; const newParams = { ...t.params, [p.key]: v !== "" ? parseNum(v) : null }; updateTransform(t.id, { params: newParams }); }} />
                          {:else if p.type === "select" && p.options}
                            <select class="form-select form-select-sm" value={String(t.params[p.key] ?? "")} onchange={(e) => { const newParams = { ...t.params, [p.key]: (e.target as HTMLSelectElement).value }; updateTransform(t.id, { params: newParams }); }}>
                              {#each p.options as opt}<option value={opt}>{opt}</option>{/each}
                            </select>
                          {:else}
                            <input type="text" class="form-control form-control-sm" value={String(t.params[p.key] ?? "")} oninput={(e) => { const newParams = { ...t.params, [p.key]: (e.target as HTMLInputElement).value }; updateTransform(t.id, { params: newParams }); }} />
                          {/if}
                        </div>
                      {/each}
                    {/each}
                  </div>
                {/if}
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
  .modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.3);z-index:1040}
  .modal{z-index:1050}
</style>
