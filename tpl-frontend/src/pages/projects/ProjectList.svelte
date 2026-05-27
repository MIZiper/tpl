<script lang="ts">
  import { p } from "../../router";
  import { onMount } from "svelte";
  import { projectStore } from "../../stores/projects";
  import type { Project } from "../../types";

  let items: Project[] = $state([]);
  let loading = $state(false);

  onMount(async () => {
    await projectStore.load();
    projectStore.subscribe((s) => {
      items = s.items;
      loading = s.loading;
    });
  });
</script>

<div>
  <div class="d-flex justify-content-between align-items-center mb-3">
    <h2>Projects</h2>
    <a href={p("/projects/new")} class="btn btn-primary">New Project</a>
  </div>

  {#if loading}
    <p>Loading...</p>
  {:else if items.length === 0}
    <p class="text-muted">No projects yet.</p>
  {:else}
    <div class="row">
      {#each items as project}
        <div class="col-md-6 mb-3">
          <div class="card">
            <div class="card-body">
              <h5 class="card-title">{project.name}</h5>
              <p class="card-text">{project.description || ""}</p>
              <div class="btn-group">
                <a href={p("/projects/:id", { params: { id: project.id } })} class="btn btn-sm btn-outline-primary">Details</a>
                <a href={p("/projects/:id/plan", { params: { id: project.id } })} class="btn btn-sm btn-outline-secondary">Plan</a>
                <a href={p("/projects/:id/logging", { params: { id: project.id } })} class="btn btn-sm btn-outline-success">Log</a>
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
