<script lang="ts">
  import { onMount } from "svelte";
  import { p } from "../../router";
  import { documentStore } from "../../stores/documents";
  import { auth, login } from "../../lib/auth";
  import { canCreate, canDelete, canEdit, TPL_CREATE_ROLE } from "../../lib/permissions";
  import type { Document } from "../../types/document";

  let documents = $state<Document[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  onMount(() => {
    const unsubscribe = documentStore.subscribe((s) => {
      documents = s.items;
      loading = s.loading;
      error = s.error;
    });
    documentStore.load();
    return unsubscribe;
  });

  async function remove(document: Document) {
    if (!confirm(`Delete "${document.name}"?`)) return;
    await documentStore.remove(document.id);
  }
</script>

<div>
  <div class="d-flex justify-content-between align-items-center mb-3">
    <h2>Documents</h2>
    {#if !$auth.enabled || canCreate($auth)}
      <a href={p("/documents/new")} class="btn btn-primary">+ New Document</a>
    {:else if !$auth.authenticated}
      <button class="btn btn-primary" onclick={login}>Login to create</button>
    {:else}
      <button
        class="btn btn-primary"
        disabled
        title={`Requires the ${TPL_CREATE_ROLE} role`}
      >+ New Document</button>
    {/if}
  </div>

  {#if $auth.enabled && $auth.authenticated && !canCreate($auth)}
    <div class="alert alert-warning py-2">
      You do not have permission to create documents. Ask an administrator for the
      <code>{TPL_CREATE_ROLE}</code> role.
    </div>
  {/if}

  {#if error}
    <div class="alert alert-danger py-2">{error}</div>
  {/if}

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
              <p class="card-text text-muted small mb-2">
                Created by {document.creator_name || "Unknown"}
              </p>
              <div class="mb-2 d-flex gap-1 flex-wrap">
                {#if document.plan_external_link}
                  {#if document.plan_external_link.reachable === false || !document.plan_external_link.status}
                    <span class="badge text-bg-danger">Plan TC: state unavailable</span>
                  {:else}
                    <a class="badge text-bg-secondary text-decoration-none" href={document.plan_external_link.external_url} target="_blank" rel="noreferrer">
                      Plan TC: {document.plan_external_link.status}{document.plan_external_link.frozen ? " (locked)" : ""}
                    </a>
                  {/if}
                {/if}
                {#if document.log_external_link}
                  {#if document.log_external_link.reachable === false || !document.log_external_link.status}
                    <span class="badge text-bg-danger">Log TC: state unavailable</span>
                  {:else}
                    <a class="badge text-bg-secondary text-decoration-none" href={document.log_external_link.external_url} target="_blank" rel="noreferrer">
                      Log TC: {document.log_external_link.status}{document.log_external_link.frozen ? " (locked)" : ""}
                    </a>
                  {/if}
                {/if}
              </div>
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
                  href={p("/documents/:id/gantt", { params: { id: document.id } })}
                  class="btn btn-sm btn-outline-info"
                >
                  Gantt
                </a>
                <a
                  href={p("/documents/:id/signals", { params: { id: document.id } })}
                  class="btn btn-sm btn-outline-warning"
                >
                  Signals
                </a>
                {#if canEdit(document, $auth)}
                  <a
                    href={p("/documents/:id", { params: { id: document.id } })}
                    class="btn btn-sm btn-outline-primary"
                  >
                    Edit
                  </a>
                {/if}
                {#if canDelete(document, $auth)}
                  <button class="btn btn-sm btn-outline-danger" onclick={() => remove(document)}>
                    Delete
                  </button>
                {/if}
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
