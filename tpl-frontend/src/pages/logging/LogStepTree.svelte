<script lang="ts">
  import type { PlanNode, PlanDocument } from "../../types/plan";
  import type { ExecutionDoc, ExecutionEntry, ExecutionRun } from "../../types/execution";
  import { computeEntryStatus } from "../../stores/execution";

  let {
    node,
    plan,
    doc,
    selectedEntryId,
    ctxMenu,
    entryForStep,
    selectEntry,
    activeRun,
    statusClass,
    statusLabel,
    depth = 0,
  }: {
    node: PlanNode;
    plan: PlanDocument;
    doc: ExecutionDoc | null;
    selectedEntryId: string | null;
    ctxMenu: (e: MouseEvent, stepId: string) => void;
    entryForStep: (stepId: string) => ExecutionEntry | undefined;
    selectEntry: (eid: string | null) => void;
    activeRun: (entry: ExecutionEntry) => ExecutionRun | undefined;
    statusClass: (entry: ExecutionEntry) => string;
    statusLabel: (entry: ExecutionEntry) => string;
    depth?: number;
  } = $props();
</script>

{#if node.type === "group"}
  <div class="log-group-header" style="padding-left: {8 + depth * 12}px">
    <span class="group-toggle">{depth > 0 ? "\u2514" : "\u25BE"}</span>
    <span class="group-title">{node.title}</span>
  </div>
  {#each node.children as child (child.id)}
    <svelte:self
      node={child}
      {plan}
      {doc}
      {selectedEntryId}
      {ctxMenu}
      {entryForStep}
      {selectEntry}
      {activeRun}
      {statusClass}
      {statusLabel}
      depth={depth + 1}
    />
  {/each}
{:else if node.type === "step"}
  {@const entry = entryForStep(node.id)}
  {@const run = entry ? activeRun(entry) : undefined}
  <div
    class="log-step"
    style="padding-left: {10 + depth * 16}px"
    class:selected={selectedEntryId === entry?.id}
    class:active={!!run}
    class:completed={entry && !run && computeEntryStatus(entry) === "completed"}
    onclick={() => selectEntry(entry?.id || null)}
    oncontextmenu={(e) => { e.stopPropagation(); ctxMenu(e, node.id); }}
    role="button"
    tabindex="0"
  >
    <span class="step-dot">{run ? "\u25CF" : (entry && computeEntryStatus(entry) === "completed" ? "\u2713" : "\u25CB")}</span>
    <span class="log-step-title">{node.title}</span>
    <span class="flex-grow-1"></span>
    {#if entry && statusClass(entry)}
      <span class="badge {statusClass(entry)}">{statusLabel(entry)}</span>
    {/if}
  </div>
{/if}

<style>
  .log-group-header {
    display: flex; align-items: center; padding: 5px 10px;
    font-size: 0.8rem; font-weight: 600; color: #495057; background: #f0f1f2;
    border-bottom: 1px solid #dee2e6; border-top: 1px solid #dee2e6; margin-top: 1px;
  }
  .group-toggle { margin-right: 6px; font-size: 0.65rem; color: #888; }
  .group-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: uppercase; letter-spacing: 0.5px; }
  .log-step {
    display: flex; align-items: center; padding: 4px 10px;
    cursor: pointer; font-size: 0.82rem; border-bottom: 1px solid #f4f4f4;
    border-left: 3px solid transparent;
  }
  .log-step:hover { background: #e9ecef; }
  .log-step.selected { background: #cfe2ff; border-left-color: #0d6efd; }
  .log-step.active { background: #d1e7dd; border-left-color: #198754; }
  .log-step.completed { background: #f8f9fa; }
  .step-dot { margin-right: 6px; font-size: 0.55rem; flex-shrink: 0; width: 12px; text-align: center; }
  .log-step.active .step-dot { color: #198754; }
  .log-step.completed .step-dot { color: #0d6efd; }
  .log-step-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
</style>
