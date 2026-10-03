<script lang="ts">
  import { onMount } from "svelte";
  import { p, route } from "../../router";
  import { documentsApi, planApi, executionApi } from "../../lib/api";
  import { ApiError } from "../../lib/api/client";
  import type { RawDocuments } from "../../types/document";
  import type { PlanDocument } from "../../types/plan";
  import type { ExecutionDoc } from "../../types/execution";
  import DocumentNav from "../../components/DocumentNav.svelte";

  type PanelKey = "plan" | "execution";
  type Message = { kind: "ok" | "err"; text: string };
  type PanelState = {
    text: string;
    saved: string;
    msg: Message | null;
    wasNull: boolean;
  };

  let id: string = $derived(route.params.id ?? "");
  let doc = $state<RawDocuments | null>(null);
  let loading = $state(true);
  let loadError = $state<string | null>(null);
  let active = $state<PanelKey>("plan");
  let saving = $state<PanelKey | null>(null);

  let panels = $state<Record<PanelKey, PanelState>>({
    plan: { text: "", saved: "", msg: null, wasNull: false },
    execution: { text: "", saved: "", msg: null, wasNull: false },
  });

  const tabs: { key: PanelKey; label: string }[] = [
    { key: "plan", label: "plan_document" },
    { key: "execution", label: "execution_document" },
  ];

  const dirty = (key: PanelKey) => panels[key].text !== panels[key].saved;
  const anyDirty = $derived(dirty("plan") || dirty("execution"));

  function toText(value: unknown): string {
    return JSON.stringify(value ?? {}, null, 2);
  }

  function errMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }

  /** Turn a raw response body (e.g. FastAPI's {"detail": [...]}) into readable text. */
  function describeError(e: unknown): string {
    if (e instanceof ApiError) {
      try {
        const body = JSON.parse(e.message);
        if (body && typeof body === "object" && "detail" in body) {
          const detail = (body as { detail: unknown }).detail;
          return typeof detail === "string" ? detail : JSON.stringify(detail, null, 2);
        }
      } catch {
        /* body was not JSON */
      }
      return e.message;
    }
    return errMessage(e);
  }

  async function load() {
    loading = true;
    loadError = null;
    try {
      const raw = await documentsApi.raw(id);
      doc = raw;
      panels.plan = {
        text: toText(raw.plan_document),
        saved: toText(raw.plan_document),
        msg: null,
        wasNull: raw.plan_document == null,
      };
      panels.execution = {
        text: toText(raw.execution_document),
        saved: toText(raw.execution_document),
        msg: null,
        wasNull: raw.execution_document == null,
      };
    } catch (e) {
      loadError = describeError(e);
    } finally {
      loading = false;
    }
  }

  onMount(load);

  function handleBeforeUnload(e: BeforeUnloadEvent) {
    if (!anyDirty) return;
    e.preventDefault();
    e.returnValue = "";
  }

  function format(key: PanelKey) {
    const panel = panels[key];
    try {
      panel.text = JSON.stringify(JSON.parse(panel.text), null, 2);
      panel.msg = { kind: "ok", text: "Formatted." };
    } catch (e) {
      panel.msg = { kind: "err", text: `Invalid JSON: ${errMessage(e)}` };
    }
  }

  function revert(key: PanelKey) {
    panels[key].text = panels[key].saved;
    panels[key].msg = null;
  }

  async function copy(key: PanelKey) {
    try {
      await navigator.clipboard.writeText(panels[key].text);
      panels[key].msg = { kind: "ok", text: "Copied to clipboard." };
    } catch (e) {
      panels[key].msg = { kind: "err", text: `Copy failed: ${errMessage(e)}` };
    }
  }

  function bytesLabel(key: PanelKey): string {
    const n = new TextEncoder().encode(panels[key].text).length;
    return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
  }

  async function save(key: PanelKey) {
    const panel = panels[key];
    let parsed: unknown;
    try {
      parsed = JSON.parse(panel.text);
    } catch (e) {
      panel.msg = { kind: "err", text: `Not saved — invalid JSON: ${errMessage(e)}` };
      return;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      panel.msg = { kind: "err", text: "Not saved — the document must be a JSON object." };
      return;
    }

    const pretty = JSON.stringify(parsed, null, 2);
    panel.text = pretty;
    panel.msg = null;
    saving = key;
    try {
      if (key === "plan") {
        await planApi.saveDocument(id, parsed as PlanDocument);
      } else {
        await executionApi.saveDoc(id, parsed as ExecutionDoc);
      }
      panel.saved = pretty;
      panel.wasNull = false;
      panel.msg = { kind: "ok", text: `Saved to database at ${new Date().toLocaleTimeString()}.` };
    } catch (e) {
      panel.msg = { kind: "err", text: `Save rejected by API: ${describeError(e)}` };
    } finally {
      saving = null;
    }
  }
</script>

<svelte:window onbeforeunload={handleBeforeUnload} />

{#snippet jsonPanel(key: PanelKey, panel: PanelState)}
  <div class="d-flex align-items-center gap-2 mb-2 flex-wrap">
    <button class="btn btn-sm btn-outline-secondary" onclick={() => format(key)} disabled={saving !== null}>
      Format
    </button>
    <button
      class="btn btn-sm btn-outline-secondary"
      onclick={() => revert(key)}
      disabled={!dirty(key) || saving !== null}
    >
      Revert
    </button>
    <button class="btn btn-sm btn-outline-secondary" onclick={() => copy(key)}>Copy</button>
    <span class="flex-grow-1"></span>
    <span class="text-muted small">{bytesLabel(key)} · {panel.text.split("\n").length} lines</span>
    <button
      class="btn btn-sm btn-primary"
      onclick={() => save(key)}
      disabled={saving !== null || !dirty(key)}
    >
      {saving === key ? "Saving..." : "Save to database"}
    </button>
  </div>

  {#if panel.wasNull}
    <p class="text-muted small mb-2">
      Stored value is <code>null</code> (not initialized). Shown as <code>{"{}"}</code>; saving will
      create the default document.
    </p>
  {/if}

  {#if key === "plan"}
    <p class="text-muted small mb-2">
      Shape: <code>{"{version, definitions, root, templates, transforms, input_layout}"}</code> · easier
      visual editing on the <a href={p("/documents/:id/plan", { params: { id } })}>Plan page</a>.
    </p>
  {:else}
    <p class="text-muted small mb-2">
      Shape: <code>{"{version, entries}"}</code> · easier visual editing on the
      <a href={p("/documents/:id/logging", { params: { id } })}>Log page</a>.
    </p>
  {/if}

  <textarea
    class="form-control font-monospace"
    rows="24"
    spellcheck="false"
    value={panel.text}
    oninput={(e) => (panels[key].text = e.currentTarget.value)}
  ></textarea>

  {#if panel.msg}
    <div class={`alert mt-2 mb-0 py-2 ${panel.msg.kind === "ok" ? "alert-success" : "alert-danger"}`}>
      <pre class="mb-0 small text-wrap">{panel.msg.text}</pre>
    </div>
  {/if}
{/snippet}

<div class="container-fluid">
  <div class="d-flex align-items-center gap-2 mb-3 flex-wrap">
    <a href={p("/documents/:id", { params: { id } })} class="btn btn-sm btn-outline-secondary">Back</a>
    <DocumentNav {id} />
    <span class="fw-semibold ms-2">{doc?.name ?? "Document"}</span>
    {#if anyDirty}
      <span class="badge text-bg-warning">Unsaved changes</span>
    {/if}
  </div>

  {#if loading}
    <p>Loading...</p>
  {:else if loadError}
    <div class="alert alert-danger">{loadError}</div>
  {:else}
    <div class="alert alert-warning py-2">
      <strong>Admin editor.</strong> These two JSONB documents are read and written directly. Saving is
      validated by the API (invalid structures are rejected), but there is no undo.
    </div>

    <ul class="nav nav-tabs">
      {#each tabs as t (t.key)}
        <li class="nav-item">
          <button
            type="button"
            class="nav-link"
            class:active={active === t.key}
            onclick={() => (active = t.key)}
          >
            {t.label}
            {#if dirty(t.key)}<span class="badge text-bg-warning ms-1">*</span>{/if}
          </button>
        </li>
      {/each}
    </ul>

    <div class="border border-top-0 p-3">
      {#if active === "plan"}
        {@render jsonPanel("plan", panels.plan)}
      {:else}
        {@render jsonPanel("execution", panels.execution)}
      {/if}
    </div>
  {/if}
</div>
