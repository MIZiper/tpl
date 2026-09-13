<script lang="ts">
  import { p } from "../router";
  import { onMount } from "svelte";
  import { documentStore } from "../stores/documents";

  let documents = $state<{ id: string; name: string; description: string | null }[]>([]);

  onMount(() => {
    documentStore.load().then(() => {
      return documentStore.subscribe((s) => {
        documents = s.items;
      });
    });
  });
</script>

<div>
  <h1 class="mb-4">TPL - Test Plan & Log</h1>
  <p class="text-muted">Store test plans and execution logs as JSON documents.</p>

  <div class="row mb-4">
    <div class="col-md-4">
      <div class="card">
        <div class="card-body">
          <h5 class="card-title">Documents</h5>
          <p class="card-text">Manage test plan and execution log documents.</p>
          <a href={p("/documents")} class="btn btn-primary">Open</a>
        </div>
      </div>
    </div>
  </div>

  {#if documents.length > 0}
    <h3>Recent Documents</h3>
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
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <p class="text-muted">No documents yet. <a href={p("/documents/new")}>Create one</a>.</p>
  {/if}
</div>
