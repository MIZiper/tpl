<script lang="ts">
  import type { PlanNode, PlanDefinitions, PlanFieldDef, FieldBinding, TransformDef } from "../../types/plan";
  import { getValueTypes, getValueType, createBindingValue, type Value } from "../../lib/values";
  import { computeStepOutputs, parseNum, parseNumInt } from "../../lib/plan-utils";

  let {
    node,
    definitions = null,
    transforms = [],
    onupdate = (_patch: Partial<PlanNode>) => {},
  }: {
    node: PlanNode;
    definitions: PlanDefinitions | null;
    transforms: TransformDef[];
    onupdate: (patch: Partial<PlanNode>) => void;
  } = $props();

  function defField(fieldId: string): PlanFieldDef | null {
    if (!definitions) return null;
    for (const cat of ["input_conditions", "collection_items", "completion_criteria", "custom"] as const) {
      const d = definitions[cat].find((f) => f.id === fieldId);
      if (d) return d;
    }
    return null;
  }

  function isDerivedDef(defId: string): boolean {
    return defField(defId)?.derived === true;
  }

  function producersOf(defId: string): TransformDef[] {
    return transforms.filter((t) => t.derivedDefId === defId);
  }

  const stepValues = $derived.by(() => {
    const map: Record<string, Value> = {};
    if (!definitions) return map;
    for (const b of [...node.input_conditions, ...node.collection_items]) {
      map[b.definition_id] = createBindingValue(b, defField(b.definition_id) ?? undefined);
    }
    return map;
  });

  const liveOutputs = $derived.by(() => {
    if (!definitions || !transforms.length) return { byTransform: {} as Record<string, Value>, byDef: {} as Record<string, Value> };
    return computeStepOutputs(transforms, definitions, stepValues);
  });

  function bindingsForCategory(cat: keyof PlanDefinitions): FieldBinding[] {
    const map: Record<string, FieldBinding[]> = {
      input_conditions: node.input_conditions,
      collection_items: node.collection_items,
      completion_criteria: node.completion_criteria,
      custom: node.input_conditions.filter((ic) => {
        if (!definitions) return false;
        return definitions.custom.some((f) => f.id === ic.definition_id) &&
          !definitions.input_conditions.some((f) => f.id === ic.definition_id);
      }),
    };
    return map[cat] ?? [];
  }

  function updateBinding(cat: "input_conditions" | "collection_items" | "completion_criteria", defId: string, patch: Partial<FieldBinding>) {
    const key = cat;
    const list = [...node[key]];
    const idx = list.findIndex((b) => b.definition_id === defId);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...patch };
    }
    onupdate({ [key]: list });
  }

  function setValueType(binding: FieldBinding, cat: "input_conditions" | "collection_items" | "completion_criteria", valueTypeId: string) {
    if (!valueTypeId) {
      updateBinding(cat, binding.definition_id, { valueTypeId: undefined, params: undefined });
    } else {
      updateBinding(cat, binding.definition_id, { valueTypeId, params: {} });
    }
  }

  function updateValueParams(binding: FieldBinding, cat: "input_conditions" | "collection_items" | "completion_criteria", key: string, value: unknown) {
    const params = { ...(binding.params ?? {}) };
    if (value === null || value === undefined || value === "") {
      delete params[key];
    } else {
      params[key] = value;
    }
    updateBinding(cat, binding.definition_id, { params });
  }

  function addBinding(cat: "input_conditions" | "collection_items" | "completion_criteria", defId: string) {
    onupdate({ [cat]: [...node[cat], { definition_id: defId, value: null }] });
  }

  function removeBinding(cat: "input_conditions" | "collection_items" | "completion_criteria", defId: string) {
    onupdate({ [cat]: node[cat].filter((b) => b.definition_id !== defId) });
  }

  function categoryLabel(cat: keyof PlanDefinitions): string {
    const map: Record<string, string> = {
      input_conditions: "Input Conditions",
      collection_items: "Measurement Items",
      completion_criteria: "Completion Criteria",
      custom: "Custom",
    };
    return map[cat] || cat;
  }

  function defSummary(f: PlanFieldDef): string {
    if (f.typeId === "bool") return "Pass / Fail";
    if (f.typeId === "select") return `Options: ${((f.params.options as string[] | undefined) ?? []).join(", ") || "—"}`;
    if (f.typeId === "number") return `Number${f.unit ? ` (${f.unit})` : ""}`;
    if (f.typeId === "struct") return `Struct: ${String(f.params.structTypeId ?? "?")}`;
    if (f.typeId === "text") return "Text";
    return f.typeId;
  }

  const valueTypes = $derived(getValueTypes());
  const valueTypeOptions = $derived(valueTypes.filter((v) => v.typeId !== "plain" && v.typeId !== "struct"));
</script>

<div class="step-editor">
  <div class="step-editor-header">
    <h5 class="mb-0">{node.title}</h5>
    <span class="badge bg-secondary text-capitalize">{node.type}</span>
  </div>

  <div class="step-editor-body">
    <!-- Basic Info -->
    <div class="mb-3">
      <label class="form-label fw-bold small">Title</label>
      <input
        type="text"
        class="form-control form-control-sm"
        value={node.title}
        oninput={(e) => onupdate({ title: (e.target as HTMLInputElement).value })}
      />
    </div>

    <div class="mb-3">
      <label class="form-label fw-bold small">Description</label>
      <textarea
        class="form-control form-control-sm"
        rows="2"
        value={node.description ?? ""}
        oninput={(e) => onupdate({ description: (e.target as HTMLTextAreaElement).value || null })}
      ></textarea>
    </div>

    <div class="mb-3">
      <label class="form-label fw-bold small">Required Executions</label>
      <input
        type="number"
        class="form-control form-control-sm"
        min="1"
        value={node.required_executions}
        oninput={(e) => onupdate({ required_executions: parseNumInt((e.target as HTMLInputElement).value, 1) })}
      />
    </div>

    {#if node.type === "step"}
    <div class="row mb-3">
      <div class="col-6">
        <label class="form-label fw-bold small">Duration (min)</label>
        <input
          type="number"
          class="form-control form-control-sm"
          value={node.duration_minutes}
          oninput={(e) => onupdate({ duration_minutes: parseNumInt((e.target as HTMLInputElement).value, 0) })}
        />
      </div>
      <div class="col-6">
        <label class="form-label fw-bold small">Changeover (min)</label>
        <input
          type="number"
          class="form-control form-control-sm"
          value={node.changeover_minutes}
          oninput={(e) => onupdate({ changeover_minutes: parseNumInt((e.target as HTMLInputElement).value, 0) })}
        />
      </div>
    </div>

    <div class="mb-3">
      <label class="form-label fw-bold small">Total: {node.duration_minutes + node.changeover_minutes} min</label>
    </div>
    {/if}

    {#if node.type === "step"}
    <!-- Bindings per category -->
    <div class="mb-3">
      <span class="fw-bold small d-block mb-2">Field Bindings</span>

      {#if definitions}
        {#each (["input_conditions", "collection_items", "completion_criteria"] as const) as cat}
          {@const orphaned = node[cat].filter(b => !definitions[cat].find(f => f.id === b.definition_id))}
          {#if definitions[cat].length > 0 || orphaned.length > 0}
            <div class="mb-3">
              <div class="binding-category">{categoryLabel(cat)}</div>
              {#each definitions[cat] as f (f.id)}
                {@const binding = node[cat].find(b => b.definition_id === f.id)}
                {#if binding}
                  {@const vt = binding.valueTypeId ? getValueType(binding.valueTypeId) : undefined}
                  {@const isDerived = isDerivedDef(f.id)}
                  {@const producers = producersOf(f.id)}
                  <div class="binding-item active">
                    <div class="d-flex align-items-center justify-content-between">
                      <div class="d-flex align-items-center">
                        <span class="binding-name">{f.name}</span>
                        {#if f.unit}<small class="text-muted ms-1">({f.unit})</small>{/if}
                        {#if vt}<span class="badge bg-info ms-1">{vt.displayName}</span>{/if}
                        {#if isDerived}<span class="badge bg-secondary ms-1">Computed</span>{/if}
                      </div>
                      <button class="btn btn-sm btn-close-sm" onclick={() => removeBinding(cat, f.id)} title="Remove binding">&times;</button>
                    </div>
                    {#if cat === "input_conditions"}
                      <div class="binding-value mt-1">
                        {#if isDerived}
                          <div class="text-muted small mb-1">
                            Computed via {producers.map(t => t.name).join(", ")}
                            {#if liveOutputs.byDef[f.id]}
                              <span class="ms-1 fw-bold">= {liveOutputs.byDef[f.id].display()}</span>
                            {/if}
                          </div>
                        {:else if f.typeId === "bool"}
                          <select class="form-select form-select-sm" value={String(binding.value ?? "")} onchange={(e) => { const v = (e.target as HTMLSelectElement).value; updateBinding(cat, f.id, { value: v === "true" ? true : v === "false" ? false : null }); }}>
                            <option value="">--</option>
                            <option value="true">Pass / True</option>
                            <option value="false">Fail / False</option>
                          </select>
                        {:else if f.typeId === "select" && (f.params.options as string[] | undefined)?.length}
                          <select class="form-select form-select-sm" value={String(binding.value ?? "")} onchange={(e) => { const v = (e.target as HTMLSelectElement).value; updateBinding(cat, f.id, { value: v || null }); }}>
                            <option value="">--</option>
                            {#each (f.params.options as string[]) as opt}
                              <option value={opt}>{opt}</option>
                            {/each}
                          </select>
                        {:else if f.typeId === "struct"}
                          {@const structTypeId = String(f.params.structTypeId ?? "?")}
                          <div class="text-muted small">
                            {structTypeId}
                            {#if binding.valueTypeId}
                              {#each Object.entries(f.params).filter(([k]) => k !== "structTypeId") as [k, v]}
                                <span class="ms-2">{k}: {String(v)}</span>
                              {/each}
                            {/if}
                          </div>
                        {:else}
                          <!-- number / text value editor -->
                          <div class="d-flex gap-1 align-items-center mb-1">
                            {#if f.typeId === "number"}
                              <select class="form-select form-select-sm" style="max-width:150px" value={binding.valueTypeId ?? ""} onchange={(e) => setValueType(binding, cat, (e.target as HTMLSelectElement).value)}>
                                <option value="">Plain</option>
                                {#each valueTypeOptions as v (v.typeId)}
                                  <option value={v.typeId}>{v.displayName}</option>
                                {/each}
                              </select>
                              {#if vt}
                                <small class="text-muted text-nowrap">{createBindingValue(binding, f).describe()}</small>
                              {/if}
                            {/if}
                          </div>
                          {#if f.typeId === "number" && vt}
                            {#if vt.paramsSchema.length > 0}
                              <div class="dynamic-params-grid">
                                {#each vt.paramsSchema as p (p.key)}
                                  <div class="dynamic-param-row">
                                    <label class="small mb-0">{p.label}</label>
                                    {#if p.type === "select" && p.options}
                                      <select class="form-select form-select-sm" value={String(binding.params?.[p.key] ?? p.default ?? "")} onchange={(e) => { const v = (e.target as HTMLSelectElement).value; updateValueParams(binding, cat, p.key, v || null); }}>
                                        {#each p.options as opt}<option value={opt}>{opt}</option>{/each}
                                      </select>
                                    {:else}
                                      <input type="number" class="form-control form-control-sm" step="any" value={binding.params?.[p.key] ?? p.default ?? ""} oninput={(e) => { const v = (e.target as HTMLInputElement).value; updateValueParams(binding, cat, p.key, v !== "" ? parseNum(v) : null); }} />
                                    {/if}
                                  </div>
                                {/each}
                              </div>
                            {:else}
                              <input type="number" class="form-control form-control-sm" value={binding.value ?? ""} oninput={(e) => { const v = (e.target as HTMLInputElement).value; updateBinding(cat, f.id, { value: v !== "" ? parseNum(v) : null }); }} placeholder="Value" />
                            {/if}
                          {:else if f.typeId === "number"}
                            <input type="number" class="form-control form-control-sm" value={binding.value ?? ""} oninput={(e) => { const v = (e.target as HTMLInputElement).value; updateBinding(cat, f.id, { value: v !== "" ? parseNum(v) : null }); }} placeholder="Value" />
                          {:else}
                            <input type="text" class="form-control form-control-sm" value={binding.value ?? ""} oninput={(e) => { const v = (e.target as HTMLInputElement).value; updateBinding(cat, f.id, { value: v || null }); }} placeholder="Value" />
                          {/if}
                        {/if}

                        <!-- Transforms that produce this field (readouts) -->
                        {#if producers.length > 0 && !isDerived}
                          <div class="derived-outputs mt-1">
                            {#each producers as xf (xf.id)}
                              {@const out = liveOutputs.byTransform[xf.id]}
                              <div class="derived-output-item">
                                <span class="derived-output-name">{xf.derived.name || xf.name}</span>
                                {#if out}
                                  <span class="derived-output-value">{out.display()}</span>
                                {:else}
                                  <span class="derived-output-value text-muted">—</span>
                                {/if}
                              </div>
                            {/each}
                          </div>
                        {/if}
                      </div>
                    {:else}
                      <div class="binding-value mt-1">
                        <small class="text-muted">{defSummary(f)}</small>
                      </div>
                    {/if}
                  </div>
                {/if}
              {/each}
              {#if definitions[cat].some(f => !node[cat].find(b => b.definition_id === f.id))}
                <div class="add-binding-area">
                  {#each definitions[cat] as f (f.id)}
                    {#if !node[cat].find(b => b.definition_id === f.id)}
                      <button class="add-binding-btn" onclick={() => addBinding(cat, f.id)}>+ {f.name}{#if f.unit}<small class="text-muted"> ({f.unit})</small>{/if}</button>
                    {/if}
                  {/each}
                </div>
              {/if}
              {#each orphaned as binding (binding.definition_id)}
                <div class="binding-item orphaned">
                  <div class="d-flex align-items-center justify-content-between">
                    <span class="orphaned-label">[deleted] {binding.definition_id.slice(0, 8)}...</span>
                    <button class="btn btn-sm btn-close-sm" onclick={() => removeBinding(cat, binding.definition_id)}>&times;</button>
                  </div>
                  {#if cat === "input_conditions"}
                  <div class="binding-value mt-1">
                    <input type="text" class="form-control form-control-sm" value={String(binding.value ?? "")} oninput={(e) => { const v = (e.target as HTMLInputElement).value; updateBinding(cat, binding.definition_id, { value: v || null }); }} />
                  </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        {/each}
      {/if}
    </div>

    <!-- System Config -->
    <div class="mb-3">
      <label class="form-label fw-bold small">System Config (JSON)</label>
      <textarea
        class="form-control form-control-sm"
        rows="4"
        style="font-family:monospace; font-size:0.75rem"
        value={node.system_config ? JSON.stringify(node.system_config, null, 2) : ""}
        oninput={(e) => {
          const raw = (e.target as HTMLTextAreaElement).value;
          try {
            const parsed = raw.trim() ? JSON.parse(raw) : null;
            onupdate({ system_config: parsed });
          } catch { /* ignore invalid JSON while typing */ }
        }}
      ></textarea>
    </div>
    {/if}

    {#if node.step_template_id}
      <div class="small text-muted mb-2">From template: {node.step_template_id}</div>
    {/if}
    {#if node.solution_step_id}
      <div class="small text-muted mb-2">Source solution step: {node.solution_step_id}</div>
    {/if}
  </div>
</div>

<style>
  .step-editor {
    height: 100%;
  }
  .step-editor-header {
    padding: 12px;
    border-bottom: 1px solid #dee2e6;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #fff;
  }
  .step-editor-body {
    padding: 12px;
  }
  .binding-category {
    font-size: 0.75rem;
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
    margin-top: 4px;
    margin-bottom: 4px;
    padding-bottom: 2px;
    border-bottom: 1px solid #eee;
  }
  .binding-item {
    padding: 6px 8px;
    background: #fff;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    margin-bottom: 3px;
  }
  .binding-item.active {
    border-color: #0d6efd;
    background: #f8f9ff;
  }
  .binding-item.orphaned {
    border-color: #ffc107;
    background: #fff9e6;
  }
  .orphaned-label {
    font-size: 0.8rem;
    font-weight: 500;
    color: #664d03;
  }
  .binding-name {
    font-size: 0.8rem;
    font-weight: 500;
  }
  .add-binding-area {
    padding: 4px 0;
  }
  .add-binding-btn {
    display: block;
    width: 100%;
    text-align: left;
    padding: 3px 8px;
    border: none;
    background: none;
    font-size: 0.8rem;
    color: #0d6efd;
    cursor: pointer;
    border-radius: 3px;
  }
  .add-binding-btn:hover {
    background: #e8f0fe;
  }
  .dynamic-params-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .dynamic-param-row {
    flex: 1;
    min-width: 80px;
  }
  .dynamic-param-row label {
    font-size: 0.68rem;
    color: #555;
    display: block;
  }
  .derived-outputs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .derived-output-item {
    padding: 2px 6px;
    background: #f0f0ff;
    border: 1px solid #c8c8e4;
    border-radius: 3px;
    font-size: 0.7rem;
  }
  .derived-output-name {
    color: #6f42c1;
    font-weight: 500;
    margin-right: 4px;
  }
</style>
