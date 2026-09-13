import { writable } from "svelte/store";
import type { Risk } from "../types";
import { risksApi } from "../lib/api";

function createRiskStore() {
  const { subscribe, update } = writable<{
    items: Risk[];
    loading: boolean;
    error: string | null;
  }>({ items: [], loading: false, error: null });

  async function load(search?: string, categoryId?: string) {
    update((s) => ({ ...s, loading: true, error: null }));
    try {
      const items = await risksApi.list(search, categoryId);
      update((s) => ({ ...s, items, loading: false }));
    } catch (e) {
      update((s) => ({ ...s, loading: false, error: String(e) }));
    }
  }

  async function create(data: Partial<Risk>): Promise<Risk | null> {
    try {
      const result = await risksApi.create(data);
      update((s) => ({ ...s, items: [...s.items, result] }));
      return result;
    } catch (e) {
      update((s) => ({ ...s, error: String(e) }));
      return null;
    }
  }

  async function updateItem(id: string, data: Partial<Risk>): Promise<Risk | null> {
    try {
      const result = await risksApi.update(id, data);
      update((s) => ({ ...s, items: s.items.map((r) => (r.id === id ? result : r)) }));
      return result;
    } catch (e) {
      update((s) => ({ ...s, error: String(e) }));
      return null;
    }
  }

  async function remove(id: string): Promise<boolean> {
    try {
      await risksApi.delete(id);
      update((s) => ({ ...s, items: s.items.filter((r) => r.id !== id) }));
      return true;
    } catch (e) {
      update((s) => ({ ...s, error: String(e) }));
      return false;
    }
  }

  return { subscribe, load, create, update: updateItem, remove };
}

export const riskStore = createRiskStore();
