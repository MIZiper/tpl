<script lang="ts">
  import { computeStepOutputs, nodeBindingValues, findDefinition } from "../../lib/plan-utils";
  import type { Value } from "../../lib/values";
  import type { PlanNode, PlanDefinitions, TransformDef } from "../../types/plan";

  let {
    node,
    definitions,
    transforms,
  }: {
    node: PlanNode | null;
    definitions: PlanDefinitions;
    transforms: TransformDef[];
  } = $props();

  let expanded = $state(true);

  const outputs = $derived.by(() => {
    if (!node || node.type !== "step") {
      return { byTransform: {} as Record<string, Value>, byDef: {} as Record<string, Value> };
    }
    return computeStepOutputs(transforms, definitions, nodeBindingValues(definitions, node));
  });

  const rows = $derived.by(() => {
    const list: { name: string; unit: string; value: Value }[] = [];
    for (const t of transforms) {
      const out = outputs.byTransform[t.id];
      if (!out) continue;
      const def = findDefinition(definitions, t.derivedDefId);
      list.push({
        name: def?.name || t.derived.name || t.name,
        unit: t.derived.unit || (def?.params?.unit as string | undefined) || "",
        value: out,
      });
    }
    return list;
  });
</script>

{#if node?.type === "step" && rows.length > 0}
  <div class="computed-flyout">
    <button class="computed-flyout-header" onclick={() => (expanded = !expanded)} title="Toggle computed values">
      <span class="computed-flyout-title">Computed <span class="badge bg-secondary">{rows.length}</span></span>
      <span>{expanded ? "\u25BE" : "\u25B8"}</span>
    </button>
    {#if expanded}
      <div class="computed-flyout-body">
        {#each rows as r, i (i)}
          <div class="computed-row">
            <span class="computed-row-name">{r.name}{#if r.unit}<small class="text-muted"> ({r.unit})</small>{/if}</span>
            <span class="computed-row-value">{r.value.display()}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .computed-flyout {
    position: fixed;
    left: 262px;
    right: 372px;
    bottom: 16px;
    width: auto;
    max-width: 520px;
    min-width: 0;
    background: #fff;
    border: 1px solid #c8c8e4;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
    z-index: 30;
    overflow: hidden;
    font-size: 0.8rem;
  }
  .computed-flyout-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 6px 10px;
    background: #f0f0ff;
    border: none;
    cursor: pointer;
    font-size: 0.8rem;
  }
  .computed-flyout-title {
    font-weight: 600;
    color: #6f42c1;
  }
  .computed-flyout-body {
    max-height: min(40vh, 320px);
    overflow-y: auto;
    padding: 4px 0;
  }
  .computed-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 10px;
    border-bottom: 1px solid #f1f1f1;
  }
  .computed-row:last-child {
    border-bottom: none;
  }
  .computed-row-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .computed-row-value {
    font-weight: 600;
    font-family: monospace;
    white-space: nowrap;
  }
</style>
