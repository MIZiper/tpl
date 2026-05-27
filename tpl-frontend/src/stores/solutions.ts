import { writable } from "svelte/store";
import type { Solution, SolutionWithDetails } from "../types";
import { solutionsApi } from "../lib/api";
import { getAllItems, putItem, deleteItem } from "../lib/db";

function createSolutionStore() {
  const { subscribe, set, update } = writable<{ items: Solution[]; loading: boolean; error: string | null }>({
    items: [],
    loading: false,
    error: null,
  });

  async function load() {
    update((s) => ({ ...s, loading: true, error: null }));
    try {
      let items: Solution[];
      if (window.navigator.onLine) {
        items = await solutionsApi.list();
        for (const item of items) {
          await putItem("solutions", item as unknown as Record<string, unknown>);
        }
      } else {
        items = await getAllItems<Solution>("solutions");
      }
      update((s) => ({ ...s, items, loading: false }));
    } catch (e) {
      try {
        const items = await getAllItems<Solution>("solutions");
        update((s) => ({ ...s, items, loading: false }));
      } catch {
        update((s) => ({ ...s, loading: false, error: String(e) }));
      }
    }
  }

  async function get(id: string): Promise<SolutionWithDetails | null> {
    try {
      return await solutionsApi.get(id);
    } catch {
      return null;
    }
  }

  async function create(data: Partial<Solution>): Promise<Solution | null> {
    try {
      const result = await solutionsApi.create(data);
      await putItem("solutions", result as unknown as Record<string, unknown>);
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
      await putItem("solutions", result as unknown as Record<string, unknown>);
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
      await deleteItem("solutions", id);
      update((s) => ({ ...s, items: s.items.filter((r) => r.id !== id) }));
      return true;
    } catch (e) {
      update((s) => ({ ...s, error: String(e) }));
      return false;
    }
  }

  return { subscribe, load, get, create, update: updateItem, remove };
}

export const solutionStore = createSolutionStore();
