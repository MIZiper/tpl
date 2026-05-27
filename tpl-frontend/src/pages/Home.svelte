<script lang="ts">
  import { p } from "../router";
  import { onMount } from "svelte";
  import { projectStore } from "../stores/projects";
  import { isOnline } from "../stores/offline";

  let projects: { id: string; name: string; description: string | null }[] = $state([]);

  onMount(() => {
    projectStore.load().then(() => {
      const unsub = projectStore.subscribe((s) => {
        projects = s.items;
      });
      return unsub;
    });
  });
</script>

<div>
  <h1 class="mb-4">TPL - Test Plan & Log</h1>

  <div class="alert alert-info">
    Status: <strong>{$isOnline ? "Online" : "Offline"}</strong>
  </div>

  <div class="row mb-4">
    <div class="col-md-4">
      <div class="card">
        <div class="card-body">
          <h5 class="card-title">Building Blocks</h5>
          <p class="card-text">Define risk blocks and test solution blocks.</p>
          <a href={p("/blocks/risks")} class="btn btn-primary">Open</a>
        </div>
      </div>
    </div>
    <div class="col-md-4">
      <div class="card">
        <div class="card-body">
          <h5 class="card-title">Projects</h5>
          <p class="card-text">Manage test projects, risks, and solutions.</p>
          <a href={p("/projects")} class="btn btn-primary">Open</a>
        </div>
      </div>
    </div>
  </div>

  {#if projects.length > 0}
    <h3>Recent Projects</h3>
    <div class="row">
      {#each projects as project}
        <div class="col-md-4 mb-3">
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
  {:else}
    <p class="text-muted">No projects yet. <a href={p("/projects/new")}>Create one</a>.</p>
  {/if}
</div>
