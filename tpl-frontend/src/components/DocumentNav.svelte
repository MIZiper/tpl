<script lang="ts">
  import { p } from "../router";

  interface Props {
    id: string;
    current: "plan" | "logging" | "gantt" | "signals";
  }

  let { id, current }: Props = $props();

  const items = [
    { key: "plan", label: "Plan", path: "/documents/:id/plan", variant: "secondary" },
    { key: "logging", label: "Log", path: "/documents/:id/logging", variant: "success" },
    { key: "gantt", label: "Gantt", path: "/documents/:id/gantt", variant: "info" },
    { key: "signals", label: "Signals", path: "/documents/:id/signals", variant: "warning" },
  ] as const;
</script>

<span class="btn-group btn-group-sm doc-nav" role="group" aria-label="Document panels">
  {#each items as it (it.key)}
    {#if it.key === current}
      <span class={`btn btn-${it.variant} disabled`} aria-current="page">{it.label}</span>
    {:else}
      <a href={p(it.path, { params: { id } })} class={`btn btn-outline-${it.variant}`}>{it.label}</a>
    {/if}
  {/each}
</span>

<style>
  .doc-nav { vertical-align: middle; }
</style>
