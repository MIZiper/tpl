<script lang="ts">
  import { onMount } from "svelte";
  import { p, route, navigate } from "../../router";
  import { projectStore } from "../../stores/projects";
  import { projectsApi, designPhasesApi } from "../../lib/api";
  import type { DesignPhase } from "../../types";

  let id: string | null = $derived(route.params.id ?? null);
  let loading = $state(false);

  let code = $state("");
  let name = $state("");
  let description = $state("");
  let customerName = $state("");
  let platform = $state("");
  let startDate = $state("");
  let endDate = $state("");
  let projectManager = $state("");
  let status = $state("");

  let phases: DesignPhase[] = $state([]);
  let newPhaseName = $state("");

  onMount(async () => {
    try {
      phases = await designPhasesApi.list();
    } catch {}

    if (id) {
      loading = true;
      try {
        const proj = await projectsApi.get(id);
        code = proj.code ?? "";
        name = proj.name;
        description = proj.description ?? "";
        customerName = proj.customer_name ?? "";
        platform = proj.platform ?? "";
        startDate = proj.start_date ?? "";
        endDate = proj.end_date ?? "";
        projectManager = proj.project_manager ?? "";
        status = proj.status ?? "";
      } catch {
        name = "";
      } finally {
        loading = false;
      }
    }
  });

  async function submit() {
    if (!name.trim()) return;
    const data = {
      code: code || null,
      name,
      description: description || null,
      customer_name: customerName || null,
      platform: platform || null,
      start_date: startDate || null,
      end_date: endDate || null,
      project_manager: projectManager || null,
      status: status || null,
    };
    if (id) {
      await projectStore.update(id, data);
    } else {
      const created = await projectStore.create(data);
      if (created) id = created.id;
    }
    navigate("/projects");
  }

  async function addPhase() {
    if (!newPhaseName.trim()) return;
    const phase = await designPhasesApi.create({ name: newPhaseName.trim(), sequence_no: phases.length + 1 });
    phases = [...phases, phase];
    newPhaseName = "";
  }
</script>

<div class="row">
  <div class="col-md-8">
    <h2>{id ? "Edit Project" : "New Project"}</h2>
    {#if loading}
      <p>Loading...</p>
    {:else}
      <div class="row mb-3">
        <div class="col-md-4">
          <label class="form-label">Code</label>
          <input class="form-control" bind:value={code} placeholder="e.g. PRJ-001" />
        </div>
        <div class="col-md-8">
          <label class="form-label">Name *</label>
          <input class="form-control" bind:value={name} />
        </div>
      </div>
      <div class="mb-3">
        <label class="form-label">Description</label>
        <textarea class="form-control" bind:value={description} rows="2"></textarea>
      </div>
      <div class="row mb-3">
        <div class="col-md-4">
          <label class="form-label">Customer</label>
          <input class="form-control" bind:value={customerName} />
        </div>
        <div class="col-md-4">
          <label class="form-label">Platform</label>
          <input class="form-control" bind:value={platform} />
        </div>
        <div class="col-md-4">
          <label class="form-label">Project Manager</label>
          <input class="form-control" bind:value={projectManager} />
        </div>
      </div>
      <div class="row mb-3">
        <div class="col-md-4">
          <label class="form-label">Start Date</label>
          <input class="form-control" type="date" bind:value={startDate} />
        </div>
        <div class="col-md-4">
          <label class="form-label">End Date</label>
          <input class="form-control" type="date" bind:value={endDate} />
        </div>
        <div class="col-md-4">
          <label class="form-label">Status</label>
          <input class="form-control" bind:value={status} placeholder="e.g. active / closed" />
        </div>
      </div>

      <button class="btn btn-primary" onclick={submit} disabled={!name.trim()}>Save</button>
      <a href={p("/projects")} class="btn btn-secondary ms-2">Cancel</a>
    {/if}
  </div>

  <div class="col-md-4">
    <div class="card">
      <div class="card-header"><strong>Design Phases</strong></div>
      <div class="card-body">
        <ul class="list-group mb-2">
          {#each phases as phase}
            <li class="list-group-item d-flex justify-content-between">
              <span>{phase.name}</span>
              <small class="text-muted">#{phase.sequence_no ?? "—"}</small>
            </li>
          {/each}
        </ul>
        <div class="input-group">
          <input class="form-control form-control-sm" placeholder="New phase (e.g. EVT)" bind:value={newPhaseName} />
          <button class="btn btn-sm btn-outline-primary" onclick={addPhase}>Add</button>
        </div>
      </div>
    </div>
  </div>
</div>
