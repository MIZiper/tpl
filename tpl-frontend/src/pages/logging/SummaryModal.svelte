<script lang="ts">
  import type { PlanDocument } from "../../types/plan";
  import type { ExecutionDoc } from "../../types/execution";
  import { buildExecutionSummary, type SummaryCell, type SummaryRunRow } from "../../lib/summary";
  import { formatDuration } from "../../lib/gantt";

  interface Props {
    plan: PlanDocument | null;
    doc: ExecutionDoc;
    onClose: () => void;
  }

  let { plan, doc, onClose }: Props = $props();

  const summary = $derived(buildExecutionSummary(plan, doc));

  const totalCols = $derived(
    4 + summary.inputs.length + summary.criteria.length + summary.measurements.length
  );

  function formatTime(ts: string | null): string {
    if (!ts) return "";
    const m = ts.trim().match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d+)?[+-]\d{2}:?\d{2}$/);
    if (m) return `${m[1]} ${m[2]}`;
    return new Date(ts).toLocaleString();
  }

  function runDurationMs(r: SummaryRunRow): number | null {
    if (!r.startedAt || !r.completedAt) return null;
    const ms = new Date(r.completedAt).getTime() - new Date(r.startedAt).getTime();
    return ms >= 0 ? ms : null;
  }

  function statusClass(status: SummaryRunRow["status"]): string {
    return status === "completed" ? "bg-success" : status === "skipped" ? "bg-warning" : "bg-secondary";
  }

  function cellText(c: SummaryCell | undefined): string {
    return c?.value ?? "—";
  }

  function cellClass(c: SummaryCell | undefined): string {
    return c?.tone === "pass" ? "cell-pass" : c?.tone === "fail" ? "cell-fail" : "";
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={onClose}></div>
<div class="modal d-block" tabindex="-1">
  <div class="modal-dialog modal-xl">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Execution Summary</h5>
        <button class="btn-close" title="Close" onclick={onClose}></button>
      </div>
      <div class="modal-body">
        {#if !summary.hasAny}
          <p class="text-muted mb-0">No execution results yet.</p>
        {:else}
          <div class="summary-scroll">
            <table class="table table-sm table-bordered summary-table mb-0">
              <thead>
                <tr>
                  <th class="id-col">Step</th>
                  <th class="id-col">Run</th>
                  <th class="id-col">Status</th>
                  <th class="id-col">Time</th>
                  {#if summary.inputs.length}<th class="band" colspan={summary.inputs.length}>Inputs</th>{/if}
                  {#if summary.criteria.length}<th class="band" colspan={summary.criteria.length}>Criteria</th>{/if}
                  {#if summary.measurements.length}<th class="band" colspan={summary.measurements.length}>Measurements</th>{/if}
                </tr>
                <tr>
                  <th class="id-col"></th>
                  <th class="id-col"></th>
                  <th class="id-col"></th>
                  <th class="id-col"></th>
                  {#each summary.inputs as c (c.definitionId)}
                    <th>
                      {c.name}{#if c.unit}<small class="text-muted"> ({c.unit})</small>{/if}
                      {#if c.derived}<span class="badge bg-secondary ms-1">Computed</span>{/if}
                    </th>
                  {/each}
                  {#each summary.criteria as c (c.definitionId)}<th>{c.name}</th>{/each}
                  {#each summary.measurements as c (c.definitionId)}
                    <th>{c.name}{#if c.unit}<small class="text-muted"> ({c.unit})</small>{/if}</th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each summary.groups as g (g.entryId)}
                  <tr class="step-row">
                    <td colspan={totalCols}>
                      {g.title}{#if g.type === "adhoc"} <small class="text-muted">(ad-hoc)</small>{/if}
                    </td>
                  </tr>
                  {#each g.runs as r (r.runId)}
                    {@const durMs = runDurationMs(r)}
                    <tr>
                      <td class="id-col"></td>
                      <td class="id-col">#{r.runIndex}</td>
                      <td class="id-col"><span class="badge {statusClass(r.status)}">{r.status}</span></td>
                      <td class="id-col">
                        {formatTime(r.startedAt)}{#if durMs != null}<small class="text-muted"> · {formatDuration(durMs)}</small>{/if}
                      </td>
                      {#each summary.inputs as c (c.definitionId)}
                        <td>{cellText(r.inputs[c.definitionId])}</td>
                      {/each}
                      {#each summary.criteria as c (c.definitionId)}
                        <td class={cellClass(r.criteria[c.definitionId])}>{cellText(r.criteria[c.definitionId])}</td>
                      {/each}
                      {#each summary.measurements as c (c.definitionId)}
                        <td class={cellClass(r.measurements[c.definitionId])}>{cellText(r.measurements[c.definitionId])}</td>
                      {/each}
                    </tr>
                  {/each}
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick={onClose}>Close</button>
      </div>
    </div>
  </div>
</div>

<style>
  .modal { z-index: 1050; }
  .summary-scroll { overflow: auto; max-height: 70vh; }
  .summary-table { font-size: 0.78rem; white-space: nowrap; }
  .summary-table th,
  .summary-table td { vertical-align: middle; }
  .summary-table thead th { position: sticky; top: 0; background: #f8f9fa; z-index: 2; }
  .summary-table thead tr:first-child th { top: 0; height: 30px; }
  .summary-table thead tr:nth-child(2) th { top: 30px; }
  .summary-table th.band { text-align: center; border-bottom-width: 2px; }
  .step-row td { background: #eef2f7; font-weight: 600; }
  .cell-pass { background: #d1e7dd; color: #0f5132; }
  .cell-fail { background: #f8d7da; color: #842029; }
</style>
