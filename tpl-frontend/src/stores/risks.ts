import { writable } from "svelte/store";
import type { Risk } from "../types";
import { risksApi } from "../lib/api";
import { getAllItems, putItem, deleteItem, getItem } from "../lib/db";

function createRiskStore() {
  const { subscribe, set, update } = writable<{ items: Risk[]; loading: boolean; error: string | null }>({
    items: [],
    loading: false,
    error: null,
  });

  async function load() {
    update((s) => ({ ...s, loading: true, error: null }));
    try {
      let items: Risk[];
      if (window.navigator.onLine) {
        items = await risksApi.list();
        for (const item of items) {
          await putItem("risks", item as unknown as Record<string, unknown>);
        }
      } else {
        items = await getAllItems<Risk>("risks");
      }
      update((s) => ({ ...s, items, loading: false }));
    } catch (e) {
      try {
        const items = await getAllItems<Risk>("risks");
        update((s) => ({ ...s, items, loading: false }));
      } catch {
        update((s) => ({ ...s, loading: false, error: String(e) }));
      }
    }
  }

  async function get(id: string): Promise<Risk | null> {
    try {
      if (window.navigator.onLine) {
        return await risksApi.get(id);
      }
      return (await getItem("risks", id)) as Risk | null;
    } catch {
      return (await getItem("risks", id)) as Risk | null;
    }
  }

  async function create(data: Partial<Risk>): Promise<Risk | null> {
    try {
      const result = await risksApi.create(data);
      await putItem("risks", result as unknown as Record<string, unknown>);
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
      await putItem("risks", result as unknown as Record<string, unknown>);
      update((s) => ({
        ...s,
        items: s.items.map((r) => (r.id === id ? result : r)),
      }));
      return result;
    } catch (e) {
      update((s) => ({ ...s, error: String(e) }));
      return null;
    }
  }

  async function remove(id: string): Promise<boolean> {
    try {
      await risksApi.delete(id);
      await deleteItem("risks", id);
      update((s) => ({ ...s, items: s.items.filter((r) => r.id !== id) }));
      return true;
    } catch (e) {
      update((s) => ({ ...s, error: String(e) }));
      return false;
    }
  }

  return { subscribe, load, get, create, update: updateItem, remove };
}

export const riskStore = createRiskStore();
