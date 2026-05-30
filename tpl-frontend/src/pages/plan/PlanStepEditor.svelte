<script lang="ts">
  import type { PlanNode, PlanDefinitions, FieldBinding } from "../../types/plan";

  let {
    node,
    definitions = null,
    onupdate = (_patch: Partial<PlanNode>) => {},
    onbindsync = () => {},
  }: {
    node: PlanNode;
    definitions: PlanDefinitions | null;
    onupdate: (patch: Partial<PlanNode>) => void;
    onbindsync: () => void;
  } = $props();

  function defName(fieldId: string): string {
    if (!definitions) return fieldId;
    for (const cat of ["input_conditions", "collection_items", "completion_criteria", "custom"] as const) {
      const d = definitions[cat].find((f) => f.id === fieldId);
      if (d) return d.name;
    }
    return fieldId;
  }

  function defField(fieldId: string) {
    if (!definitions) return null;
    for (const cat of ["input_conditions", "collection_items", "completion_criteria", "custom"] as const) {
      const d = definitions[cat].find((f) => f.id === fieldId);
      if (d) return d;
    }
    return null;
  }

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
        oninput={(e) => onupdate({ required_executions: parseInt((e.target as HTMLInputElement).value) || 1 })}
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
          oninput={(e) => onupdate({ duration_minutes: parseInt((e.target as HTMLInputElement).value) || 0 })}
        />
      </div>
      <div class="col-6">
        <label class="form-label fw-bold small">Changeover (min)</label>
        <input
          type="number"
          class="form-control form-control-sm"
          value={node.changeover_minutes}
          oninput={(e) => onupdate({ changeover_minutes: parseInt((e.target as HTMLInputElement).value) || 0 })}
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
      <div class="d-flex justify-content-between align-items-center mb-1">
        <span class="fw-bold small">Field Bindings</span>
        <button class="btn btn-sm btn-outline-secondary" onclick={onbindsync} title="Sync from definitions">
          Sync
        </button>
      </div>

      {#if definitions}
        {#each (["input_conditions", "collection_items", "completion_criteria"] as const) as cat}
          {#if definitions[cat].length > 0}
            <div class="mb-3">
              <div class="binding-category">{categoryLabel(cat)}</div>
              {#each definitions[cat] as f (f.id)}
                {#if node.type === "step" || cat === "input_conditions"}
                  {@const binding = node[cat].find(b => b.definition_id === f.id)}
                  {#if binding}
                    <div class="binding-item">
                      <div class="d-flex align-items-center">
                        <span class="binding-name">{f.name}</span>
                        {#if f.unit}
                          <small class="text-muted ms-1">({f.unit})</small>
                        {/if}
                      </div>
                      <div class="binding-value mt-1">
                        {#if f.field_type === "boolean" || f.field_type === "pass_fail"}
                          <select
                            class="form-select form-select-sm"
                            value={String(binding.value ?? "")}
                            onchange={(e) => {
                              const v = (e.target as HTMLSelectElement).value;
                              updateBinding(cat, f.id, { value: v === "true" ? true : v === "false" ? false : null });
                            }}
                          >
                            <option value="">--</option>
                            <option value="true">Pass / True</option>
                            <option value="false">Fail / False</option>
                          </select>
                        {:else if f.field_type === "threshold"}
                          <div class="input-group input-group-sm">
                            <select
                              class="form-select form-select-sm flex-shrink-1"
                              value={binding.operator ?? "<="}
                              onchange={(e) => updateBinding(cat, f.id, { operator: (e.target as HTMLSelectElement).value })}
                              style="width:60px"
                            >
                              <option value="<=">&le;</option>
                              <option value=">=">&ge;</option>
                              <option value="==">=</option>
                              <option value="<">&lt;</option>
                              <option value=">">&gt;</option>
                            </select>
                            <input
                              type="number"
                              class="form-control form-control-sm"
                              value={binding.target_value ?? ""}
                              oninput={(e) => updateBinding(cat, f.id, { target_value: parseFloat((e.target as HTMLInputElement).value) || null })}
                              placeholder="Target"
                            />
                          </div>
                        {:else if f.field_type === "measurement"}
                          <div class="d-flex gap-1">
                            <input
                              type="number"
                              class="form-control form-control-sm"
                              value={binding.value ?? ""}
                              oninput={(e) => updateBinding(cat, f.id, { value: parseFloat((e.target as HTMLInputElement).value) || null })}
                              placeholder="Value"
                            />
                          </div>
                        {:else}
                          <input
                            type={f.field_type === "number" ? "number" : "text"}
                            class="form-control form-control-sm"
                            value={binding.value ?? ""}
                            oninput={(e) => {
                              const raw = (e.target as HTMLInputElement).value;
                              const v = f.field_type === "number" ? (parseFloat(raw) || null) : raw;
                              updateBinding(cat, f.id, { value: v });
                            }}
                          />
                        {/if}
                      </div>
                    </div>
                  {/if}
                {/if}
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
    border: 1px solid #eee;
    border-radius: 4px;
    margin-bottom: 3px;
  }
  .binding-name {
    font-size: 0.8rem;
    font-weight: 500;
  }
  .binding-value {
  }
</style>
