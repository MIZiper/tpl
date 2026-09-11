<script lang="ts">
  import type { PlanDefinitions, PlanFieldDef, InputLayoutItem, InputSize } from "../../types/plan";
  import {
    orderedInputDefs,
    normalizeInputLayout,
    reorderInputLayout,
    setInputLayoutSize,
    setInputLayoutHidden,
    isInputHidden,
    inputSizeFor,
    inputSizeClass,
  } from "../../lib/plan-utils";
  import { defUnit } from "../../lib/fieldtypes";

  let {
    definitions,
    layout,
    onapply,
    onclose,
  }: {
    definitions: PlanDefinitions;
    layout: InputLayoutItem[];
    onapply: (layout: InputLayoutItem[]) => void;
    onclose: () => void;
  } = $props();

  const sizes: InputSize[] = ["sm", "md", "lg"];

  let draft = $state<InputLayoutItem[]>(normalizeInputLayout(definitions.input_conditions, layout));
  let dragId = $state<string | null>(null);
  let overIndex = $state<number | null>(null);

  // Visible cards first (layout order), hidden cards last.
  const displayDefs = $derived.by(() => {
    const ordered = orderedInputDefs(definitions.input_conditions, draft);
    return [...ordered.filter((d) => !isInputHidden(d.id, draft)), ...ordered.filter((d) => isInputHidden(d.id, draft))];
  });

  function setSize(id: string, size: InputSize) {
    draft = setInputLayoutSize(definitions.input_conditions, draft, id, size);
  }

  function toggleHidden(id: string) {
    draft = setInputLayoutHidden(definitions.input_conditions, draft, id, !isInputHidden(id, draft));
  }

  function reset() {
    draft = normalizeInputLayout(definitions.input_conditions, []);
  }

  function onDragStart(e: DragEvent, id: string) {
    dragId = id;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
    }
  }

  function onDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    overIndex = index;
  }

  function onDrop(e: DragEvent, index: number) {
    e.preventDefault();
    if (dragId) draft = reorderInputLayout(definitions.input_conditions, draft, dragId, index);
    dragId = null;
    overIndex = null;
  }

  function onDragEnd() {
    dragId = null;
    overIndex = null;
  }

  function sampleValue(f: PlanFieldDef): string {
    switch (f.typeId) {
      case "number": return "12.5";
      case "bool": return "Pass";
      case "select": {
        const opts = f.params.options as string[] | undefined;
        return opts?.[0] ?? "—";
      }
      case "struct": return String(f.params.structTypeId ?? "struct");
      default: return "abc";
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="modal-backdrop" onclick={onclose}></div>
<div class="modal d-block" tabindex="-1">
  <div class="modal-dialog modal-xl modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Input Layout</h5>
        <button class="btn-close" onclick={onclose} aria-label="Close"></button>
      </div>

      <div class="modal-body">
        {#if definitions.input_conditions.length === 0}
          <p class="text-muted mb-0">No Input Conditions defined yet. Add some in the Defs tab first.</p>
        {:else}
          <p class="text-muted small mb-2">Drag cards to reorder, set a width, or hide inputs. Hidden inputs are dashed and kept last; they won't appear on the logging page.</p>
          <div class="layout-grid">
            {#each displayDefs as d, i (d.id)}
              {@const hidden = isInputHidden(d.id, draft)}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="layout-card field-block {inputSizeClass(inputSizeFor(d.id, draft))}"
                class:hidden
                class:dragging={dragId === d.id}
                class:drop-target={overIndex === i && dragId !== null && dragId !== d.id}
                draggable="true"
                ondragstart={(e) => onDragStart(e, d.id)}
                ondragover={(e) => onDragOver(e, i)}
                ondrop={(e) => onDrop(e, i)}
                ondragend={onDragEnd}
              >
                <div class="card-head">
                  <span class="drag-handle" title="Drag to reorder">{"\u28FF"}</span>
                  <span class="card-name">{d.name}</span>
                  {#if d.derived}<span class="badge bg-secondary">Computed</span>{/if}
                  <button class="icon-btn" class:active={hidden} onclick={() => toggleHidden(d.id)} title={hidden ? "Show on log page" : "Hide from log page"}>{hidden ? "Show" : "Hide"}</button>
                </div>
                {#if defUnit(d)}<small class="text-muted">{defUnit(d)}</small>{/if}
                <div class="field-block-value">{d.derived ? "computed" : sampleValue(d)}</div>
                <div class="size-group">
                  {#each sizes as s (s)}
                    <button class="size-btn" class:active={inputSizeFor(d.id, draft) === s} onclick={() => setSize(d.id, s)} title={`${s} width`}>{s.toUpperCase()}</button>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="modal-footer">
        <button class="btn btn-sm btn-outline-secondary me-auto" onclick={reset} disabled={definitions.input_conditions.length === 0}>Reset</button>
        <button class="btn btn-secondary" onclick={onclose}>Cancel</button>
        <button class="btn btn-primary" onclick={() => onapply(draft)} disabled={definitions.input_conditions.length === 0}>Apply</button>
      </div>
    </div>
  </div>
</div>

<style>
  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.3); z-index: 1040; }
  .modal { z-index: 1050; }
  .layout-grid {
    display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px; align-items: start; max-height: 65vh; overflow-y: auto; padding: 2px;
  }
  .layout-card { padding: 8px 10px; background: #fff; border: 1px solid #dee2e6; border-radius: 6px; min-width: 0; cursor: grab; }
  .layout-card.size-sm { grid-column: span 1; }
  .layout-card.size-md { grid-column: span 2; }
  .layout-card.size-lg { grid-column: span 4; }
  .layout-card.hidden { border-style: dashed; border-color: #adb5bd; background: #fafafa; opacity: 0.75; }
  .layout-card.dragging { opacity: 0.4; }
  .layout-card.drop-target { outline: 2px solid #0d6efd; outline-offset: -2px; }
  .card-head { display: flex; align-items: center; gap: 4px; }
  .drag-handle { color: #adb5bd; cursor: grab; font-size: 0.85rem; line-height: 1; }
  .card-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.78rem; font-weight: 600; }
  .icon-btn {
    font-size: 0.6rem; line-height: 1; padding: 2px 5px;
    border: 1px solid #dee2e6; background: #fff; color: #666; cursor: pointer; border-radius: 3px;
  }
  .icon-btn.active { background: #6c757d; border-color: #6c757d; color: #fff; }
  .field-block-value { font-size: 0.82rem; margin-top: 3px; color: #333; }
  .size-group { display: flex; gap: 2px; margin-top: 6px; }
  .size-btn {
    font-size: 0.62rem; line-height: 1; padding: 3px 5px;
    border: 1px solid #dee2e6; background: #fff; color: #666; cursor: pointer;
  }
  .size-btn:first-child { border-radius: 3px 0 0 3px; }
  .size-btn:last-child { border-radius: 0 3px 3px 0; }
  .size-btn.active { background: #0d6efd; border-color: #0d6efd; color: #fff; }
</style>
