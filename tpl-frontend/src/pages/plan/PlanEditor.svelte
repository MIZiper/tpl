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
  import type { PlanNode, PlanFieldDef, PlanDefinitions } from "../../types/plan";
  import PlanCanvas from "./PlanCanvas.svelte";
  import PlanStepEditor from "./PlanStepEditor.svelte";

  let id: string = $derived(route.params.id ?? "");

  let leftTab = $state<"tree" | "definitions" | "templates">("tree");
  let contextMenu = $state<{ x: number; y: number; nodeId: string | null; parentId: string | null; index: number } | null>(null);
  let showInitModal = $state(false);
  let showDefForm = $state(false);
  let defCategory: keyof PlanDefinitions = $state<keyof PlanDefinitions>("input_conditions");
  let newDef = $state({ name: "", field_type: "text", unit: null as string | null, default_value: null as any, optionsText: "" });
  let newTemplateName = $state("");

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
    addDef(defCategory, { name: newDef.name, field_type: newDef.field_type, unit: newDef.unit, default_value: newDef.default_value, options });
    newDef = { name: "", field_type: "text", unit: null, default_value: null, optionsText: "" };
    showDefForm = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== "Delete" || !$planState.selectedNodeId) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    delNode($planState.selectedNodeId); saveDoc(id, planApi.saveDocument);
  }

  function catLab(c: keyof PlanDefinitions) { return { input_conditions: "Input Conditions", collection_items: "Measurement Items", completion_criteria: "Completion Criteria", custom: "Custom" }[c]; }
  function tLab(t: string) { return { text: "Text", number: "Number", boolean: "Boolean", pass_fail: "Pass/Fail", threshold: "Threshold", measurement: "Measurement", select: "Select" }[t] || t; }
  function hasC(d: PlanDocument | null) { return !!(d && (d.root.length > 0 || d.definitions.input_conditions.length > 0 || d.templates.length > 0)); }
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
                    <div class="def-item"><span class="me-1">{f.name}</span><small class="text-muted">({tLab(f.field_type)}{f.unit ? `, ${f.unit}` : ""}{f.options?.length ? `, ${f.options.length}opts` : ""})</small><button class="btn btn-sm btn-close-sm" onclick={() => removeDef(cat, f.id)}>&times;</button></div>
                  {/each}
                  {#if doc.definitions[cat].length === 0}<div class="text-muted" style="font-size:0.8rem">None</div>{/if}
                </div>
              {/each}
              {#if showDefForm}
                <div class="card card-body mb-2 bg-light">
                  <div class="mb-2"><input class="form-control form-control-sm" placeholder="Name" bind:value={newDef.name} /></div>
                  <div class="mb-2"><select class="form-select form-select-sm" bind:value={newDef.field_type}><option value="text">Text</option><option value="number">Number</option><option value="boolean">Boolean</option><option value="pass_fail">Pass/Fail</option><option value="threshold">Threshold</option><option value="measurement">Measurement</option><option value="select">Select</option></select></div>
                  <div class="mb-2"><input class="form-control form-control-sm" placeholder="Unit" bind:value={newDef.unit} /></div>
                  {#if newDef.field_type === "select"}
                    <div class="mb-2"><textarea class="form-control form-control-sm" rows="2" placeholder="Options (one per line or comma-separated)" bind:value={newDef.optionsText}></textarea></div>
                  {/if}
                  <div><button class="btn btn-sm btn-primary me-1" onclick={addNewDef}>Add</button><button class="btn btn-sm btn-secondary" onclick={() => (showDefForm = false)}>Cancel</button></div>
                </div>
              {/if}
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
