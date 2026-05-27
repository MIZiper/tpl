<script lang="ts">
  import { onMount } from "svelte";
  import { p, navigate, route } from "../../router";
  import { riskStore } from "../../stores/risks";
  import type { Risk } from "../../types";

  let id: string = $derived(route.params.id ?? "");
  let isNew = $derived(!id);

  let form: Partial<Risk> = $state({
    title: "",
    description: "",
    scope: "",
  });
  let saving = $state(false);
  let error = $state("");

  onMount(async () => {
    if (isNew) return;
    try {
      const existing = await riskStore.get(id!);
      if (existing) {
        form = {
          title: existing.title,
          description: existing.description,
          scope: existing.scope,
        };
      }
    } catch {
      error = "Failed to load risk.";
    }
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();
    saving = true;
    error = "";
    try {
      if (isNew) {
        const result = await riskStore.create(form);
        if (result) {
          navigate("/blocks/risks");
        }
      } else {
        await riskStore.update(id, form);
        navigate("/blocks/risks");
      }
    } catch (e) {
      error = String(e);
    } finally {
      saving = false;
    }
  }
</script>

<div>
  <h2>{isNew ? "New Risk" : "Edit Risk"}</h2>

  {#if error}
    <div class="alert alert-danger">{error}</div>
  {/if}

  <form onsubmit={handleSubmit}>
    <div class="mb-3">
      <label class="form-label" for="risk-title">Title</label>
      <input type="text" class="form-control" id="risk-title" bind:value={form.title} required />
    </div>
    <div class="mb-3">
      <label class="form-label" for="risk-desc">Description</label>
      <textarea class="form-control" id="risk-desc" bind:value={form.description} rows={3}></textarea>
    </div>
    <div class="mb-3">
      <label class="form-label" for="risk-scope">Scope</label>
      <input type="text" class="form-control" id="risk-scope" bind:value={form.scope} placeholder="Where this risk appears" />
    </div>
    <button type="submit" class="btn btn-primary" disabled={saving}>
      {saving ? "Saving..." : "Save"}
    </button>
    <a href={p("/blocks/risks")} class="btn btn-secondary ms-2">Cancel</a>
  </form>
</div>
