<script lang="ts">
  import { onMount } from "svelte";
  import { p, route, navigate } from "../../router";
  import { riskStore } from "../../stores/risks";
  import { risksApi, riskCategoriesApi, riskTagsApi } from "../../lib/api";
  import type { RiskCategory, RiskTag } from "../../types";

  let id: string | null = $derived(route.params.id ?? null);
  let loading = $state(false);

  let code = $state("");
  let title = $state("");
  let description = $state("");
  let scope = $state("");
  let categoryId = $state("");
  let severity = $state<number | null>(null);
  let occurrence = $state<number | null>(null);
  let detection = $state<number | null>(null);

  let categories: RiskCategory[] = $state([]);
  let tags: RiskTag[] = $state([]);
  let riskTags: RiskTag[] = $state([]);
  let causes: { id: string; description: string }[] = $state([]);
  let newCause = $state("");
  let newTagName = $state("");

  onMount(async () => {
    try {
      categories = await riskCategoriesApi.list();
    } catch {}
    try {
      tags = await riskTagsApi.list();
    } catch {}

    if (id) {
      loading = true;
      try {
        const risk = await risksApi.get(id);
        code = risk.code ?? "";
        title = risk.title;
        description = risk.description ?? "";
        scope = risk.scope ?? "";
        categoryId = risk.category_id ?? "";
        severity = risk.default_severity;
        occurrence = risk.default_occurrence;
        detection = risk.default_detection;
        causes = risk.causes;
        riskTags = risk.tags;
      } catch {
        title = "";
      } finally {
        loading = false;
      }
    }
  });

  async function submit() {
    if (!title.trim()) return;
    const data = {
      code: code || null,
      title,
      description: description || null,
      scope: scope || null,
      category_id: categoryId || null,
      default_severity: severity,
      default_occurrence: occurrence,
      default_detection: detection,
    };
    if (id) {
      await riskStore.update(id, data);
    } else {
      const created = await riskStore.create(data);
      if (created) id = created.id;
    }
    navigate("/blocks/risks");
  }

  async function addCause() {
    if (!id || !newCause.trim()) return;
    const cause = await risksApi.causes.create(id, { description: newCause });
    causes = [...causes, cause];
    newCause = "";
  }

  async function removeCause(causeId: string) {
    if (!id) return;
    await risksApi.causes.delete(id, causeId);
    causes = causes.filter((c) => c.id !== causeId);
  }

  async function addTagToRisk() {
    if (!id || !newTagName.trim()) return;
    const tag = await riskTagsApi.create({ name: newTagName.trim() });
    tags = [...tags, tag];
    await riskTagsApi.addToRisk(id, tag.id);
    riskTags = [...riskTags, tag];
    newTagName = "";
  }

  async function attachTag(tagId: string) {
    if (!id) return;
    const tag = tags.find((t) => t.id === tagId);
    if (!tag) return;
    await riskTagsApi.addToRisk(id, tag.id);
    riskTags = [...riskTags, tag];
  }

  async function detachTag(tagId: string) {
    if (!id) return;
    await riskTagsApi.removeFromRisk(id, tagId);
    riskTags = riskTags.filter((t) => t.id !== tagId);
  }
</script>

<div class="row">
  <div class="col-md-8">
    <h2>{id ? "Edit Risk" : "New Risk"}</h2>
    {#if loading}
      <p>Loading...</p>
    {:else}
      <div class="row mb-3">
        <div class="col-md-4">
          <label class="form-label">Code</label>
          <input class="form-control" bind:value={code} placeholder="e.g. RISK-001" />
        </div>
        <div class="col-md-8">
          <label class="form-label">Title *</label>
          <input class="form-control" bind:value={title} placeholder="Risk title" />
        </div>
      </div>
      <div class="mb-3">
        <label class="form-label">Category</label>
        <select class="form-select" bind:value={categoryId}>
          <option value="">— None —</option>
          {#each categories as cat}
            <option value={cat.id}>{cat.name}</option>
          {/each}
        </select>
      </div>
      <div class="mb-3">
        <label class="form-label">Description</label>
        <textarea class="form-control" bind:value={description} rows="2"></textarea>
      </div>
      <div class="mb-3">
        <label class="form-label">Scope</label>
        <input class="form-control" bind:value={scope} />
      </div>

      <h5 class="mt-4">FMEA Defaults</h5>
      <div class="row mb-3">
        <div class="col-md-4">
          <label class="form-label">Default Severity</label>
          <input class="form-control" type="number" min="1" max="10" bind:value={severity} />
        </div>
        <div class="col-md-4">
          <label class="form-label">Default Occurrence</label>
          <input class="form-control" type="number" min="1" max="10" bind:value={occurrence} />
        </div>
        <div class="col-md-4">
          <label class="form-label">Default Detection</label>
          <input class="form-control" type="number" min="1" max="10" bind:value={detection} />
        </div>
      </div>

      <button class="btn btn-primary" onclick={submit} disabled={!title.trim()}>Save</button>
      <a href={p("/blocks/risks")} class="btn btn-secondary ms-2">Cancel</a>
    {/if}
  </div>

  {#if id}
    <div class="col-md-4">
      <div class="card mb-3">
        <div class="card-header"><strong>Causes</strong></div>
        <div class="card-body">
          <ul class="list-group mb-2">
            {#each causes as cause}
              <li class="list-group-item d-flex justify-content-between align-items-center">
                {cause.description}
                <button class="btn btn-sm btn-outline-danger" onclick={() => removeCause(cause.id)}>×</button>
              </li>
            {/each}
          </ul>
          <div class="input-group">
            <input class="form-control form-control-sm" placeholder="New cause" bind:value={newCause} />
            <button class="btn btn-sm btn-outline-primary" onclick={addCause}>Add</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><strong>Tags</strong></div>
        <div class="card-body">
          <div class="mb-2">
            {#each riskTags as tag}
              <span class="badge bg-secondary me-1" role="button" onclick={() => detachTag(tag.id)}>
                {tag.name} ×
              </span>
            {/each}
          </div>
          <div class="input-group mb-2">
            <input class="form-control form-control-sm" placeholder="Attach tag" bind:value={newTagName} />
            <button class="btn btn-sm btn-outline-primary" onclick={addTagToRisk}>Add</button>
          </div>
          <select class="form-select form-select-sm" onchange={(e) => attachTag((e.target as HTMLSelectElement).value)}>
            <option value="">Attach existing...</option>
            {#each tags.filter((t) => !riskTags.find((rt) => rt.id === t.id)) as tag}
              <option value={tag.id}>{tag.name}</option>
            {/each}
          </select>
        </div>
      </div>
    </div>
  {/if}
</div>
