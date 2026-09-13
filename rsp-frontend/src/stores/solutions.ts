import { writable } from "svelte/store";
import type { Solution } from "../types";
import { solutionsApi } from "../lib/api";

function createSolutionStore() {
  const { subscribe, update } = writable<{
    items: Solution[];
    loading: boolean;
    error: string | null;
  }>({ items: [], loading: false, error: null });

  async function load(search?: string) {
    update((s) => ({ ...s, loading: true, error: null }));
    try {
      const items = await solutionsApi.list(search);
      update((s) => ({ ...s, items, loading: false }));
    } catch (e) {
      update((s) => ({ ...s, loading: false, error: String(e) }));
    }
  }

  async function create(data: Partial<Solution>): Promise<Solution | null> {
    try {
      const result = await solutionsApi.create(data);
      update((s) => ({ ...s, items: [...s.items, result] }));
      return result;
    } catch (e) {
      update((s) => ({ ...s, error: String(e) }));
      return null;
    }
  }

  async function updateItem(id: string, data: Partial<Solution>): Promise<Solution | null> {
    try {
      const result = await solutionsApi.update(id, data);
      update((s) => ({ ...s, items: s.items.map((r) => (r.id === id ? result : r)) }));
      return result;
    } catch (e) {
      update((s) => ({ ...s, error: String(e) }));
      return null;
    }
  }

  async function remove(id: string): Promise<boolean> {
    try {
      await solutionsApi.delete(id);
      update((s) => ({ ...s, items: s.items.filter((r) => r.id !== id) }));
      return true;
    } catch (e) {
      update((s) => ({ ...s, error: String(e) }));
      return false;
    }
  }

  return { subscribe, load, create, update: updateItem, remove };
}

export const solutionStore = createSolutionStore();
