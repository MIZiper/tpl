<script lang="ts">
  import { onMount } from "svelte";
  import { p, route, navigate } from "../../router";
  import { documentStore } from "../../stores/documents";
  import { documentsApi } from "../../lib/api";

  let id: string | null = $derived(route.params.id ?? null);
  let name = $state("");
  let description = $state("");
  let loading = $state(false);

  onMount(async () => {
    if (id) {
      loading = true;
      try {
        const doc = await documentsApi.get(id);
        name = doc.name;
        description = doc.description ?? "";
      } catch {
        name = "";
      } finally {
        loading = false;
      }
    }
  });

  async function submit() {
    if (!name.trim()) return;
    if (id) {
      await documentStore.update(id, { name, description });
    } else {
      await documentStore.create({ name, description });
    }
    navigate("/documents");
  }
</script>

<div class="row">
  <div class="col-md-6">
    <h2>{id ? "Edit Document" : "New Document"}</h2>
    {#if loading}
      <p>Loading...</p>
    {:else}
      <div class="mb-3">
        <label class="form-label">Name</label>
        <input class="form-control" bind:value={name} placeholder="Document name" />
      </div>
      <div class="mb-3">
        <label class="form-label">Description</label>
        <textarea class="form-control" bind:value={description} rows="3"></textarea>
      </div>
      <button class="btn btn-primary" onclick={submit} disabled={!name.trim()}>Save</button>
      <a href={p("/documents")} class="btn btn-secondary ms-2">Cancel</a>
    {/if}
  </div>
</div>
