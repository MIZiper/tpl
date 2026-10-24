import { writable } from "svelte/store";
import type { Document } from "../types/document";
import { documentsApi } from "../lib/api";

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function createDocumentStore() {
  const { subscribe, update } = writable<{
    items: Document[];
    loading: boolean;
    error: string | null;
  }>({ items: [], loading: false, error: null });

  async function load() {
    update((s) => ({ ...s, loading: true, error: null }));
    try {
      const items = await documentsApi.list();
      update((s) => ({ ...s, items, loading: false }));
    } catch (e) {
      update((s) => ({ ...s, loading: false, error: errorText(e) }));
    }
  }

  async function create(data: Partial<Document>): Promise<Document | null> {
    update((s) => ({ ...s, error: null }));
    try {
      const result = await documentsApi.create(data);
      update((s) => ({ ...s, items: [...s.items, result] }));
      return result;
    } catch (e) {
      update((s) => ({ ...s, error: errorText(e) }));
      return null;
    }
  }

  async function updateItem(id: string, data: Partial<Document>): Promise<Document | null> {
    update((s) => ({ ...s, error: null }));
    try {
      const result = await documentsApi.update(id, data);
      update((s) => ({
        ...s,
        items: s.items.map((d) => (d.id === id ? result : d)),
      }));
      return result;
    } catch (e) {
      update((s) => ({ ...s, error: errorText(e) }));
      return null;
    }
  }

  async function remove(id: string): Promise<boolean> {
    update((s) => ({ ...s, error: null }));
    try {
      await documentsApi.delete(id);
      update((s) => ({ ...s, items: s.items.filter((d) => d.id !== id) }));
      return true;
    } catch (e) {
      update((s) => ({ ...s, error: errorText(e) }));
      return false;
    }
  }

  function clearError() {
    update((s) => ({ ...s, error: null }));
  }

  return { subscribe, load, create, update: updateItem, remove, clearError };
}

export const documentStore = createDocumentStore();
