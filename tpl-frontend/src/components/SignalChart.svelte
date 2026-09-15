<script lang="ts">
  import { tick } from "svelte";
  import {
    elapsedTicks,
    formatElapsed,
    formatSignalValue,
    type SignalLane,
    type SignalPoint,
    type StepWindows,
  } from "../lib/signals";

  interface Props {
    lanes: SignalLane[];
    windows: StepWindows;
    totalMs: number;
    emptyText?: string;
  }

  let { lanes, windows, totalMs, emptyText = "No signals" }: Props = $props();

  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 64;

  let trackEl = $state<HTMLDivElement | null>(null);
  let wrapEl = $state<HTMLDivElement | null>(null);
  let hoverMs = $state<number | null>(null);
  let zoom = $state(1);

  const baseTicks = $derived(elapsedTicks(totalMs, 1));
  const ticks = $derived(elapsedTicks(totalMs, zoom));
  const minWidth = $derived(Math.max(680, Math.max(680, baseTicks.length * 80 + 180) * zoom));

  async function setZoom(next: number) {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    if (clamped === zoom) return;
    const el = wrapEl;
    const centerFrac =
      el && el.scrollWidth > 0 ? (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth : 0.5;
    zoom = clamped;
    await tick();
    if (el && el.scrollWidth > 0) {
      el.scrollLeft = centerFrac * el.scrollWidth - el.clientWidth / 2;
    }
  }

  $effect(() => {
    const el = wrapEl;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setZoom(zoom * (e.deltaY < 0 ? 1.25 : 0.8));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  });

  function xPct(ms: number): number {
    return totalMs > 0 ? (ms / totalMs) * 100 : 0;
  }

  function xSvg(ms: number): number {
    return xPct(ms) * 10;
  }

  function ySvg(lane: SignalLane, value: number): number {
    const span = lane.max - lane.min || 1;
    return 100 - ((value - lane.min) / span) * 100;
  }

  function pointsStr(lane: SignalLane, seg: SignalPoint[]): string {
    return seg
      .map((p) => `${xSvg(p.x).toFixed(2)},${ySvg(lane, p.y).toFixed(2)}`)
      .join(" ");
  }

  function bandStr(lane: SignalLane, band: { lower: SignalPoint[]; upper: SignalPoint[] }): string {
    const lower = band.lower.map((p) => `${xSvg(p.x).toFixed(2)},${ySvg(lane, p.y).toFixed(2)}`);
    const upper = [...band.upper]
      .reverse()
      .map((p) => `${xSvg(p.x).toFixed(2)},${ySvg(lane, p.y).toFixed(2)}`);
    return [...lower, ...upper].join(" ");
  }

  function valueAt(lane: SignalLane, ms: number): number | null {
    let best: number | null = null;
    let dist = Infinity;
    for (const seg of lane.segments) {
      for (const p of seg) {
        const d = Math.abs(p.x - ms);
        if (d < dist) {
          dist = d;
          best = p.y;
        }
      }
    }
    return best;
  }

  function onMove(e: MouseEvent) {
    if (!trackEl || totalMs <= 0) return;
    const rect = trackEl.getBoundingClientRect();
    const frac = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    hoverMs = frac * totalMs;
  }

  const hasLanes = $derived(lanes.some((l) => l.hasData));
</script>

{#if totalMs <= 0}
  <div class="signal-empty text-muted p-4 text-center">{emptyText}</div>
{:else}
  <div class="signal-tools">
    <button class="btn btn-sm btn-outline-secondary py-0 px-2" onclick={() => setZoom(zoom / 1.5)} disabled={zoom <= MIN_ZOOM} title="Zoom out">−</button>
    <span class="signal-zoom-label">{Math.round(zoom * 100)}%</span>
    <button class="btn btn-sm btn-outline-secondary py-0 px-2" onclick={() => setZoom(zoom * 1.5)} disabled={zoom >= MAX_ZOOM} title="Zoom in">+</button>
    <button class="btn btn-sm btn-outline-secondary py-0 px-2 ms-1" onclick={() => setZoom(1)} disabled={zoom === 1}>Reset</button>
    <span class="signal-tools-hint text-muted ms-2">Ctrl/⌘ + scroll to zoom</span>
  </div>
  <div class="signal-wrap" bind:this={wrapEl}>
    <div class="signal" style={`min-width:${minWidth}px`} onmousemove={onMove} onmouseleave={() => (hoverMs = null)} role="presentation">
      <!-- Time axis -->
      <div class="signal-row signal-head">
        <div class="signal-label signal-label-head">Signal</div>
        <div class="signal-track" bind:this={trackEl}>
          {#each ticks as t (t.ms)}
            <div class="signal-tick" style={`left:${xPct(t.ms)}%`}>
              <span class="signal-tick-label">{t.label}</span>
            </div>
          {/each}
        </div>
      </div>

      <!-- Step strip -->
      <div class="signal-row signal-strip-row">
        <div class="signal-label signal-strip-label">Steps</div>
        <div class="signal-track">
          {#each windows.steps as s (s.stepId)}
            <div
              class="signal-step"
              style={`left:${xPct(s.startMs)}%;width:${Math.max(xPct(s.endMs) - xPct(s.startMs), 0)}%`}
            >
              <span class="signal-step-title">{s.title}</span>
              {#each s.executions as ex (ex.index)}
                <div
                  class="signal-active"
                  style={`left:${xPct(ex.activeStartMs) - xPct(s.startMs)}%;width:${Math.max(xPct(ex.activeEndMs) - xPct(ex.activeStartMs), 0)}%`}
                ></div>
              {/each}
            </div>
          {/each}
        </div>
      </div>

      <!-- Lanes -->
      {#each lanes as lane (lane.defId)}
        <div class="signal-row signal-lane">
          <div class="signal-label signal-lane-label">
            <span class="signal-swatch" style={`background:${lane.color}`}></span>
            <div class="signal-lane-text">
              <div class="signal-lane-name" title={lane.name}>
                {lane.name}
                {#if lane.unit}<span class="signal-unit">{lane.unit}</span>{/if}
              </div>
              <div class="signal-lane-range">{formatSignalValue(lane.min)} … {formatSignalValue(lane.max)}</div>
            </div>
          </div>
          <div class="signal-track">
            {#each windows.steps as s (s.stepId)}
              {#each s.executions as ex (`${s.stepId}:${ex.index}`)}
                {#if ex.activeEndMs > ex.activeStartMs}
                  <div
                    class="signal-shade"
                    style={`left:${xPct(ex.activeStartMs)}%;width:${Math.max(xPct(ex.activeEndMs) - xPct(ex.activeStartMs), 0)}%`}
                  ></div>
                {/if}
              {/each}
            {/each}

            <svg class="signal-svg" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
              {#each lane.bands as band}
                <polygon class="signal-band" points={bandStr(lane, band)} fill={lane.color} vector-effect="non-scaling-stroke" />
              {/each}
              {#each lane.segments as seg}
                <polyline class="signal-line" points={pointsStr(lane, seg)} stroke={lane.color} vector-effect="non-scaling-stroke" />
              {/each}
            </svg>

            {#each windows.steps as s (s.stepId)}
              <div class="signal-boundary" style={`left:${xPct(s.startMs)}%`}></div>
            {/each}

            {#if hoverMs != null}
              <div class="signal-hover" style={`left:${xPct(hoverMs)}%`}></div>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    {#if hoverMs != null}
      <div class="signal-readout">
        <div class="signal-readout-time">t = {formatElapsed(hoverMs)}</div>
        {#each lanes as lane (lane.defId)}
          <div class="signal-readout-item">
            <span class="signal-swatch" style={`background:${lane.color}`}></span>
            <span class="signal-readout-name">{lane.name}</span>
            <span class="signal-readout-value">
              {formatSignalValue(valueAt(lane, hoverMs))}{#if lane.unit} {lane.unit}{/if}
            </span>
          </div>
        {/each}
      </div>
    {/if}

    {#if !hasLanes}
      <div class="signal-hint text-muted">No data for the selected signals.</div>
    {/if}
  </div>
{/if}

<style>
  .signal-tools {
    display: flex; align-items: center; gap: 4px;
    margin-bottom: 6px; font-size: 0.78rem;
  }
  .signal-zoom-label { min-width: 38px; text-align: center; font-variant-numeric: tabular-nums; color: #495057; }
  .signal-tools-hint { font-size: 0.72rem; }

  .signal-wrap { position: relative; overflow-x: auto; border: 1px solid #dee2e6; border-radius: 6px; background: #fff; }
  .signal { font-size: 0.8rem; position: relative; }
  .signal-empty, .signal-hint { border: 1px dashed #dee2e6; border-radius: 6px; }
  .signal-hint { border: none; padding: 12px; }

  .signal-row { display: flex; align-items: stretch; border-bottom: 1px solid #f0f0f0; }
  .signal-row:last-child { border-bottom: none; }
  .signal-head { position: sticky; top: 0; z-index: 4; background: #f8f9fa; border-bottom: 1px solid #dee2e6; min-height: 30px; }
  .signal-strip-row { background: #fbfbfd; min-height: 30px; }

  .signal-label {
    position: sticky; left: 0; z-index: 6;
    width: 180px; min-width: 180px; max-width: 180px;
    display: flex; align-items: center; gap: 6px;
    padding: 0 8px;
    background: #fff;
    border-right: 1px solid #dee2e6;
    overflow: hidden;
  }
  .signal-strip-row .signal-label { background: #fbfbfd; }
  .signal-label-head { background: #f8f9fa; font-weight: 600; color: #495057; }
  .signal-strip-label { font-size: 0.72rem; color: #6c757d; text-transform: uppercase; letter-spacing: 0.03em; }

  .signal-track { position: relative; flex: 1; min-width: 500px; }
  .signal-head .signal-track { min-height: 30px; }
  .signal-lane .signal-track { min-height: 84px; }

  .signal-tick { position: absolute; top: 0; bottom: 0; width: 1px; background: #dee2e6; }
  .signal-tick-label { position: absolute; top: 6px; left: 4px; font-size: 0.68rem; color: #6c757d; white-space: nowrap; }

  .signal-step {
    position: absolute; top: 0; bottom: 0;
    border-left: 1px solid #ced4da;
    display: flex; align-items: center;
    overflow: hidden;
  }
  .signal-step-title { position: relative; z-index: 2; padding: 0 6px; font-size: 0.7rem; color: #495057; white-space: nowrap; }
  .signal-active { position: absolute; top: 0; bottom: 0; background: rgba(13, 110, 253, 0.08); }

  .signal-shade { position: absolute; top: 0; bottom: 0; background: rgba(13, 110, 253, 0.06); }
  .signal-svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  .signal-line { fill: none; stroke-width: 1.6; }
  .signal-band { opacity: 0.14; stroke: none; }

  .signal-boundary { position: absolute; top: 0; bottom: 0; width: 1px; background: #edf0f2; }
  .signal-hover { position: absolute; top: 0; bottom: 0; width: 1px; background: #dc3545; opacity: 0.7; z-index: 3; }

  .signal-lane-label { padding-top: 4px; padding-bottom: 4px; }
  .signal-lane-text { min-width: 0; }
  .signal-lane-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; color: #343a40; }
  .signal-unit { color: #6c757d; font-weight: 400; margin-left: 4px; font-size: 0.7rem; }
  .signal-lane-range { color: #adb5bd; font-size: 0.68rem; white-space: nowrap; }
  .signal-swatch { width: 9px; height: 9px; border-radius: 2px; display: inline-block; flex-shrink: 0; }

  .signal-readout {
    position: sticky; left: 0; z-index: 7;
    display: flex; align-items: center; flex-wrap: wrap; gap: 12px;
    margin: 0; padding: 6px 10px;
    background: #f8f9fa; border-top: 1px solid #dee2e6;
    font-size: 0.75rem;
  }
  .signal-readout-time { font-weight: 600; color: #495057; }
  .signal-readout-item { display: inline-flex; align-items: center; gap: 4px; }
  .signal-readout-name { color: #495057; }
  .signal-readout-value { font-variant-numeric: tabular-nums; color: #212529; font-weight: 500; }
</style>
