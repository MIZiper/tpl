import { writable } from "svelte/store";
import type { Document } from "../types/document";
import { documentsApi } from "../lib/api";

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
      update((s) => ({ ...s, loading: false, error: String(e) }));
    }
  }

  async function create(data: Partial<Document>): Promise<Document | null> {
    try {
      const result = await documentsApi.create(data);
      update((s) => ({ ...s, items: [...s.items, result] }));
      return result;
    } catch (e) {
      update((s) => ({ ...s, error: String(e) }));
      return null;
    }
  }

  async function updateItem(id: string, data: Partial<Document>): Promise<Document | null> {
    try {
      const result = await documentsApi.update(id, data);
      update((s) => ({
        ...s,
        items: s.items.map((d) => (d.id === id ? result : d)),
      }));
      return result;
    } catch (e) {
      update((s) => ({ ...s, error: String(e) }));
      return null;
    }
  }

  async function remove(id: string): Promise<boolean> {
    try {
      await documentsApi.delete(id);
      update((s) => ({ ...s, items: s.items.filter((d) => d.id !== id) }));
      return true;
    } catch (e) {
      update((s) => ({ ...s, error: String(e) }));
      return false;
    }
  }

  return { subscribe, load, create, update: updateItem, remove };
}

export const documentStore = createDocumentStore();
