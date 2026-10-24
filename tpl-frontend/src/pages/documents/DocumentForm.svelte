<script lang="ts">
  import { onMount } from "svelte";
  import { p, route, navigate } from "../../router";
  import { documentStore } from "../../stores/documents";
  import { documentsApi } from "../../lib/api";
  import { auth, initAuth, login } from "../../lib/auth";
  import { canCreate, canEdit, TPL_CREATE_ROLE } from "../../lib/permissions";
  import type { Document } from "../../types/document";

  let id: string | null = $derived(route.params.id ?? null);
  let name = $state("");
  let description = $state("");
  let loading = $state(false);
  let document = $state<Document | null>(null);
  let storeError = $state<string | null>(null);
  let loadError = $state<string | null>(null);

  onMount(() => {
    documentStore.clearError();
    const unsubscribe = documentStore.subscribe((s) => {
      storeError = s.error;
    });

    void (async () => {
      await initAuth();
      if (!id) return;
      loading = true;
      try {
        const doc = await documentsApi.get(id);
        document = doc;
        name = doc.name;
        description = doc.description ?? "";
      } catch (e) {
        loadError = e instanceof Error ? e.message : String(e);
      } finally {
        loading = false;
      }
    })();

    return unsubscribe;
  });

  const permissionError = $derived.by(() => {
    if (!$auth.enabled) return null;
    if (!id) {
      if (!$auth.authenticated) return "Please log in to create a document.";
      if (!canCreate($auth)) {
        return `You do not have permission to create documents. The ${TPL_CREATE_ROLE} role is required.`;
      }
      return null;
    }
    if (document && !canEdit(document, $auth)) {
      return "You do not have permission to edit this document.";
    }
    return null;
  });

  const message = $derived(permissionError || loadError || storeError);

  async function submit() {
    if (permissionError || !name.trim()) return;
    documentStore.clearError();
    const result = id
      ? await documentStore.update(id, { name, description })
      : await documentStore.create({ name, description });
    if (result) navigate("/documents");
  }
</script>

<div class="row">
  <div class="col-md-6">
    <h2>{id ? "Edit Document" : "New Document"}</h2>
    {#if loading}
      <p>Loading...</p>
    {:else}
      {#if message}
        <div class="alert alert-warning">
          <p class="mb-2">{message}</p>
          {#if $auth.enabled && !$auth.authenticated}
            <button class="btn btn-sm btn-primary" onclick={login}>Login</button>
          {/if}
        </div>
      {/if}
      <div class="mb-3">
        <label class="form-label">Name</label>
        <input class="form-control" bind:value={name} placeholder="Document name" />
      </div>
      <div class="mb-3">
        <label class="form-label">Description</label>
        <textarea class="form-control" bind:value={description} rows="3"></textarea>
      </div>
      <button
        class="btn btn-primary"
        onclick={submit}
        disabled={!!permissionError || !name.trim()}
      >Save</button>
      <a href={p("/documents")} class="btn btn-secondary ms-2">Cancel</a>
    {/if}
  </div>
</div>
