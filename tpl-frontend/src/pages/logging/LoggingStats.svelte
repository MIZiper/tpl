<script lang="ts">
  import { p, route } from "../../router";
  import { onMount } from "svelte";
  import { loggingStore } from "../../stores/logging";
  import type { ExecutionStats } from "../../types";

  let projectId: string = $derived(route.params.id ?? "");
  let stats = $state<ExecutionStats | null>(null);
  let loading = $state(true);

  onMount(async () => {
    await loggingStore.loadStats(projectId);
    loggingStore.subscribe((s) => {
      stats = s.stats;
      loading = s.loading;
    });
  });
</script>

<div>
  <h2>Execution Statistics</h2>

  {#if loading}
    <p>Loading...</p>
  {:else if !stats}
    <p class="text-muted">No statistics available.</p>
  {:else}
    <div class="card mb-4">
      <div class="card-body">
        <h5>Total Duration: {stats.total_duration_minutes.toFixed(1)} min</h5>
      </div>
    </div>

    {#if stats.step_breakdown.length > 0}
      <h4>Step Breakdown</h4>
      <table class="table table-striped">
        <thead>
          <tr>
            <th>Step</th>
            <th>Executions</th>
            <th>Total Duration (min)</th>
            <th>Avg Duration (min)</th>
          </tr>
        </thead>
        <tbody>
          {#each stats.step_breakdown as item}
            <tr>
              <td>{item.title || item.step_id}</td>
              <td>{item.execution_count}</td>
              <td>{typeof item.total_duration === 'number' ? item.total_duration.toFixed(1) : "-"}</td>
              <td>{typeof item.avg_duration === 'number' ? item.avg_duration.toFixed(1) : "-"}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/if}

  <a href={p("/projects/:id/logging", { params: { id: projectId } })} class="btn btn-secondary mt-3">Back to Logging</a>
</div>
