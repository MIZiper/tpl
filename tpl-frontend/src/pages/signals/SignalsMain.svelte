<script lang="ts">
  import { onMount } from "svelte";
  import { p, route } from "../../router";
  import { planApi } from "../../lib/api";
  import {
    availableSignals,
    buildStepWindows,
    buildSignalLanes,
    type SignalOption,
  } from "../../lib/signals";
  import type { PlanDocument } from "../../types/plan";
  import SignalChart from "../../components/SignalChart.svelte";
  import DocumentNav from "../../components/DocumentNav.svelte";

  let id: string = $derived(route.params.id ?? "");
  let plan = $state<PlanDocument | null>(null);
  let loading = $state(true);
  let selected = $state<string[]>([]);
  let selectionLoaded = $state(false);

  const key = $derived("tpl.signals.selected." + id);
  const options = $derived(plan ? availableSignals(plan) : []);
  const windows = $derived(plan ? buildStepWindows(plan.root, 0) : null);
  const selectedOptions = $derived(options.filter((o) => selected.includes(o.defId)));
  const lanes = $derived(plan && windows ? buildSignalLanes(plan, selectedOptions, windows) : []);
  const rawOptions = $derived(options.filter((o) => !o.derived));
  const derivedOptions = $derived(options.filter((o) => o.derived));

  async function loadData() {
    const pd = await planApi.getDocument(id).catch(() => null);
    plan = pd;
    loading = false;
  }

  onMount(() => { loadData(); });

  // Restore the saved selection once, or preselect the first few channels.
  $effect(() => {
    if (!plan || selectionLoaded) return;
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    if (saved) {
      try {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr)) selected = arr.filter((x): x is string => typeof x === "string");
      } catch {
        selected = [];
      }
    } else {
      selected = options.slice(0, 3).map((o) => o.defId);
    }
    selectionLoaded = true;
  });

  $effect(() => {
    if (selectionLoaded && id) localStorage.setItem(key, JSON.stringify(selected));
  });

  function toggle(defId: string) {
    selected = selected.includes(defId)
      ? selected.filter((x) => x !== defId)
      : [...selected, defId];
  }

  function selectAll() {
    selected = options.map((o) => o.defId);
  }

  function clearAll() {
    selected = [];
  }
</script>

<div class="signals-page">
  <div class="signals-toolbar">
    <a href={p("/documents/:id", { params: { id } })} class="btn btn-sm btn-outline-secondary">Back</a>
    <DocumentNav {id} current="signals" />
    <span class="signals-title ms-3">Input Signals</span>
    <span class="flex-grow-1"></span>
    {#if windows && windows.totalMs > 0}
      <span class="badge bg-light text-dark border">{selected.length} / {options.length} selected</span>
    {/if}
  </div>

  {#if loading}
    <div class="p-3">Loading...</div>
  {:else if !plan || plan.root.length === 0}
    <div class="p-5 text-center">
      <p class="text-muted">No plan steps defined.</p>
      <a class="btn btn-sm btn-outline-primary" href={p("/documents/:id/plan", { params: { id } })}>Open Plan editor</a>
    </div>
  {:else if options.length === 0}
    <div class="p-5 text-center">
      <p class="text-muted">No numeric input conditions found. Add number inputs and bind them to steps.</p>
      <a class="btn btn-sm btn-outline-primary" href={p("/documents/:id/plan", { params: { id } })}>Open Plan editor</a>
    </div>
  {:else}
    <div class="signals-body">
      <aside class="signals-sidebar">
        <div class="signals-sidebar-head">
          <strong>Channels</strong>
          <div class="ms-auto d-flex gap-1">
            <button class="btn btn-sm btn-outline-secondary py-0 px-2" onclick={selectAll}>All</button>
            <button class="btn btn-sm btn-outline-secondary py-0 px-2" onclick={clearAll}>None</button>
          </div>
        </div>

        {#each [{ title: "Inputs", items: rawOptions }, { title: "Computed", items: derivedOptions }] as group}
          {#if group.items.length > 0}
            <div class="signals-group-title">{group.title}</div>
            {#each group.items as o (o.defId)}
              <label class="signals-option">
                <input
                  type="checkbox"
                  class="form-check-input mt-0"
                  checked={selected.includes(o.defId)}
                  onchange={() => toggle(o.defId)}
                />
                <span class="signals-option-name" title={o.name}>{o.name}</span>
                {#if o.unit}<span class="signals-option-unit">{o.unit}</span>{/if}
              </label>
            {/each}
          {/if}
        {/each}
      </aside>

      <main class="signals-main">
        {#if windows && windows.totalMs > 0 && lanes.length > 0}
          <SignalChart {lanes} windows={windows} totalMs={windows.totalMs} />
        {:else}
          <div class="p-5 text-center text-muted">Select one or more channels to plot.</div>
        {/if}
      </main>
    </div>
  {/if}
</div>

<style>
  .signals-page { display: flex; flex-direction: column; height: calc(100vh - 70px); overflow: hidden; }
  .signals-toolbar { display: flex; align-items: center; gap: 4px; padding: 6px 12px; border-bottom: 1px solid #dee2e6; background: #f8f9fa; flex-shrink: 0; }
  .signals-title { font-weight: 600; color: #495057; font-size: 0.95rem; }

  .signals-body { display: flex; flex: 1; min-height: 0; }
  .signals-sidebar { width: 220px; min-width: 220px; border-right: 1px solid #dee2e6; background: #fff; overflow-y: auto; padding: 8px 10px 16px; }
  .signals-sidebar-head { display: flex; align-items: center; margin-bottom: 8px; font-size: 0.85rem; }
  .signals-group-title { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; color: #6c757d; margin: 10px 0 4px; }
  .signals-option { display: flex; align-items: center; gap: 6px; padding: 3px 0; font-size: 0.82rem; cursor: pointer; }
  .signals-option-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .signals-option-unit { color: #adb5bd; font-size: 0.72rem; }

  .signals-main { flex: 1; min-width: 0; overflow: auto; padding: 10px 12px; background: #f8f9fa; }
</style>
