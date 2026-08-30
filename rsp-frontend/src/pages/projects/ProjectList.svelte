<script lang="ts">
  import { onMount } from "svelte";
  import { p } from "../../router";
  import { projectStore } from "../../stores/projects";

  let projects = $state<{ id: string; code: string | null; name: string; status: string | null }[]>([]);
  let loading = $state(true);

  onMount(() => {
    projectStore.load().then(() => {
      return projectStore.subscribe((s) => {
        projects = s.items;
        loading = s.loading;
      });
    });
  });

  async function remove(id: string) {
    await projectStore.remove(id);
  }
</script>

<div>
  <div class="d-flex justify-content-between align-items-center mb-3">
    <h2>Projects</h2>
    <a href={p("/projects/new")} class="btn btn-primary">+ New Project</a>
  </div>

  {#if loading}
    <p>Loading...</p>
  {:else if projects.length === 0}
    <p class="text-muted">No projects yet.</p>
  {:else}
    <div class="row">
      {#each projects as project}
        <div class="col-md-4 mb-3">
          <div class="card">
            <div class="card-body">
              <h5 class="card-title">{project.name}</h5>
              <p class="text-muted">{project.code || ""} {project.status ? `· ${project.status}` : ""}</p>
              <a href={p("/projects/:id", { params: { id: project.id } })} class="btn btn-sm btn-outline-primary">Details</a>
              <a href={p("/projects/:id/edit", { params: { id: project.id } })} class="btn btn-sm btn-outline-secondary">Edit</a>
              <button class="btn btn-sm btn-outline-danger" onclick={() => remove(project.id)}>Delete</button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
