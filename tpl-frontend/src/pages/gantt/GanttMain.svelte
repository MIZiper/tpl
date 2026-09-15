<script lang="ts">
  import { onMount } from "svelte";
  import { p, route } from "../../router";
  import { planApi, executionApi } from "../../lib/api";
  import {
    buildPlanRows,
    buildActualRows,
    hasActualBars,
    formatDuration,
  } from "../../lib/gantt";
  import type { PlanDocument } from "../../types/plan";
  import type { ExecutionDoc } from "../../types/execution";
  import GanttChart from "../../components/GanttChart.svelte";

  let id: string = $derived(route.params.id ?? "");
  let tab = $state<"plan" | "actual">("plan");
  let plan = $state<PlanDocument | null>(null);
  let exec = $state<ExecutionDoc | null>(null);
  let loading = $state(true);
  let nowMs = $state(Date.now());

  function pad(n: number): string {
    return String(n).padStart(2, "0");
  }

  function toLocalInput(ms: number): string {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function defaultStartLocal(): string {
    const d = new Date();
    d.setHours(8, 0, 0, 0);
    return toLocalInput(d.getTime());
  }

  function parseLocalInput(v: string): number {
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : Date.now();
  }

  let startLocal = $state("");

  // Plan start anchor: per-document localStorage (defaults to today 08:00).
  $effect(() => {
    if (!id) return;
    const saved = localStorage.getItem("tpl.gantt.start." + id);
    startLocal = saved || defaultStartLocal();
  });

  $effect(() => {
    if (id && startLocal) localStorage.setItem("tpl.gantt.start." + id, startLocal);
  });

  const planLayout = $derived(plan ? buildPlanRows(plan.root, parseLocalInput(startLocal)) : null);
  const actualLayout = $derived(exec ? buildActualRows(plan?.root ?? [], exec.entries, nowMs) : null);
  const hasActual = $derived(hasActualBars(actualLayout));
  const hasActive = $derived(
    (exec?.entries ?? []).some((e) => e.executions.some((r) => r.status === "in_progress"))
  );

  const planTotalMs = $derived(planLayout ? planLayout.maxMs - planLayout.minMs : 0);
  const actualTotalMs = $derived(actualLayout && hasActual ? actualLayout.maxMs - actualLayout.minMs : 0);
  const actualRunCount = $derived(
    (actualLayout?.rows ?? []).reduce((n, row) => n + (row.summary ? 0 : row.bars.length), 0)
  );

  async function loadData() {
    const [pd, ed] = await Promise.all([
      planApi.getDocument(id).catch(() => null),
      executionApi.getDoc(id).catch(() => null),
    ]);
    plan = pd;
    exec = ed;
    loading = false;
  }

  onMount(() => { loadData(); });

  // Live "now" marker; refresh faster while a run is in progress.
  $effect(() => {
    const interval = hasActive ? 1000 : 30000;
    const h = setInterval(() => { nowMs = Date.now(); }, interval);
    return () => clearInterval(h);
  });
</script>

<div class="gantt-page">
  <div class="gantt-toolbar">
    <a href={p("/documents/:id", { params: { id } })} class="btn btn-sm btn-outline-secondary">Back</a>
    <a href={p("/documents/:id/signals", { params: { id } })} class="btn btn-sm btn-outline-warning ms-1">Signals</a>
    <ul class="nav nav-pills nav-sm ms-2">
      <li class="nav-item">
        <button class="nav-link" class:active={tab === "plan"} onclick={() => (tab = "plan")}>Plan</button>
      </li>
      <li class="nav-item">
        <button class="nav-link" class:active={tab === "actual"} onclick={() => (tab = "actual")}>Actual</button>
      </li>
    </ul>
    <span class="flex-grow-1"></span>
    {#if tab === "plan"}
      <label class="small text-muted me-1" for="gantt-start">Start</label>
      <input id="gantt-start" type="datetime-local" class="form-control form-control-sm" style="width:220px" bind:value={startLocal} />
    {/if}
  </div>

  {#if loading}
    <div class="p-3">Loading...</div>
  {:else if tab === "plan"}
    {#if !plan || plan.root.length === 0}
      <div class="p-5 text-center">
        <p class="text-muted">No plan steps defined.</p>
        <a class="btn btn-sm btn-outline-primary" href={p("/documents/:id/plan", { params: { id } })}>Open Plan editor</a>
      </div>
    {:else if planLayout}
      <div class="gantt-meta">
        <span class="text-muted">Estimated timeline from <strong>{new Date(planLayout.minMs).toLocaleString()}</strong></span>
        <span class="badge bg-light text-dark border ms-2">Total {formatDuration(planTotalMs)}</span>
      </div>
      <GanttChart rows={planLayout.rows} minMs={planLayout.minMs} maxMs={planLayout.maxMs} variant="plan" emptyText="No steps" />
    {/if}
  {:else}
    {#if !exec || !hasActual}
      <div class="p-5 text-center">
        <p class="text-muted">No run records yet.</p>
        <a class="btn btn-sm btn-outline-success" href={p("/documents/:id/logging", { params: { id } })}>Open Logging</a>
      </div>
    {:else if actualLayout}
      <div class="gantt-meta">
        <span class="text-muted">Actual timeline from <strong>{new Date(actualLayout.minMs).toLocaleString()}</strong></span>
        <span class="badge bg-light text-dark border ms-2">Total {formatDuration(actualTotalMs)}</span>
        <span class="badge bg-light text-dark border ms-1">{actualRunCount} run{actualRunCount === 1 ? "" : "s"}</span>
        <span class="gantt-legend ms-3">
          <span class="legend-item"><i class="legend-dot completed"></i>Completed</span>
          <span class="legend-item"><i class="legend-dot active"></i>In progress</span>
          <span class="legend-item"><i class="legend-dot skipped"></i>Skipped</span>
          <span class="legend-item"><i class="legend-dot adhoc"></i>Ad-hoc</span>
          <span class="legend-item"><i class="legend-line"></i>Now</span>
        </span>
      </div>
      <GanttChart rows={actualLayout.rows} minMs={actualLayout.minMs} maxMs={actualLayout.maxMs} nowMs={nowMs} variant="actual" emptyText="No runs logged" />
    {/if}
  {/if}
</div>

<style>
  .gantt-page { display: flex; flex-direction: column; height: calc(100vh - 70px); overflow: hidden; padding: 0 2px; }
  .gantt-toolbar { display: flex; align-items: center; gap: 4px; padding: 6px 12px; border-bottom: 1px solid #dee2e6; background: #f8f9fa; flex-shrink: 0; }
  .gantt-meta { display: flex; align-items: center; flex-wrap: wrap; padding: 8px 12px; font-size: 0.85rem; }
  .gantt-page :global(.gantt-wrap) { margin: 0 12px 12px; }
  .nav-pills .nav-link { padding: 3px 12px; font-size: 0.85rem; }

  .gantt-legend { display: inline-flex; align-items: center; gap: 12px; font-size: 0.75rem; color: #495057; }
  .legend-item { display: inline-flex; align-items: center; gap: 4px; }
  .legend-dot { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
  .legend-dot.completed { background: #198754; }
  .legend-dot.active { background: #0d6efd; }
  .legend-dot.skipped { background: #ffc107; }
  .legend-dot.adhoc { background: #6f42c1; }
  .legend-line { width: 2px; height: 12px; background: #dc3545; display: inline-block; }
</style>
