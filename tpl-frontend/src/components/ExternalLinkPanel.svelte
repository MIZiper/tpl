<script lang="ts">
  import { Badge, Button, Input } from "@sveltestrap/sveltestrap";
  import { externalLinksApi } from "../lib/api";
  import type { ExternalLink } from "../types/document";

  let {
    documentId,
    part,
    onchange,
  }: {
    documentId: string;
    part: "plan" | "log";
    onchange?: (state: { linked: boolean; frozen: boolean; status?: string; url?: string }) => void;
  } = $props();

  let link = $state<ExternalLink | null>(null);
  let reachable = $state(true);
  let loading = $state(false);
  let error = $state("");
  let pickerOpen = $state(false);
  let query = $state("");
  let candidates = $state<any[]>([]);
  let nodeId = $state("");

  function notify() {
    onchange?.({
      linked: !!link,
      frozen: !!link && (!reachable || link.frozen),
      status: link?.status,
      url: link?.external_url,
    });
  }

  async function refresh() {
    if (!documentId) return;
    loading = true;
    error = "";
    try {
      const res = await externalLinksApi.get(documentId, part);
      link = res.link;
      reachable = res.reachable !== false;
    } catch (e: any) {
      error = e?.message || "Failed to load link";
    } finally {
      loading = false;
      notify();
    }
  }

  async function search() {
    loading = true;
    error = "";
    try {
      const res = await externalLinksApi.candidates(documentId, part, query);
      candidates = res.items || [];
    } catch (e: any) {
      error = e?.message || "Failed to search TC";
    } finally {
      loading = false;
    }
  }

  async function linkNode(id: string) {
    if (!id.trim()) return;
    loading = true;
    error = "";
    try {
      const res = await externalLinksApi.link(documentId, part, id.trim());
      link = res.link;
      reachable = true;
      pickerOpen = false;
      candidates = [];
      nodeId = "";
    } catch (e: any) {
      error = e?.message || "Failed to link";
    } finally {
      loading = false;
      notify();
    }
  }

  async function unlink() {
    loading = true;
    error = "";
    try {
      await externalLinksApi.unlink(documentId, part);
      link = null;
      reachable = true;
    } catch (e: any) {
      error = e?.message || "Failed to unlink";
    } finally {
      loading = false;
      notify();
    }
  }

  $effect(() => {
    documentId;
    part;
    refresh();
  });
</script>

<div class="border rounded px-3 py-2 mb-2 bg-light">
  <div class="d-flex flex-wrap align-items-center gap-2">
    <span class="small fw-semibold">{part === "plan" ? "Plan" : "Log"} TC link</span>
    {#if link}
      <Badge color={link.frozen ? "warning" : "secondary"}>{link.status}</Badge>
      {#if !reachable}<Badge color="danger">state unavailable</Badge>{/if}
      <a class="small" href={link.external_url} target="_blank" rel="noreferrer">Open in TC</a>
      <Button size="sm" color="outline-secondary" onclick={refresh} disabled={loading}>Refresh</Button>
      <Button size="sm" color="outline-danger" onclick={unlink} disabled={loading || link.frozen}>Unlink</Button>
    {:else}
      <span class="small text-muted">Not linked</span>
      <Button size="sm" color="outline-primary" onclick={() => (pickerOpen = !pickerOpen)}>Link TC node</Button>
    {/if}
    {#if error}<span class="small text-danger">{error}</span>{/if}
  </div>

  {#if pickerOpen && !link}
    <div class="mt-2">
      <div class="d-flex gap-2">
        <Input placeholder="Search TC nodes" bind:value={query} onkeydown={(e) => { if (e.key === "Enter") search(); }} />
        <Button color="secondary" onclick={search} disabled={loading}>Search</Button>
      </div>
      <div class="d-flex gap-2 mt-2">
        <Input placeholder="Or paste TC node ID" bind:value={nodeId} />
        <Button color="primary" onclick={() => linkNode(nodeId)} disabled={loading}>Link</Button>
      </div>
      {#if candidates.length}
        <div class="list-group mt-2">
          {#each candidates as candidate}
            <button type="button" class="list-group-item list-group-item-action py-1" onclick={() => linkNode(candidate.id)}>
              <span class="fw-semibold">{candidate.title}</span>
              <span class="small text-muted ms-2">{candidate.status}</span>
              {#if candidate.source_system}<span class="badge text-bg-warning ms-2">linked elsewhere</span>{/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
