<script lang="ts">
  import type { PlanNode, PlanDefinitions, PlanFieldDef, FieldBinding, TransformDef } from "../../types/plan";
  import type { ExecutionReading } from "../../types/execution";
  import { formatDynamic, getDynamicTypes } from "../../lib/dynamic-registry";
  import { parseNum, parseNumInt, computeDerivedValues } from "../../lib/plan-utils";

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

  function defName(fieldId: string): string {
    if (!definitions) return fieldId;
    for (const cat of ["input_conditions", "collection_items", "completion_criteria", "custom"] as const) {
      const d = definitions[cat].find((f) => f.id === fieldId);
      if (d) return d.name;
    }
    return fieldId;
  }

  function defField(fieldId: string): PlanFieldDef | null {
    if (!definitions) return null;
    for (const cat of ["input_conditions", "collection_items", "completion_criteria", "custom"] as const) {
      const d = definitions[cat].find((f) => f.id === fieldId);
      if (d) return d;
    }
    return null;
  }

  function isDerivedDef(defId: string): boolean {
    const f = defField(defId);
    return f?.derived === true;
  }

  function xformsForDef(defId: string): TransformDef[] {
    return transforms.filter((t) => t.derived_definition_id === defId);
  }
  
  const liveXformValues = $derived.by(() => {
    if (!definitions || !transforms.length) return { byTfId: {} as Record<string, number | null>, byDefId: {} as Record<string, number | null> };
    const readings: ExecutionReading[] = [
      ...node.input_conditions.map(b => ({ definition_id: b.definition_id, definition_name: '', value: b.value })),
      ...node.collection_items.map(b => ({ definition_id: b.definition_id, definition_name: '', value: b.value })),
    ];
    const derived = computeDerivedValues(transforms, readings, definitions);
    const byTfId: Record<string, number | null> = {};
    const byDefId: Record<string, number | null> = {};
    const tfMap = new Map(transforms.map(tf => [tf.id, tf.derived_definition_id]));
    for (const d of derived) {
      byTfId[d.definition_id] = d.value as number | null;
      const defId = tfMap.get(d.definition_id);
      if (defId) byDefId[defId] = d.value as number | null;
    }
    return { byTfId, byDefId };
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
    if (f.data_type === "bool") return "Pass / Fail";
    if (f.data_type === "select") return `Options: ${(f.meta?.options ?? []).join(", ") || "—"}`;
    if (f.data_type === "number") {
      const parts: string[] = [];
      if (f.unit) parts.push(f.unit);
      if (f.meta?.tolerance_plus != null) parts.push(`±${f.meta.tolerance_plus}`);
      if (f.meta?.reference_value != null) parts.push(`ref: ${f.meta.reference_value}`);
      if (f.meta?.start != null) parts.push(`[${f.meta.start}→${f.meta.stop}]`);
      return `Number${parts.length ? ` (${parts.join(", ")})` : ""}`;
    }
    if (f.data_type === "struct") return `Struct: ${f.meta?.struct_type_id ?? "?"}`;
    if (f.data_type === "text") return "Text";
    return f.data_type;
  }

  function addBinding(cat: "input_conditions" | "collection_items" | "completion_criteria", defId: string) {
    onupdate({ [cat]: [...node[cat], { definition_id: defId, value: null }] });
  }

  function removeBinding(cat: "input_conditions" | "collection_items" | "completion_criteria", defId: string) {
    onupdate({ [cat]: node[cat].filter((b) => b.definition_id !== defId) });
  }

  const dynTypes = $derived(getDynamicTypes());

  function updateDynamicParams(binding: FieldBinding, cat: "input_conditions" | "collection_items" | "completion_criteria", key: string, value: unknown) {
    const params = { ...(binding.dynamic_params ?? {}) };
    if (value === null || value === undefined || value === "") {
      delete params[key];
    } else {
      params[key] = value;
    }
    updateBinding(cat, binding.definition_id, { dynamic_params: params });
  }
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
                  {@const isDynamic = !!binding.dynamic_type}
                  {@const derivedXforms = xformsForDef(f.id)}
                  {@const isDerived = isDerivedDef(f.id)}
                  {@const hasReadouts = derivedXforms.length > 0 && !isDerived}
                  <div class="binding-item active">
                    <div class="d-flex align-items-center justify-content-between">
                      <div class="d-flex align-items-center">
                        <span class="binding-name">{f.name}</span>
                        {#if f.unit}<small class="text-muted ms-1">({f.unit})</small>{/if}
                        {#if isDynamic}<span class="badge bg-info ms-1">Dynamic</span>{/if}
                        {#if isDerived}<span class="badge bg-secondary ms-1">Computed</span>{/if}
                      </div>
                      <button class="btn btn-sm btn-close-sm" onclick={() => removeBinding(cat, f.id)} title="Remove binding">&times;</button>
                    </div>
                    {#if cat === "input_conditions"}
                      <div class="binding-value mt-1">
                        {#if isDerived && binding.value == null && !isDynamic}
                          <div class="text-muted small mb-1">
                            Computed via {derivedXforms.map(t => t.derived_name || defName(t.derived_definition_id)).join(", ")}
                            {#if liveXformValues.byDefId[f.id] != null}
                              <span class="ms-1 fw-bold">= {liveXformValues.byDefId[f.id]}</span>
                            {/if}
                          </div>
                        {:else if f.data_type === "bool"}
                          <select class="form-select form-select-sm" value={String(binding.value ?? "")} onchange={(e) => { const v = (e.target as HTMLSelectElement).value; updateBinding(cat, f.id, { value: v === "true" ? true : v === "false" ? false : null }); }}>
                            <option value="">--</option>
                            <option value="true">Pass / True</option>
                            <option value="false">Fail / False</option>
                          </select>
                        {:else if f.data_type === "select" && f.meta?.options}
                          <select class="form-select form-select-sm" value={String(binding.value ?? "")} onchange={(e) => { const v = (e.target as HTMLSelectElement).value; updateBinding(cat, f.id, { value: v || null }); }}>
                            <option value="">--</option>
                            {#each f.meta.options as opt}
                              <option value={opt}>{opt}</option>
                            {/each}
                          </select>
                        {:else if f.data_type === "number"}
                          <div class="d-flex gap-1 align-items-center">
                            <input type="number" class="form-control form-control-sm" value={binding.value ?? ""} oninput={(e) => { const v = (e.target as HTMLInputElement).value; updateBinding(cat, f.id, { value: v !== "" ? parseNum(v) : null }); }} placeholder="Value" />
                            {#if f.meta?.tolerance_plus != null}<small class="text-muted text-nowrap">±{f.meta.tolerance_plus}{f.meta.tolerance_minus != null ? `/${f.meta.tolerance_minus}` : ""}{f.unit ? ` ${f.unit}` : ""}</small>{/if}
                            {#if f.meta?.reference_value != null}<small class="text-muted text-nowrap">ref: {f.meta.reference_value}{f.unit ? ` ${f.unit}` : ""}</small>{/if}
                            {#if f.meta?.start != null}<small class="text-muted text-nowrap">{f.meta.start}→{f.meta.stop} step {f.meta.step}{f.unit ? ` ${f.unit}` : ""}</small>{/if}
                            <button class="btn btn-sm btn-outline-info" class:active={isDynamic} onclick={() => {
                              if (isDynamic) {
                                updateBinding(cat, f.id, { dynamic_type: undefined, dynamic_params: undefined });
                              } else {
                                updateBinding(cat, f.id, { dynamic_type: "constant", dynamic_params: {} });
                              }
                            }} title="Toggle dynamic input">Dyn</button>
                          </div>
                        {:else}
                          <div class="d-flex gap-1">
                            <input type="text" class="form-control form-control-sm" value={binding.value ?? ""} oninput={(e) => { const v = (e.target as HTMLInputElement).value; updateBinding(cat, f.id, { value: v || null }); }} placeholder="Value" />
                            <button class="btn btn-sm btn-outline-info" class:active={isDynamic} onclick={() => {
                              if (isDynamic) {
                                updateBinding(cat, f.id, { dynamic_type: undefined, dynamic_params: undefined });
                              } else {
                                updateBinding(cat, f.id, { dynamic_type: "constant", dynamic_params: {} });
                              }
                            }} title="Toggle dynamic input">Dyn</button>
                          </div>
                        {/if}

                        <!-- Dynamic config panel -->
                        {#if isDynamic}
                          <div class="dynamic-config mt-2">
                            <select class="form-select form-select-sm mb-1" value={binding.dynamic_type ?? "constant"} onchange={(e) => {
                              const dt = (e.target as HTMLSelectElement).value;
                              updateBinding(cat, f.id, { dynamic_type: dt });
                            }}>
                              <option value="constant">Constant (no params)</option>
                              {#each dynTypes.filter(d => d.id !== "constant") as dt}
                                <option value={dt.id}>{dt.name}</option>
                              {/each}
                            </select>
                            {#if binding.dynamic_type && binding.dynamic_type !== "constant"}
                              {@const selectedDyn = dynTypes.find(d => d.id === binding.dynamic_type)}
                              {#if selectedDyn?.params_schema && selectedDyn.params_schema.length > 0}
                                <div class="dynamic-params-grid">
                                  {#each selectedDyn.params_schema as p (p.key)}
                                    <div class="dynamic-param-row">
                                      <label class="small mb-0">{p.label}</label>
                                      {#if p.type === "number"}
                                        <input type="number" class="form-control form-control-sm" value={binding.dynamic_params?.[p.key] ?? p.default ?? ""} oninput={(e) => { const v = (e.target as HTMLInputElement).value; updateDynamicParams(binding, cat, p.key, v !== "" ? parseNum(v) : null); }} step="any" />
                                      {:else if p.type === "select" && p.options}
                                        <select class="form-select form-select-sm" value={String(binding.dynamic_params?.[p.key] ?? p.default ?? "")} onchange={(e) => { const v = (e.target as HTMLSelectElement).value; updateDynamicParams(binding, cat, p.key, v || null); }}>
                                          {#each p.options as opt}<option value={opt}>{opt}</option>{/each}
                                        </select>
                        {:else if f.data_type === "struct"}
                          <div class="text-muted small">
                            {f.meta?.struct_type_id ?? "?"}
                            {#if f.meta?.struct_params}
                              {@const entries = Object.entries(f.meta.struct_params as Record<string, unknown>)}
                              {#if entries.length > 0}
                                ({entries.map(([k, v]) => `${k}: ${v}`).join(", ")})
                              {/if}
                            {/if}
                          </div>
                        {:else}
                                        <input type="text" class="form-control form-control-sm" value={binding.dynamic_params?.[p.key] ?? p.default ?? ""} oninput={(e) => { const v = (e.target as HTMLInputElement).value; updateDynamicParams(binding, cat, p.key, v || null); }} />
                                      {/if}
                                    </div>
                                  {/each}
                                </div>
                              {/if}
                              <small class="text-muted d-block mt-1">{formatDynamic(binding.dynamic_type, binding.dynamic_params ?? {})}</small>
                            {/if}
                          </div>
                        {/if}

                        <!-- Derived transforms (auto-computed outputs) -->
                        {#if hasReadouts}
                          <div class="derived-outputs mt-1">
                            {#each derivedXforms as xf (xf.id)}
                              {@const val = liveXformValues.byTfId[xf.id]}
                              <div class="derived-output-item">
                                <span class="derived-output-name">{xf.derived_name || defName(xf.derived_definition_id)}</span>
                                {#if val != null}
                                  <span class="derived-output-value">{val}{xf.derived_unit ? ` ${xf.derived_unit}` : ""}</span>
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
                    <input type="text" class="form-control form-control-sm" value={binding.value ?? ""} oninput={(e) => { const v = (e.target as HTMLInputElement).value; updateBinding(cat, binding.definition_id, { value: v || null }); }} />
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
  .binding-value {
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
  .dynamic-config {
    padding: 6px;
    background: #f0f7ff;
    border: 1px solid #bcd4ef;
    border-radius: 4px;
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
</style>
