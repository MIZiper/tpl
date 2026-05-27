<script lang="ts">
  import { p, route } from "../../router";
  import type { StepExecution } from "../../types";
  import { onMount } from "svelte";
  import { loggingStore } from "../../stores/logging";

  let projectId: string = $derived(route.params.id ?? "");
  let stepId: string = $derived(route.params.stepId ?? "");
  let executions: StepExecution[] = $state([]);
  let loading = $state(true);

  onMount(async () => {
    await loggingStore.loadProject(projectId);
    loading = false;
    loggingStore.subscribe((s) => {
      executions = s.executions.filter((e) => e.plan_step_id === stepId);
    });
  });
</script>

<div>
  <h2>Step Execution History</h2>

  {#if loading}
    <p>Loading...</p>
  {:else if executions.length === 0}
    <p class="text-muted">No executions yet for this step.</p>
  {:else}
    <table class="table table-striped">
      <thead>
        <tr>
          <th>#</th>
          <th>Type</th>
          <th>Status</th>
          <th>Started</th>
          <th>Completed</th>
          <th>Check</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        {#each executions as exec (exec.id)}
          <tr>
            <td>{exec.execution_number}</td>
            <td>
              <span class="badge bg-{exec.type === 'incident' ? 'danger' : exec.type === 'adhoc' ? 'info' : 'primary'}">
                {exec.type}
              </span>
            </td>
            <td>
              <span class="badge bg-{exec.status === 'completed' ? 'success' : exec.status === 'in_progress' ? 'warning' : 'secondary'}">
                {exec.status}
              </span>
            </td>
            <td>{new Date(exec.started_at).toLocaleString()}</td>
            <td>{exec.completed_at ? new Date(exec.completed_at).toLocaleString() : "-"}</td>
            <td>{exec.completion_check || "-"}</td>
            <td>{exec.notes || "-"}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  <a href={p("/projects/:id/logging", { params: { id: projectId } })} class="btn btn-secondary mt-3">Back to Logging</a>
</div>
