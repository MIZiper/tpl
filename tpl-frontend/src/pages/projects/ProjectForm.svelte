<script lang="ts">
  import { p, navigate } from "../../router";
  import { projectStore } from "../../stores/projects";
  import type { Project } from "../../types";

  let form: Partial<Project> = $state({ name: "", description: "" });
  let saving = $state(false);
  let error = $state("");

  async function handleSubmit(e: Event) {
    e.preventDefault();
    saving = true;
    error = "";
    try {
      const result = await projectStore.create(form);
      if (result) {
        navigate("/projects");
      }
    } catch (e) {
      error = String(e);
    } finally {
      saving = false;
    }
  }
</script>

<div>
  <h2>New Project</h2>

  {#if error}
    <div class="alert alert-danger">{error}</div>
  {/if}

  <form onsubmit={handleSubmit}>
    <div class="mb-3">
      <label class="form-label" for="proj-name">Name</label>
      <input type="text" class="form-control" id="proj-name" bind:value={form.name} required />
    </div>
    <div class="mb-3">
      <label class="form-label" for="proj-desc">Description</label>
      <textarea class="form-control" id="proj-desc" bind:value={form.description} rows={3}></textarea>
    </div>
    <button type="submit" class="btn btn-primary" disabled={saving}>
      {saving ? "Saving..." : "Save"}
    </button>
    <a href={p("/projects")} class="btn btn-secondary ms-2">Cancel</a>
  </form>
</div>
