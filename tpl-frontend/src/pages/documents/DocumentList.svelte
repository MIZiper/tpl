<script lang="ts">
  import { onMount } from "svelte";
  import { p } from "../../router";
  import { documentStore } from "../../stores/documents";

  let documents = $state<{ id: string; name: string; description: string | null }[]>([]);
  let loading = $state(true);

  onMount(() => {
    documentStore.load().then(() => {
      return documentStore.subscribe((s) => {
        documents = s.items;
        loading = s.loading;
      });
    });
  });

  async function remove(id: string) {
    await documentStore.remove(id);
  }
</script>

<div>
  <div class="d-flex justify-content-between align-items-center mb-3">
    <h2>Documents</h2>
    <a href={p("/documents/new")} class="btn btn-primary">+ New Document</a>
  </div>

  {#if loading}
    <p>Loading...</p>
  {:else if documents.length === 0}
    <p class="text-muted">No documents yet. Create one to start a test plan.</p>
  {:else}
    <div class="row">
      {#each documents as document}
        <div class="col-md-4 mb-3">
          <div class="card">
            <div class="card-body">
              <h5 class="card-title">{document.name}</h5>
              <p class="card-text text-muted">{document.description || ""}</p>
              <div class="btn-group">
                <a
                  href={p("/documents/:id/plan", { params: { id: document.id } })}
                  class="btn btn-sm btn-outline-secondary"
                >
                  Plan
                </a>
                <a
                  href={p("/documents/:id/logging", { params: { id: document.id } })}
                  class="btn btn-sm btn-outline-success"
                >
                  Log
                </a>
                <a
                  href={p("/documents/:id", { params: { id: document.id } })}
                  class="btn btn-sm btn-outline-primary"
                >
                  Edit
                </a>
                <button class="btn btn-sm btn-outline-danger" onclick={() => remove(document.id)}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
