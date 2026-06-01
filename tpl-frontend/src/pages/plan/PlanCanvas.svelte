<script lang="ts">
  import type { PlanNode, PlanDefinitions, FieldBinding } from "../../types/plan";

  let {
    nodes,
    selectedNodeId = null,
    definitions = null,
    parentId = null,
    onContextMenu = (_e: MouseEvent, _nodeId: string | null, _parentId: string | null, _index: number) => {},
    onselect = (_id: string) => {},
  }: {
    nodes: PlanNode[];
    selectedNodeId: string | null;
    definitions: PlanDefinitions | null;
    parentId: string | null;
    onContextMenu: (e: MouseEvent, nodeId: string | null, parentId: string | null, index: number) => void;
    onselect: (id: string) => void;
  } = $props();

  let wrapper: HTMLDivElement | undefined = $state();

  $effect(() => {
    const sel = selectedNodeId;
    if (!sel || !wrapper) return;
    const el = wrapper.querySelector(`[data-node-id="${sel}"]`);
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  });
</script>

<div bind:this={wrapper}>
{#each nodes as node, idx (node.id)}
  <div class="canvas-node-wrapper">
    {#if node.type === "group"}
      <div
        class="canvas-group"
        class:selected={selectedNodeId === node.id}
        data-node-id={node.id}
        onclick={() => onselect(node.id)}
        oncontextmenu={(e) => { e.stopPropagation(); onContextMenu(e, node.id, parentId, idx); }}
        role="button"
        tabindex="0"
      >
        <div class="canvas-group-header">
          <span class="collapse-toggle">{node.children.length > 0 ? "\u25BE" : "\u25B8"}</span>
          <span class="canvas-node-title">{node.title}</span>
          <span class="flex-grow-1"></span>
          {#if node.required_executions > 1}
            <span class="canvas-badge execs-badge" title="Executions">x{node.required_executions}</span>
          {/if}
          <span class="canvas-badge group-badge">Group</span>
        </div>
      </div>
      {#if node.children.length > 0}
        <div class="canvas-group-body">
          {#each node.children as child, cidx (child.id)}
        {#if child.type === "step"}
          <div
            class="canvas-step"
            class:selected={selectedNodeId === child.id}
            data-node-id={child.id}
            onclick={() => onselect(child.id)}
            oncontextmenu={(e) => { e.stopPropagation(); onContextMenu(e, child.id, node.id, cidx); }}
            role="button"
            tabindex="0"
          >
            <div class="canvas-step-row">
              <span class="canvas-step-icon">{"\u25CF"}</span>
              <span class="canvas-node-title">{child.title}</span>
              <span class="flex-grow-1"></span>
              <span class="canvas-badge duration-badge" title="Duration">{child.duration_minutes} min</span>
              {#if child.changeover_minutes > 0}
                <span class="canvas-badge change-badge" title="Changeover">+{child.changeover_minutes}</span>
              {/if}
              {#if child.required_executions > 1}
                <span class="canvas-badge execs-badge" title="Executions">x{child.required_executions}</span>
              {/if}
              {#if child.input_conditions.length > 0}
                <span class="canvas-badge info-badge">{child.input_conditions.length} input</span>
              {/if}
            </div>
          </div>
        {:else}
          <svelte:self
            nodes={[child]}
            parentId={node.id}
            {selectedNodeId}
            {definitions}
            {onContextMenu}
            {onselect}
          />
        {/if}
      {/each}
        </div>
      {/if}
    {:else}
      <div
        class="canvas-step"
        class:selected={selectedNodeId === node.id}
        data-node-id={node.id}
        onclick={() => onselect(node.id)}
        oncontextmenu={(e) => { e.stopPropagation(); onContextMenu(e, node.id, null, idx); }}
        role="button"
        tabindex="0"
      >
        <div class="canvas-step-row">
          <span class="canvas-step-icon">{"\u25CF"}</span>
          <span class="canvas-node-title">{node.title}</span>
          <span class="flex-grow-1"></span>
          <span class="canvas-badge duration-badge" title="Duration">{node.duration_minutes} min</span>
          {#if node.changeover_minutes > 0}
            <span class="canvas-badge change-badge" title="Changeover">+{node.changeover_minutes}</span>
          {/if}
          {#if node.required_executions > 1}
            <span class="canvas-badge execs-badge" title="Executions">x{node.required_executions}</span>
          {/if}
          {#if node.input_conditions.length > 0}
            <span class="canvas-badge info-badge">{node.input_conditions.length} input</span>
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/each}
</div>

<style>
  .canvas-node-wrapper {
    margin-bottom: 2px;
  }
  .canvas-group {
    border: 1px solid #dee2e6;
    border-radius: 6px;
    background: #fff;
    margin-bottom: 2px;
  }
  .canvas-group.selected {
    border-color: #0d6efd;
    box-shadow: 0 0 0 2px rgba(13,110,253,0.2);
  }
  .canvas-group-header {
    padding: 8px 12px;
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    font-weight: 600;
    font-size: 0.9rem;
    background: #f8f9fa;
    border-radius: 5px 5px 0 0;
  }
  .canvas-group-body {
    margin-left: 20px;
    padding: 4px 0;
  }
  .canvas-step {
    border: 1px solid #eee;
    border-radius: 4px;
    background: #fff;
    margin-bottom: 2px;
    transition: background 0.15s;
  }
  .canvas-step:hover {
    background: #f0f4ff;
  }
  .canvas-step.selected {
    border-color: #0d6efd;
    background: #e8f0fe;
  }
  .canvas-step.is-group {
    border-color: #dee2e6;
    background: #fafafa;
  }
  .canvas-step-row {
    padding: 6px 10px;
    display: flex;
    align-items: center;
    cursor: pointer;
    font-size: 0.85rem;
    gap: 6px;
  }
  .canvas-step-icon {
    font-size: 0.7rem;
    flex-shrink: 0;
  }
  .canvas-node-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 60px;
  }
  .canvas-badge {
    font-size: 0.65rem;
    padding: 1px 5px;
    border-radius: 3px;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .duration-badge { background: #e8e8e8; color: #555; }
  .change-badge { background: #fff3cd; color: #664d03; }
  .execs-badge { background: #cff4fc; color: #055160; }
  .group-badge { background: #cfe2ff; color: #084298; }
  .info-badge { background: #f8d7da; color: #842029; }
  .collapse-toggle {
    margin-right: 0;
    font-size: 0.6rem;
  }
  .flex-grow-1 { flex: 1; }
</style>
