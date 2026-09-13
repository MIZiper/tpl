<script lang="ts">
  import {
    padWindow,
    timeTicks,
    formatDuration,
    formatDateTime,
    type GanttRow,
    type GanttBar,
  } from "../lib/gantt";

  interface Props {
    rows: GanttRow[];
    minMs: number;
    maxMs: number;
    nowMs?: number;
    variant?: "plan" | "actual";
    emptyText?: string;
  }

  let { rows, minMs, maxMs, nowMs, variant = "plan", emptyText = "No data" }: Props = $props();

  const win = $derived(padWindow(minMs, maxMs));
  const span = $derived(Math.max(win.maxMs - win.minMs, 1));
  const ticks = $derived(timeTicks(win.minMs, win.maxMs));
  const minWidth = $derived(Math.max(680, ticks.length * 78 + 240));

  function pct(ms: number): number {
    return ((ms - win.minMs) / span) * 100;
  }

  function barStyle(bar: { startMs: number; endMs: number }): string {
    const left = pct(bar.startMs);
    const width = Math.max(pct(bar.endMs) - left, 0);
    return `left:${left}%;width:max(${width}%,3px)`;
  }

  function barTitle(row: GanttRow, bar: GanttBar): string {
    const lines = [
      row.label,
      `${formatDateTime(bar.startMs)} → ${formatDateTime(bar.endMs)}`,
      `Duration: ${formatDuration(bar.endMs - bar.startMs)}`,
    ];
    if (bar.status) lines.push(`Status: ${bar.status.replace(/_/g, " ")}`);
    if (bar.execIndex != null) lines.push(`Run #${bar.execIndex}`);
    return lines.join("\n");
  }

  function summaryTitle(row: GanttRow): string {
    return `${row.label}\n${formatDateTime(row.startMs)} → ${formatDateTime(row.endMs)}\nSpan: ${formatDuration(row.endMs - row.startMs)}`;
  }

  const showNow = $derived(nowMs != null && nowMs >= win.minMs && nowMs <= win.maxMs);
</script>

{#if rows.length === 0}
  <div class="gantt-empty text-muted p-4 text-center">{emptyText}</div>
{:else}
  <div class="gantt-wrap">
    <div class="gantt" style={`min-width:${minWidth}px`}>
      <!-- Axis header -->
      <div class="gantt-row gantt-head">
        <div class="gantt-label gantt-label-head">Step</div>
        <div class="gantt-track">
          {#each ticks as t (t.ms)}
            <div class="gantt-tick" style={`left:${pct(t.ms)}%`}>
              <span class="gantt-tick-label">{t.label}</span>
            </div>
          {/each}
        </div>
      </div>

      <!-- Rows -->
      {#each rows as row (row.id)}
        <div class="gantt-row" class:group-row={row.kind === "group"}>
          <div class="gantt-label" style={`padding-left:${10 + row.depth * 14}px`}>
            {#if row.kind === "group"}
              <span class="gantt-caret">▾</span>
            {/if}
            <span class:fw-semibold={row.kind === "group"} class:fst-italic={row.kind === "adhoc"}>{row.label}</span>
          </div>
          <div class="gantt-track">
            {#each ticks as t (t.ms)}
              <div class="gantt-grid" style={`left:${pct(t.ms)}%`}></div>
            {/each}

            {#if row.summary}
              {#if row.endMs > row.startMs}
                <div class={`gantt-bar summary ${variant}`} style={barStyle(row)} title={summaryTitle(row)}></div>
              {/if}
            {:else}
              {#each row.bars as bar (bar.id)}
                <div
                  class={`gantt-bar ${variant} ${row.kind === "adhoc" ? "adhoc" : ""} status-${bar.status ?? "none"}`}
                  style={barStyle(bar)}
                  title={barTitle(row, bar)}
                ></div>
              {/each}
            {/if}

            {#if showNow}
              <div class="gantt-now" style={`left:${pct(nowMs!)}%`}></div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .gantt-wrap { overflow-x: auto; border: 1px solid #dee2e6; border-radius: 6px; background: #fff; }
  .gantt { font-size: 0.8rem; }
  .gantt-empty { border: 1px dashed #dee2e6; border-radius: 6px; }

  .gantt-row { display: flex; align-items: stretch; border-bottom: 1px solid #f0f0f0; min-height: 28px; }
  .gantt-row:last-child { border-bottom: none; }
  .gantt-head { position: sticky; top: 0; z-index: 4; background: #f8f9fa; border-bottom: 1px solid #dee2e6; min-height: 30px; }
  .group-row { background: #fcfcfd; }

  .gantt-label {
    position: sticky; left: 0; z-index: 6;
    width: 240px; min-width: 240px; max-width: 240px;
    display: flex; align-items: center; gap: 4px;
    padding-right: 8px;
    background: #fff;
    border-right: 1px solid #dee2e6;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .group-row .gantt-label { background: #fcfcfd; }
  .gantt-label-head { background: #f8f9fa; font-weight: 600; color: #495057; padding-left: 10px; }
  .gantt-caret { color: #adb5bd; font-size: 0.7rem; }

  .gantt-track { position: relative; flex: 1; min-width: 440px; }
  .gantt-head .gantt-track { min-height: 30px; }

  .gantt-grid { position: absolute; top: 0; bottom: 0; width: 1px; background: #f1f3f5; }
  .gantt-tick { position: absolute; top: 0; bottom: 0; width: 1px; background: #dee2e6; }
  .gantt-tick-label {
    position: absolute; top: 6px; left: 4px;
    font-size: 0.68rem; color: #6c757d; white-space: nowrap;
  }

  .gantt-bar {
    position: absolute; top: 5px; bottom: 5px;
    border-radius: 4px; z-index: 3; cursor: default;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  }
  .gantt-bar.summary { top: 9px; bottom: 9px; border-radius: 3px; }

  .gantt-bar.plan { background: #0d6efd; }
  .gantt-bar.summary.plan { background: #495057; }

  .gantt-bar.actual.status-completed { background: #198754; }
  .gantt-bar.actual.status-in_progress { background: #0d6efd; }
  .gantt-bar.actual.status-skipped { background: #ffc107; }
  .gantt-bar.actual.status-pending { background: #adb5bd; }
  .gantt-bar.actual.status-none { background: #6c757d; }
  .gantt-bar.actual.adhoc { background: #6f42c1; }
  .gantt-bar.actual.summary { background: #6c757d; }

  .gantt-now { position: absolute; top: 0; bottom: 0; width: 2px; background: #dc3545; z-index: 5; opacity: 0.85; }
</style>
